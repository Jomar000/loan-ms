import { dbSchema } from '@loanms/database/d1'
import { AppError } from '@loanms/errors'
import { deriveRateLimitTarget } from '@loanms/rate-limit/transport'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { AUTH_RATE_LIMIT_POLICIES } from '../../../src/core/durableObject/policies/authRateLimit.js'
import {
    apiKeyHeaderGuard,
    apiKeyPermissionGuard,
    apiKeyRateLimitGuard,
    apiKeyVerificationGuard,
} from '../../../src/core/middleware/apiKey.js'
import type { THonoInstance } from '../../../src/types.js'
import { apiResponseErrorWrapper } from '../../../src/utilities/helpers.js'

const VALID_KEY = `bof_${'A'.repeat(64)}`
const CLIENT_NETWORK = '198.51.100.42'
const RATE_LIMIT_SECRET =
    'test-cf-do-rate-limit-secret-123456789012345678901234'

function createApp(options?: {
    assignable?: Record<string, string[]>
    principal?: {
        audience: string
        credentialId: string
        enabled: boolean
        organizationId: string
        permissions: Record<string, string[]>
        principalPublicId: string
    } | null
    verification?: {
        error?: { code: string; message: string }
        key: null | { id: string }
        valid: boolean
    }
}) {
    let rawClearedOnError = false
    const verifyApiKey = vi.fn().mockResolvedValue(
        options?.verification ?? {
            key: { id: 'credential-id' },
            valid: true,
        },
    )
    const principal =
        options?.principal === undefined
            ? {
                  audience: 'backoffice-v1',
                  credentialId: 'credential-id',
                  enabled: true,
                  organizationId: 'organization-id',
                  permissions: { 'api.backoffice': ['access'] },
                  principalPublicId: '019936e2-b837-7000-8000-000000000001',
              }
            : options.principal
    const limit = vi.fn().mockResolvedValue(principal ? [principal] : [])
    const dbClient = {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                innerJoin: vi.fn(() => ({
                    where: vi.fn(() => ({ limit })),
                })),
            })),
        })),
    }
    const app = new Hono<THonoInstance>()
        .onError((error, ctx) => {
            rawClearedOnError = ctx.get('presentedApiKey') === null
            if (!(error instanceof AppError)) throw error

            return apiResponseErrorWrapper(ctx, error.definition)
        })
        .use(async (ctx, next) => {
            ctx.set('requestId', 'test-request')
            ctx.set('correlationId', null)
            ctx.set('auth', { api: { verifyApiKey } } as never)
            ctx.set('dbClient', dbClient as never)
            ctx.set('dbSchema', dbSchema)
            ctx.set('acl', {
                apiKeyAssignablePermissions: options?.assignable ?? {
                    'api.backoffice': ['access'],
                },
                permissions: {},
                roles: {},
            })
            await next()
        })
        .use(apiKeyHeaderGuard('backoffice-v1'))
        .use(apiKeyVerificationGuard('backoffice-v1'))
        .get(
            '/',
            apiKeyPermissionGuard({ 'api.backoffice': ['access'] }),
            (ctx) =>
                ctx.json({
                    success: true,
                    actor: ctx.get('apiKeyActor'),
                    rawCleared: ctx.get('presentedApiKey') === null,
                }),
        )

    return {
        app,
        verifyApiKey,
        wasRawClearedOnError: () => rawClearedOnError,
    }
}

function createRateLimitApp(options?: {
    blockedScope?: string
    downstreamStatus?: 200 | 401 | 503
}) {
    const consume = vi.fn(async (input: { scope: string }) =>
        input.scope === options?.blockedScope
            ? {
                  allowed: false as const,
                  remaining: 0 as const,
                  retryAfterMs: 1_500,
              }
            : {
                  allowed: true as const,
                  remaining: 1,
                  reservationId: `reservation-${input.scope}`,
                  retryAfterMs: 0 as const,
              },
    )
    const release = vi.fn(
        async (input: { reservationId: string; scope: string }) => {
            void input
            return { ok: true as const }
        },
    )
    const getByName = vi.fn((name: string) => {
        void name
        return {
            consume,
            release,
            reset: vi.fn(async () => ({ ok: true as const })),
        }
    })
    const app = new Hono<THonoInstance>()
        .use(async (ctx, next) => {
            ctx.set('requestId', 'test-request')
            ctx.set('correlationId', 'test-correlation')
            ctx.set('authRateLimitDecision', null)
            ctx.set('ipAddress', CLIENT_NETWORK)
            await next()
        })
        .use(apiKeyHeaderGuard('backoffice-v1'))
        .use(apiKeyRateLimitGuard('backoffice-v1'))
        .get('/', (ctx) => {
            if (options?.downstreamStatus === 401) {
                return ctx.json({ success: false }, 401)
            }
            if (options?.downstreamStatus === 503) {
                return ctx.json({ success: false }, 503)
            }
            return ctx.json({ success: true })
        })

    return {
        app,
        consume,
        env: {
            CF_DO_RATE_LIMIT_SECRET: RATE_LIMIT_SECRET,
            ENVIRONMENT: 'test',
            LOANMSBOFC_DO_RL: { getByName },
        } as never,
        getByName,
        release,
    }
}

