import { DurableObject } from 'cloudflare:workers'

import { RateLimitConfigurationError } from './errors.js'
import { assertRateLimitPolicy, type TRateLimitPolicy } from './policy.js'
import { assertRateLimitKeyPrefix, isRateLimitScope } from './transport.js'
import type {
    TRateLimitConsumeRequest,
    TRateLimitConsumeResponse,
    TRateLimitMutationResponse,
    TRateLimitReleaseRequest,
    TRateLimitResetRequest,
} from './types.js'

export type {
    TRateLimitConsumeRequest,
    TRateLimitConsumeResponse,
    TRateLimitMutationResponse,
    TRateLimitReleaseRequest,
    TRateLimitResetRequest,
} from './types.js'

type TRateLimitEnvironment = {
    ENVIRONMENT: string
}

type TLedgerSummary = {
    count: number
    earliestExpiry: number | null
    latestExpiry: number | null
}

type TRateLimitStorageOperation = 'alarm' | 'consume' | 'release'

type TRateLimitStorageContext = {
    keyPrefix: string
    scope: string
}

const assertRpcKey: (input: {
    keyPrefix: unknown
    policy: unknown
    scope: unknown
}) => asserts input is {
    keyPrefix: string
    policy: TRateLimitPolicy
    scope: string
} = (input) => {
    assertRateLimitKeyPrefix(input.keyPrefix)
    assertRateLimitPolicy(input.policy)
    if (!isRateLimitScope(input.scope)) {
        throw new RateLimitConfigurationError('Invalid rate-limit scope.')
    }
}

export class RateLimitBase<
    TEnvironment extends TRateLimitEnvironment,
> extends DurableObject<TEnvironment> {
    private testNowMs: number | null = null

    private get nowMs() {
        return this.testNowMs ?? Date.now()
    }

    private ensureSchema() {
        this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS rate_limit_reservation (
                id TEXT PRIMARY KEY,
                expires_at INTEGER NOT NULL
            )
        `)
        this.ctx.storage.sql.exec(`
            CREATE INDEX IF NOT EXISTS rate_limit_reservation_expiry_idx
            ON rate_limit_reservation (expires_at)
        `)
    }

    private prune(nowMs: number) {
        this.ctx.storage.sql.exec(
            'DELETE FROM rate_limit_reservation WHERE expires_at <= ?',
            nowMs,
        )
    }

    private summarize(
        operation: TRateLimitStorageOperation,
        context?: TRateLimitStorageContext,
    ): TLedgerSummary {
        const row = this.ctx.storage.sql
            .exec<{
                count: number
                earliest_expiry: number | null
                latest_expiry: number | null
            }>(
                `
                SELECT
                    COUNT(*) AS count,
                    MIN(expires_at) AS earliest_expiry,
                    MAX(expires_at) AS latest_expiry
                FROM rate_limit_reservation
            `,
            )
            .one()

        const validCount = Number.isSafeInteger(row.count) && row.count >= 0
        const validEmptySummary =
            row.count === 0 &&
            row.earliest_expiry === null &&
            row.latest_expiry === null
        const validPopulatedSummary =
            row.count > 0 &&
            Number.isSafeInteger(row.earliest_expiry) &&
            Number.isSafeInteger(row.latest_expiry) &&
            row.earliest_expiry! <= row.latest_expiry!

        if (!validCount || (!validEmptySummary && !validPopulatedSummary)) {
            console.error(
                JSON.stringify({
                    type: 'RATE_LIMIT_STORAGE_VALIDATION_FAILED',
                    operation,
                    ...(context && {
                        keyPrefix: context.keyPrefix,
                        scope: context.scope,
                    }),
                }),
            )
            throw new Error('Invalid persisted rate-limit state.')
        }

        return {
            count: row.count,
            earliestExpiry: row.earliest_expiry,
            latestExpiry: row.latest_expiry,
        }
    }

    private async scheduleCleanup(latestExpiry: number | null) {
        if (latestExpiry === null) {
            await this.deleteStoredState()
            return
        }

        await this.ctx.storage.setAlarm(latestExpiry)
    }

    private async deleteStoredState() {
        this.ctx.storage.sql.exec('DROP TABLE IF EXISTS rate_limit_reservation')
        await this.ctx.storage.deleteAll()
    }

    private logDecision(input: {
        decision: 'allow' | 'block'
        keyPrefix: string
        limit: number
        remaining: number
        scope: string
    }) {
        console.log(JSON.stringify({ type: 'RATE_LIMIT_DECISION', ...input }))
    }

    async consume(
        input: TRateLimitConsumeRequest,
    ): Promise<TRateLimitConsumeResponse> {
        assertRpcKey(input)
        this.ensureSchema()
        const nowMs = this.nowMs
        this.prune(nowMs)
        const summary = this.summarize('consume', input)

        if (summary.count >= input.policy.limit) {
            const retryAfterMs = Math.max(1, summary.earliestExpiry! - nowMs)
            this.logDecision({
                decision: 'block',
                keyPrefix: input.keyPrefix,
                limit: input.policy.limit,
                remaining: 0,
                scope: input.scope,
            })

            return { allowed: false, remaining: 0, retryAfterMs }
        }

        const reservationId = crypto.randomUUID()
        const expiresAt = nowMs + input.policy.windowMs
        if (!Number.isSafeInteger(expiresAt)) {
            throw new RateLimitConfigurationError(
                'Invalid rate-limit reservation expiry.',
            )
        }

        this.ctx.storage.sql.exec(
            `INSERT INTO rate_limit_reservation (id, expires_at)
             VALUES (?, ?)`,
            reservationId,
            expiresAt,
        )
        await this.scheduleCleanup(
            Math.max(summary.latestExpiry ?? expiresAt, expiresAt),
        )

        const remaining = input.policy.limit - summary.count - 1
        this.logDecision({
            decision: 'allow',
            keyPrefix: input.keyPrefix,
            limit: input.policy.limit,
            remaining,
            scope: input.scope,
        })

        return { allowed: true, remaining, reservationId, retryAfterMs: 0 }
    }

    async release(
        input: TRateLimitReleaseRequest,
    ): Promise<TRateLimitMutationResponse> {
        assertRpcKey(input)
        if (!input.reservationId) {
            throw new RateLimitConfigurationError(
                'Invalid rate-limit reservation.',
            )
        }

        this.ensureSchema()
        this.prune(this.nowMs)
        this.ctx.storage.sql.exec(
            'DELETE FROM rate_limit_reservation WHERE id = ?',
            input.reservationId,
        )
        await this.scheduleCleanup(
            this.summarize('release', input).latestExpiry,
        )

        return { ok: true }
    }

    async reset(
        input: TRateLimitResetRequest,
    ): Promise<TRateLimitMutationResponse> {
        assertRpcKey(input)
        this.ensureSchema()
        this.ctx.storage.sql.exec('DELETE FROM rate_limit_reservation')
        await this.deleteStoredState()

        return { ok: true }
    }

    async alarm() {
        this.ensureSchema()
        this.prune(this.nowMs)
        await this.scheduleCleanup(this.summarize('alarm').latestExpiry)
    }

    /** Set the deterministic clock only in an isolated Worker test runtime. */
    setTestNowForTesting(nowMs: number | null) {
        if (this.env.ENVIRONMENT !== 'test') {
            throw new Error('The rate-limit clock is immutable.')
        }
        if (nowMs !== null && !Number.isSafeInteger(nowMs)) {
            throw new Error('Invalid rate-limit test clock.')
        }

        this.testNowMs = nowMs
    }
}
