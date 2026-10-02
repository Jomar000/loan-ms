import { dbClient, dbSchema } from '@loanms/database/d1'
import { AppError } from '@loanms/errors'
import { env } from 'cloudflare:workers'
import { and, eq, inArray } from 'drizzle-orm'
import type { Context } from 'hono'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { THonoInstance } from '../../src/types.js'
import {
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    markAuditTrailRecorded,
} from '../../src/utilities/helpers.js'
import {
    generateUniqueName,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

let db: ReturnType<typeof dbClient>
const counterKeys: string[] = []

beforeAll(() => {
    db = dbClient(env.LOANMSPUB_D1)
})

afterAll(async () => {
    if (counterKeys.length === 0) return

    await db
        .delete(dbSchema.auditTrail)
        .where(
            and(
                eq(
                    dbSchema.auditTrail.organizationId,
                    TEST_PRIMARY_ORGANIZATION_ID,
                ),
                inArray(dbSchema.auditTrail.description, counterKeys),
            ),
        )
    await db
        .delete(dbSchema.keyCounter)
        .where(
            and(
                eq(
                    dbSchema.keyCounter.organizationId,
                    TEST_PRIMARY_ORGANIZATION_ID,
                ),
                inArray(dbSchema.keyCounter.key, counterKeys),
            ),
        )
})

function createAuditedMutation() {
    const counterKey = generateUniqueName('__TEST-audit-batch')
    counterKeys.push(counterKey)
    const values: Record<string, unknown> = {
        dbSchema,
        session: null,
        user: null,
    }
    const ctx = {
        get: (key: string) => values[key],
        header: vi.fn(),
    } as unknown as Context<THonoInstance>
    const database = env.LOANMSPUB_D1
    const batch = vi.fn((statements: D1PreparedStatement[]) =>
        database.batch(statements),
    )

    const run = async (displayName: string, organizationId: string) => {
        const auditData = auditTrailLogger.prepare({
            action: 'verifyEmail',
            attribution: {
                actor: { displayName, type: 'system' },
                organizationId,
            },
            component: 'auth',
            description: counterKey,
        })
        await batch([
            database
                .prepare(
                    `INSERT INTO key_counter (
                         public_id, organization_id, key, counter
                     ) VALUES (?, ?, ?, 1)`,
                )
                .bind(uuidv7(), TEST_PRIMARY_ORGANIZATION_ID, counterKey),
            auditTrailAfterChangeStatement(ctx, auditData, database),
        ])
        markAuditTrailRecorded(ctx)
    }
    const readCounter = () =>
        db
            .select({ counter: dbSchema.keyCounter.counter })
            .from(dbSchema.keyCounter)
            .where(
                and(
                    eq(
                        dbSchema.keyCounter.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.keyCounter.key, counterKey),
                ),
            )
    const readAudit = () =>
        db
            .select({
                actorDisplayName: dbSchema.auditTrail.actorDisplayName,
                actorType: dbSchema.auditTrail.actorType,
                description: dbSchema.auditTrail.description,
            })
            .from(dbSchema.auditTrail)
            .where(eq(dbSchema.auditTrail.description, counterKey))

    return { batch, counterKey, ctx, readAudit, readCounter, run }
}

describe('Audit D1 batch consistency', () => {
    it('rejects invalid audit preparation before executing the business batch', async () => {
        const mutation = createAuditedMutation()
        const error = await mutation
            .run(' ', TEST_PRIMARY_ORGANIZATION_ID)
            .catch((cause: unknown) => cause)

        expect(error).toBeInstanceOf(AppError)
        expect(error).toMatchObject({
            code: 'AUDIT_TRAIL_RECORD_PREPARATION_FAILED',
            status: 500,
        })
        expect(mutation.batch).not.toHaveBeenCalled()
        expect(mutation.ctx.header).not.toHaveBeenCalled()
        expect(await mutation.readCounter()).toEqual([])
        expect(await mutation.readAudit()).toEqual([])
    })

    it('rolls back the business mutation when the audit violates its organization foreign key', async () => {
        const mutation = createAuditedMutation()
        await expect(
            mutation.run(
                '__TEST-Audit system',
                generateUniqueName('__TEST-missing-organization'),
            ),
        ).rejects.toThrow(/FOREIGN KEY constraint failed/i)

        expect(mutation.batch).toHaveBeenCalledOnce()
        expect(mutation.ctx.header).not.toHaveBeenCalled()
        expect(await mutation.readCounter()).toEqual([])
        expect(await mutation.readAudit()).toEqual([])
    })

    it('commits the business mutation and audit before marking the response', async () => {
        const mutation = createAuditedMutation()
        expect(mutation.ctx.header).not.toHaveBeenCalled()

        await mutation.run('__TEST-Audit system', TEST_PRIMARY_ORGANIZATION_ID)

        expect(mutation.batch).toHaveBeenCalledOnce()
        expect(await mutation.readCounter()).toEqual([{ counter: 1 }])
        expect(await mutation.readAudit()).toEqual([
            {
                actorDisplayName: '__TEST-Audit system',
                actorType: 'system',
                description: mutation.counterKey,
            },
        ])
        expect(mutation.ctx.header).toHaveBeenCalledExactlyOnceWith(
            'Audit-Event-Recorded',
            'true',
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