describe('apiKey middleware', () => {
    it('uses the reviewed rolling-minute quotas.', () => {
        expect(AUTH_RATE_LIMIT_POLICIES['v1-api-key-presented']).toMatchObject({
            scope: 'v1.api-key-presented',
            policy: {
                algorithm: 'sliding-window',
                limit: 600,
                windowMs: 60_000,
            },
        })
        expect(AUTH_RATE_LIMIT_POLICIES['v1-api-key-network']).toMatchObject({
            scope: 'v1.api-key-network',
            policy: {
                algorithm: 'sliding-window',
                limit: 3_000,
                windowMs: 60_000,
            },
        })
    })

    it('verifies a valid key once with the route audience.', async () => {
        const { app, verifyApiKey } = createApp()

        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            { ENVIRONMENT: 'test' } as never,
        )

        expect(response.status).toBe(200)
        expect(verifyApiKey).toHaveBeenCalledOnce()
        expect(verifyApiKey).toHaveBeenCalledWith({
            body: { configId: 'backoffice-v1', key: VALID_KEY },
        })
        await expect(response.json()).resolves.toMatchObject({
            actor: {
                audience: 'backoffice-v1',
                credentialId: 'credential-id',
                organizationId: 'organization-id',
                principalPublicId: '019936e2-b837-7000-8000-000000000001',
            },
            rawCleared: true,
        })
    })

    it.each([
        [
            'missing',
            undefined,
        ],
        [
            'malformed',
            'not-a-reviewed-key',
        ],
    ])(
        'rejects a %s credential with the generic unauthorized response before verification.',
        async (_label, key) => {
            const { app, verifyApiKey } = createApp()

            const response = await app.request(
                '/',
                key ? { headers: { 'x-api-key': key } } : undefined,
                { ENVIRONMENT: 'test' } as never,
            )

            expect(response.status).toBe(401)
            await expect(response.json()).resolves.toMatchObject({
                error: { code: 'UNAUTHORIZED', message: 'Invalid API key.' },
                success: false,
            })
            expect(verifyApiKey).not.toHaveBeenCalled()
        },
    )

    it('rejects invalid keys with the uniform unauthorized response.', async () => {
        const { app } = createApp({
            verification: { key: null, valid: false },
        })

        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            { ENVIRONMENT: 'test' } as never,
        )

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'UNAUTHORIZED', message: 'Invalid API key.' },
            success: false,
        })
    })

    it('returns a generic unavailable response when verification fails.', async () => {
        const { app, verifyApiKey, wasRawClearedOnError } = createApp()
        verifyApiKey.mockRejectedValueOnce(
            new Error('sensitive verifier infrastructure detail'),
        )

        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            { ENVIRONMENT: 'test' } as never,
        )

        expect(response.status).toBe(503)
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: 'API_KEY_UNAVAILABLE',
                message: 'API key verification is temporarily unavailable.',
            },
            success: false,
        })
        expect(verifyApiKey).toHaveBeenCalledOnce()
        expect(wasRawClearedOnError()).toBe(true)
    })

    it('removes permissions that are no longer assignable.', async () => {
        const { app } = createApp({ assignable: {} })

        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            { ENVIRONMENT: 'test' } as never,
        )

        expect(response.status).toBe(403)
    })

    it('rejects valid Better Auth credentials that are not linked to a principal.', async () => {
        const { app } = createApp({ principal: null })

        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            { ENVIRONMENT: 'test' } as never,
        )

        expect(response.status).toBe(401)
    })

    it('returns a uniform correlated response when plugin failures collapse to invalid.', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
        const { app } = createApp({
            verification: {
                error: {
                    code: 'INVALID_API_KEY',
                    message: 'Invalid API key.',
                },
                key: null,
                valid: false,
            },
        })

        try {
            const response = await app.request(
                '/',
                { headers: { 'x-api-key': VALID_KEY } },
                { ENVIRONMENT: 'test' } as never,
            )

            expect(response.status).toBe(401)
            await expect(response.json()).resolves.toMatchObject({
                error: { code: 'UNAUTHORIZED', message: 'Invalid API key.' },
                success: false,
            })
            expect(log).toHaveBeenCalledWith(
                expect.stringContaining(
                    '"type":"API_KEY_VERIFICATION","requestId":"test-request","correlationId":"N/A","environment":"test","outcome":"invalid"',
                ),
            )
        } finally {
            log.mockRestore()
        }
    })

    it('routes exact presented-key and network tuples through HMAC-only targets.', async () => {
        const { app, consume, env, getByName, release } = createRateLimitApp()
        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            env,
        )
        const presentedTarget = await deriveRateLimitTarget({
            key: {
                parts: [
                    'backoffice-v1',
                    VALID_KEY,
                ],
                scope: 'v1.api-key-presented',
            },
            policy: AUTH_RATE_LIMIT_POLICIES['v1-api-key-presented'].policy,
            secret: RATE_LIMIT_SECRET,
        })
        const networkTarget = await deriveRateLimitTarget({
            key: {
                parts: [
                    'backoffice-v1',
                    CLIENT_NETWORK,
                ],
                scope: 'v1.api-key-network',
            },
            policy: AUTH_RATE_LIMIT_POLICIES['v1-api-key-network'].policy,
            secret: RATE_LIMIT_SECRET,
        })

        expect(response.status).toBe(200)
        expect(getByName.mock.calls.map(([name]) => name)).toEqual([
            presentedTarget.objectName,
            networkTarget.objectName,
        ])
        expect(consume.mock.calls.map(([input]) => input)).toEqual([
            {
                keyPrefix: presentedTarget.keyPrefix,
                policy: AUTH_RATE_LIMIT_POLICIES['v1-api-key-presented'].policy,
                scope: 'v1.api-key-presented',
            },
            {
                keyPrefix: networkTarget.keyPrefix,
                policy: AUTH_RATE_LIMIT_POLICIES['v1-api-key-network'].policy,
                scope: 'v1.api-key-network',
            },
        ])
        expect(JSON.stringify(getByName.mock.calls)).not.toContain(VALID_KEY)
        expect(JSON.stringify(getByName.mock.calls)).not.toContain(
            CLIENT_NETWORK,
        )
        expect(release).not.toHaveBeenCalled()
    })

    it('compensates an accepted sibling when the network tuple blocks.', async () => {
        const { app, env, release } = createRateLimitApp({
            blockedScope: 'v1.api-key-network',
        })
        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            env,
        )

        expect(response.status).toBe(429)
        expect(response.headers.get('retry-after')).toBe('2')
        expect(release).toHaveBeenCalledOnce()
        expect(release).toHaveBeenCalledWith(
            expect.objectContaining({
                reservationId: 'reservation-v1.api-key-presented',
                scope: 'v1.api-key-presented',
            }),
        )
    })

    it('retains reservations for success and handled authorization failures.', async () => {
        const success = createRateLimitApp()
        const denied = createRateLimitApp({ downstreamStatus: 401 })

        const successResponse = await success.app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            success.env,
        )
        const deniedResponse = await denied.app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            denied.env,
        )

        expect(successResponse.status).toBe(200)
        expect(deniedResponse.status).toBe(401)
        expect(success.release).not.toHaveBeenCalled()
        expect(denied.release).not.toHaveBeenCalled()
    })

    it('releases both reservations after a downstream infrastructure failure.', async () => {
        const { app, env, release } = createRateLimitApp({
            downstreamStatus: 503,
        })
        const response = await app.request(
            '/',
            { headers: { 'x-api-key': VALID_KEY } },
            env,
        )

        expect(response.status).toBe(503)
        expect(release).toHaveBeenCalledTimes(2)
        expect(release.mock.calls.map(([input]) => input.scope)).toEqual(
            expect.arrayContaining([
                'v1.api-key-presented',
                'v1.api-key-network',
            ]),
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
