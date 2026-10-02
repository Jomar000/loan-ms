import { dbClient, dbSchema } from '@hyperion/database/d1'
import { deriveRateLimitTarget } from '@hyperion/rate-limit/transport'
import type { TApiResponseError, TApiResponseOk } from '@hyperion/types/shared'
import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { and, count, eq, like } from 'drizzle-orm'
import { Hono } from 'hono'
import { requestId } from 'hono/request-id'
import { v7 as uuidv7 } from 'uuid'
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

import {
    AUTH_RATE_LIMIT_POLICIES,
    type TAuthRateLimitAction,
} from '../../src/core/durableObject/policies/authRateLimit.js'
import {
    normalizeAuthRateLimitClientNetwork,
    normalizeAuthRateLimitIdentity,
    resolveTrustedClientIpAddress,
} from '../../src/core/middleware/authRateLimit.js'
import type { THonoInstance } from '../../src/types.js'
import {
    TEST_AUTH_MUTABLE_EMAIL,
    TEST_AUTH_MUTABLE_USERNAME,
    TEST_AUTH_MUTABLE_USER_ID,
    TEST_MEMBER_EMAIL,
    TEST_MEMBER_USER_ID,
    TEST_MEMBER_USER_PUBLIC_ID,
    TEST_OWNER_EMAIL,
    TEST_OWNER_USER_ID,
    TEST_OWNER_USER_PUBLIC_ID,
    TEST_OWNER_USERNAME,
    TEST_PRIMARY_ORGANIZATION_SLUG,
} from '../utilities.js'

const CLIENT_IP = '198.51.100.42'
let db: ReturnType<typeof dbClient>
let app: Hono<THonoInstance>

const authTestControl = vi.hoisted(() => ({
    aclBuilderCalls: 0,
    aclBuilderFailure: false,
    authCalls: 0,
    auditPreparationFailure: false,
    changePasswordResponseStatus: null as number | null,
    passwordResetEmailFailure: false,
    passwordResetEmailSent: vi.fn(),
    resetPasswordResponseStatus: null as number | null,
    signInResponseStatus: null as number | null,
    verifyEmailResponseStatus: null as number | null,
}))

vi.mock('../../src/utilities/helpers.js', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../../src/utilities/helpers.js')>()
    const { AppError, catalog } = await import('@hyperion/errors')
    const originalPrepare = actual.auditTrailLogger.prepare

    actual.auditTrailLogger.prepare = (data) => {
        if (
            authTestControl.auditPreparationFailure &&
            (data.action === 'resetRequest' ||
                data.action === 'password.resetRequest')
        ) {
            throw new AppError(catalog.auditTrailRecordPreparationFailed)
        }
        return originalPrepare(data)
    }

    return actual
})

vi.mock('../../src/auth/acl.js', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../../src/auth/acl.js')>()

    return {
        ...actual,
        aclBuilder: (...args: Parameters<typeof actual.aclBuilder>) => {
            authTestControl.aclBuilderCalls += 1
            if (authTestControl.aclBuilderFailure) {
                throw new Error('Simulated ACL initialization failure.')
            }
            return actual.aclBuilder(...args)
        },
    }
})

vi.mock('../../src/auth/index.js', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../../src/auth/index.js')>()

    return {
        ...actual,
        auth: async (options: Parameters<typeof actual.auth>[0]) => {
            authTestControl.authCalls += 1
            const instance = await actual.auth({
                ...options,
                onPasswordResetEmailSent: async () => {
                    authTestControl.passwordResetEmailSent()

                    if (authTestControl.passwordResetEmailFailure) {
                        throw new Error(
                            'Simulated password reset email failure.',
                        )
                    }

                    await options.onPasswordResetEmailSent?.()
                },
            })
            const signInUsername = instance.api.signInUsername.bind(
                instance.api,
            )
            const changePassword = instance.api.changePassword.bind(
                instance.api,
            )
            const resetPassword = instance.api.resetPassword.bind(instance.api)
            const verifyEmail = instance.api.verifyEmail.bind(instance.api)

            const replaceWithControlledResponse = (
                name: 'changePassword' | 'resetPassword' | 'verifyEmail',
                original: (...args: never[]) => unknown,
                getStatus: () => number | null,
            ) => {
                Object.defineProperty(instance.api, name, {
                    configurable: true,
                    value: (...args: never[]) => {
                        const status = getStatus()
                        if (status !== null) {
                            return Promise.resolve(
                                new Response(null, { status }),
                            )
                        }
                        return Reflect.apply(original, undefined, args)
                    },
                })
            }

            replaceWithControlledResponse(
                'changePassword',
                changePassword as (...args: never[]) => unknown,
                () => authTestControl.changePasswordResponseStatus,
            )
            replaceWithControlledResponse(
                'resetPassword',
                resetPassword as (...args: never[]) => unknown,
                () => authTestControl.resetPasswordResponseStatus,
            )
            replaceWithControlledResponse(
                'verifyEmail',
                verifyEmail as (...args: never[]) => unknown,
                () => authTestControl.verifyEmailResponseStatus,
            )

            Object.defineProperty(instance.api, 'signInUsername', {
                configurable: true,
                value: (...args: unknown[]) => {
                    const status = authTestControl.signInResponseStatus

                    if (status !== null) {
                        return Promise.resolve(new Response(null, { status }))
                    }

                    return Reflect.apply(signInUsername, undefined, args)
                },
            })

            return instance
        },
    }
})

beforeAll(async () => {
    vi.resetModules()
    const { apiRoute } = await import('../../src/core/api/index.js')
    const { errorHandler } = await import('../../src/core/errorHandler.js')

    apiRoute.onError(errorHandler)
    app = new Hono<THonoInstance>()
        .onError(errorHandler)
        .use(
            requestId({
                headerName: '',
                generator: () => uuidv7(),
            }),
        )
        .route('/api', apiRoute)
    db = dbClient(env.HYPERIONBOFC_D1)
})

beforeEach(() => {
    authTestControl.aclBuilderFailure = false
    authTestControl.auditPreparationFailure = false
    authTestControl.changePasswordResponseStatus = null
    authTestControl.passwordResetEmailFailure = false
    authTestControl.passwordResetEmailSent.mockClear()
    authTestControl.resetPasswordResponseStatus = null
    authTestControl.signInResponseStatus = null
    authTestControl.verifyEmailResponseStatus = null
})

afterAll(async () => {})

const createRateLimitStub = async (
    action: TAuthRateLimitAction,
    keyParts: readonly string[],
) => {
    const definition = AUTH_RATE_LIMIT_POLICIES[action]
    const target = await deriveRateLimitTarget({
        key: { parts: keyParts, scope: definition.scope },
        policy: definition.policy,
        secret: env.CF_DO_RATE_LIMIT_SECRET,
    })

    return {
        definition,
        keyPrefix: target.keyPrefix,
        stub: env.HYPERIONBOFC_DO_RL.getByName(target.objectName),
    }
}

const consume = async (
    action: TAuthRateLimitAction,
    keyParts: readonly string[],
    times: number,
) => {
    const target = await createRateLimitStub(action, keyParts)

    const results = await Promise.all(
        Array.from({ length: times }, () =>
            target.stub.consume({
                keyPrefix: target.keyPrefix,
                policy: target.definition.policy,
                scope: target.definition.scope,
            }),
        ),
    )
    expect(
        results.every((result: { allowed: boolean }) => result.allowed),
    ).toBe(true)

    return target.stub
}

const signIn = (
    accountId: string,
    password: string,
    ipAddress: string,
    credentialType: 'email' | 'username' = 'username',
    ipv6Address?: string,
) =>
    app.request(
        `/api/auth/signIn/${credentialType}`,
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': ipAddress,
                ...(ipv6Address === undefined
                    ? {}
                    : { 'cf-connecting-ipv6': ipv6Address }),
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                accountId,
                password,
            }),
        },
        env,
    )

const passwordResetRowsWhere = (userId: string) =>
    and(
        eq(dbSchema.verification.value, userId),
        like(dbSchema.verification.identifier, 'reset-password:%'),
    )

const countPasswordResetRows = async (userId: string) => {
    const [row] = await db
        .select({ count: count() })
        .from(dbSchema.verification)
        .where(passwordResetRowsWhere(userId))

    return row?.count ?? 0
}

const deletePasswordResetRows = (userId: string) =>
    db.delete(dbSchema.verification).where(passwordResetRowsWhere(userId))

const countPasswordResetAudits = async () => {
    const [row] = await db
        .select({ count: count() })
        .from(dbSchema.auditTrail)
        .where(
            and(
                eq(dbSchema.auditTrail.component, 'auth'),
                eq(dbSchema.auditTrail.action, 'password.resetRequest'),
            ),
        )

    return row?.count ?? 0
}

const requestPasswordReset = (email: string, ipAddress: string) =>
    app.request(
        '/api/auth/password/resetRequest',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': ipAddress,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ email }),
        },
        env,
    )

const resetPassword = (token: string, ipAddress: string) =>
    app.request(
        '/api/auth/password/reset',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': ipAddress,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                token,
                newPassword: 'R3set@P@ssw0rd5678',
            }),
        },
        env,
    )

const verifyEmail = (token: string, ipAddress: string) =>
    app.request(
        '/api/auth/verifyEmail',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': ipAddress,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ token }),
        },
        env,
    )

const changePassword = (
    cookie: string,
    currentPassword: string,
    newPassword: string,
    ipAddress: string,
) =>
    app.request(
        '/api/auth/password/change',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': ipAddress,
                'content-type': 'application/json',
                cookie,
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        },
        env,
    )

const countAdminPasswordResetAudits = async () => {
    const [row] = await db
        .select({ count: count() })
        .from(dbSchema.auditTrail)
        .where(
            and(
                eq(dbSchema.auditTrail.component, 'admin.user.password'),
                eq(dbSchema.auditTrail.action, 'resetRequest'),
            ),
        )

    return row?.count ?? 0
}

describe('Authentication rate-limit route integration', () => {
    it('normalizes trusted client networks and fails closed for invalid input.', async () => {
        expect(normalizeAuthRateLimitClientNetwork('198.51.100.42')).toBe(
            '198.51.100.42',
        )
        expect(normalizeAuthRateLimitClientNetwork('::ffff:192.0.2.42')).toBe(
            '192.0.2.42',
        )
        expect(normalizeAuthRateLimitClientNetwork('2001:db8:0:1::42')).toBe(
            '2001:0db8:0000:0001::/64',
        )
        expect(() => normalizeAuthRateLimitClientNetwork('N/A')).toThrow()
        expect(
            resolveTrustedClientIpAddress('not-an-ip', '198.51.100.43'),
        ).toBe('198.51.100.43')
        expect(resolveTrustedClientIpAddress('', '198.51.100.44')).toBe(
            '198.51.100.44',
        )
        expect(
            resolveTrustedClientIpAddress('2001:db8:42:84::7', '240.0.0.84'),
        ).toBe('2001:db8:42:84::7')
        expect(resolveTrustedClientIpAddress('not-an-ip', 'also-invalid')).toBe(
            'N/A',
        )

        const fallbackResponse = await signIn(
            TEST_OWNER_USERNAME,
            'Wr0ng@P@ssword1234',
            '198.51.100.43',
            'username',
            'not-an-ip',
        )
        expect(fallbackResponse.status).toBe(422)

        const emptyIpv6Response = await signIn(
            TEST_OWNER_USERNAME,
            'Wr0ng@P@ssword1234',
            '198.51.100.44',
            'username',
            '',
        )
        expect(emptyIpv6Response.status).toBe(422)

        const response = await signIn(
            TEST_OWNER_USERNAME,
            'P@ssw0rd1234',
            'not-an-ip',
        )

        expect(response.status).toBe(503)
        expect((await response.json<TApiResponseError>()).error.code).toBe(
            'AUTH_RATE_LIMIT_CONFIGURATION_ERROR',
        )

        const missingResponse = await signIn(
            TEST_OWNER_USERNAME,
            'P@ssw0rd1234',
            '',
        )

        expect(missingResponse.status).toBe(503)
        expect(
            (await missingResponse.json<TApiResponseError>()).error.code,
        ).toBe('AUTH_RATE_LIMIT_CONFIGURATION_ERROR')

        const pseudoIpv4Identity = `username:${normalizeAuthRateLimitIdentity(TEST_OWNER_USERNAME)}`
        const connectingIpv6 = '2001:db8:42:84::7'
        await consume(
            'sign-in-identity-network',
            [
                pseudoIpv4Identity,
                normalizeAuthRateLimitClientNetwork(connectingIpv6),
            ],
            5,
        )
        const pseudoIpv4Response = await signIn(
            TEST_OWNER_USERNAME,
            'Wr0ng@P@ssword1234',
            '240.0.0.84',
            'username',
            connectingIpv6,
        )

        expect(pseudoIpv4Response.status).toBe(429)
    })

    it('rejects oversized email and malformed tokens before ACL or Better Auth initialization.', async () => {
        const aclCallsBefore = authTestControl.aclBuilderCalls
        const authCallsBefore = authTestControl.authCalls
        const requests = [
            app.request(
                '/api/auth/password/resetRequest',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'cf-connecting-ip': '192.0.2.210',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: `${'a'.repeat(246)}@test.app`,
                    }),
                },
                env,
            ),
            resetPassword('non-ascii-token-é', '192.0.2.211'),
            verifyEmail('token/with/slashes', '192.0.2.212'),
            verifyEmail('a'.repeat(513), '192.0.2.213'),
        ]
        const responses = await Promise.all(requests)

        for (const response of responses) {
            expect(response.status).toBe(400)
            expect((await response.json<TApiResponseError>()).error.code).toBe(
                'DATA_VALIDATION',
            )
        }
        expect(authTestControl.aclBuilderCalls).toBe(aclCallsBefore)
        expect(authTestControl.authCalls).toBe(authCallsBefore)
    })

    it('defers auth context for CAPTCHA rejection, suppression, and prefilled blocks.', async () => {
        const aclCallsBefore = authTestControl.aclBuilderCalls
        const authCallsBefore = authTestControl.authCalls
        const captchaResponse = await app.request(
            '/api/auth/signIn/username',
            {
                method: 'POST',
                headers: {
                    origin: env.URL_FRONTEND,
                    'cf-connecting-ip': '198.51.100.210',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                    accountId: '__test_captcha_deferred_user',
                    password: 'Wr0ng@P@ssword1234',
                }),
            },
            { ...env, CF_TURNSTILE_BYPASS: 0 },
        )
        expect(captchaResponse.status).toBe(400)

        const suppressedEmail = 'suppressed.context@test.hyperion.app'
        await consume(
            'password-reset-identity-minute',
            [normalizeAuthRateLimitIdentity(suppressedEmail)],
            1,
        )
        expect(
            (await requestPasswordReset(suppressedEmail, '192.0.2.214')).status,
        ).toBe(200)

        const blockedIdentity = 'username:__test_prefilled_context_user'
        await consume(
            'sign-in-identity-network',
            [
                blockedIdentity,
                '198.51.100.214',
            ],
            5,
        )
        expect(
            (
                await signIn(
                    '__test_prefilled_context_user',
                    'Wr0ng@P@ssword1234',
                    '198.51.100.214',
                )
            ).status,
        ).toBe(429)

        expect(authTestControl.aclBuilderCalls).toBe(aclCallsBefore)
        expect(authTestControl.authCalls).toBe(authCallsBefore)
    })

    it('returns distinct fail-closed responses for invalid secrets and unavailable namespaces.', async () => {
        const invalidSecretResponse = await app.request(
            '/api/auth/password/resetRequest',
            {
                method: 'POST',
                headers: {
                    origin: env.URL_FRONTEND,
                    'cf-connecting-ip': '192.0.2.215',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    email: 'invalid.secret@test.hyperion.app',
                }),
            },
            { ...env, CF_DO_RATE_LIMIT_SECRET: '' },
        )
        expect(invalidSecretResponse.status).toBe(503)
        expect(
            (await invalidSecretResponse.json<TApiResponseError>()).error.code,
        ).toBe('AUTH_RATE_LIMIT_CONFIGURATION_ERROR')

        const unavailableNamespace = {
            getByName: () => ({
                consume: () => Promise.reject(new Error('Unavailable DO.')),
            }),
        } as unknown as typeof env.HYPERIONBOFC_DO_RL
        const unavailableResponse = await app.request(
            '/api/auth/password/resetRequest',
            {
                method: 'POST',
                headers: {
                    origin: env.URL_FRONTEND,
                    'cf-connecting-ip': '192.0.2.216',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    email: 'unavailable.namespace@test.hyperion.app',
                }),
            },
            { ...env, HYPERIONBOFC_DO_RL: unavailableNamespace },
        )
        expect(unavailableResponse.status).toBe(503)
        expect(
            (await unavailableResponse.json<TApiResponseError>()).error.code,
        ).toBe('AUTH_RATE_LIMIT_UNAVAILABLE')
    })

    it('releases sign-in reservations after Better Auth returns a 5xx response.', async () => {
        authTestControl.signInResponseStatus = 503

        for (let index = 0; index < 6; index += 1) {
            const response = await signIn(
                TEST_OWNER_USERNAME,
                'P@ssw0rd1234',
                '203.0.113.142',
            )
            const data = await response.json<TApiResponseError>()

            expect(response.status).toBe(503)
            expect(data.error.code).toBe('AUTHENTICATION_UNAVAILABLE')
        }
    })

    it('releases sign-in reservations when downstream auth context initialization fails.', async () => {
        authTestControl.aclBuilderFailure = true

        for (let index = 0; index < 6; index += 1) {
            const response = await signIn(
                '__test_context_failure_user',
                'Wr0ng@P@ssword1234',
                '203.0.113.143',
            )
            const data = await response.json<TApiResponseError>()

            expect(response.status).toBe(503)
            expect(data.error.code).toBe('AUTHENTICATION_UNAVAILABLE')
        }
    })

    it('applies equivalent email sign-in behavior and retains a real wrong-password attempt.', async () => {
        const emailSuccess = await signIn(
            TEST_OWNER_EMAIL,
            'P@ssw0rd1234',
            '198.51.100.143',
            'email',
        )
        expect(emailSuccess.status).toBe(200)

        const identity = `username:${normalizeAuthRateLimitIdentity(TEST_OWNER_USERNAME)}`
        const network = '198.51.100.144'
        await consume(
            'sign-in-identity-network',
            [
                identity,
                network,
            ],
            4,
        )

        const invalid = await signIn(
            TEST_OWNER_USERNAME,
            'Wr0ng@P@ssword1234',
            network,
        )
        expect(invalid.status).toBe(422)

        const blocked = await signIn(
            TEST_OWNER_USERNAME,
            'Wr0ng@P@ssword1234',
            network,
        )
        expect(blocked.status).toBe(429)
        expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
        expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(
            600,
        )
    })

    it('retains invalid attempts, blocks with Retry-After, and resets both sign-in buckets on success.', async () => {
        const identity = `username:${normalizeAuthRateLimitIdentity(TEST_OWNER_USERNAME)}`
        const network = normalizeAuthRateLimitClientNetwork(CLIENT_IP)
        const identityStub = await consume('sign-in-identity', [identity], 4)
        const identityNetworkStub = await consume(
            'sign-in-identity-network',
            [
                identity,
                network,
            ],
            4,
        )

        const success = await signIn(
            TEST_OWNER_USERNAME,
            'P@ssw0rd1234',
            CLIENT_IP,
        )
        expect(success.status).toBe(200)

        for (const stub of [
            identityStub,
            identityNetworkStub,
        ]) {
            const tableCount = await runInDurableObject(
                stub,
                (_instance, state) =>
                    state.storage.sql
                        .exec<{ count: number }>(
                            `
                            SELECT COUNT(*) AS count
                            FROM sqlite_master
                            WHERE type = 'table'
                              AND name = 'rate_limit_reservation'
                        `,
                        )
                        .one().count,
            )
            expect(tableCount).toBe(0)
        }

        await consume(
            'sign-in-identity-network',
            [
                identity,
                network,
            ],
            5,
        )
        const blocked = await signIn(
            TEST_OWNER_USERNAME,
            'Wr0ng@P@ssword1234',
            CLIENT_IP,
        )
        const blockedData = await blocked.json<TApiResponseError>()

        expect(blocked.status).toBe(429)
        expect(blocked.headers.get('retry-after')).toBe('600')
        expect(blockedData.error.code).toBe('RATE_LIMITED')

        const missingIdentity = '__gate2_missing_public_user'
        const missingIp = '203.0.113.42'
        for (let index = 0; index < 5; index += 1) {
            expect(
                (await signIn(missingIdentity, 'Wr0ng@P@ssword1234', missingIp))
                    .status,
            ).toBe(422)
        }

        const retained = await signIn(
            missingIdentity,
            'Wr0ng@P@ssword1234',
            missingIp,
        )
        expect(retained.status).toBe(429)
        expect((await retained.json<TApiResponseError>()).error.code).toBe(
            'RATE_LIMITED',
        )
    })

    it('enforces the identity-only sign-in bound across changing client networks.', async () => {
        const accountId = '__test_distributed_guessing_user'
        const identity = `username:${normalizeAuthRateLimitIdentity(accountId)}`
        await consume('sign-in-identity', [identity], 20)

        const response = await signIn(
            accountId,
            'Wr0ng@P@ssword1234',
            '203.0.113.145',
        )

        expect(response.status).toBe(429)
        expect(response.headers.get('retry-after')).toBe('600')
    })

    it('enforces reset identity-hour and network-hour suppression independently.', async () => {
        const identityEmail = 'identity.hour@test.hyperion.app'
        const networkEmail = 'network.hour@test.hyperion.app'
        const network = '192.0.2.145'
        const aclCallsBefore = authTestControl.aclBuilderCalls
        const authCallsBefore = authTestControl.authCalls

        await consume(
            'password-reset-identity-hour',
            [normalizeAuthRateLimitIdentity(identityEmail)],
            3,
        )
        await consume('password-reset-network-hour', [network], 10)

        expect(
            (await requestPasswordReset(identityEmail, '192.0.2.146')).status,
        ).toBe(200)
        expect((await requestPasswordReset(networkEmail, network)).status).toBe(
            200,
        )
        expect(authTestControl.aclBuilderCalls).toBe(aclCallsBefore)
        expect(authTestControl.authCalls).toBe(authCallsBefore)
    })

    it('returns identical reset responses and creates no row for a suppressed send.', async () => {
        const before = await countPasswordResetRows(TEST_MEMBER_USER_ID)
        const auditsBefore = await countPasswordResetAudits()

        try {
            const accepted = await requestPasswordReset(
                TEST_MEMBER_EMAIL,
                '192.0.2.42',
            )
            const acceptedBody = await accepted.json<TApiResponseOk<null>>()
            const afterAccepted =
                await countPasswordResetRows(TEST_MEMBER_USER_ID)
            const auditsAfterAccepted = await countPasswordResetAudits()
            const suppressed = await requestPasswordReset(
                TEST_MEMBER_EMAIL,
                '192.0.2.42',
            )
            const suppressedBody = await suppressed.json<TApiResponseOk<null>>()
            const afterSuppressed =
                await countPasswordResetRows(TEST_MEMBER_USER_ID)
            const auditsAfterSuppressed = await countPasswordResetAudits()

            expect(accepted.status).toBe(200)
            expect(suppressed.status).toBe(200)
            expect(suppressedBody).toEqual(acceptedBody)
            expect(
                authTestControl.passwordResetEmailSent,
            ).toHaveBeenCalledOnce()
            expect(afterAccepted).toBe(before + 1)
            expect(afterSuppressed).toBe(afterAccepted)
            expect(auditsAfterAccepted).toBe(auditsBefore + 1)
            expect(auditsAfterSuppressed).toBe(auditsAfterAccepted)
        } finally {
            await deletePasswordResetRows(TEST_MEMBER_USER_ID)
        }
    })

    it('releases password-reset reservations after email delivery fails.', async () => {
        authTestControl.passwordResetEmailFailure = true
        const rowsBefore = await countPasswordResetRows(
            TEST_AUTH_MUTABLE_USER_ID,
        )
        const auditsBefore = await countPasswordResetAudits()

        try {
            for (let index = 0; index < 6; index += 1) {
                const response = await requestPasswordReset(
                    TEST_AUTH_MUTABLE_EMAIL,
                    '192.0.2.142',
                )
                const data = await response.json<TApiResponseError>()

                expect(response.status).toBe(503)
                expect(data.error.code).toBe('AUTHENTICATION_UNAVAILABLE')
            }

            expect(
                authTestControl.passwordResetEmailSent,
            ).toHaveBeenCalledTimes(6)
            expect(
                await countPasswordResetRows(TEST_AUTH_MUTABLE_USER_ID),
            ).toBe(rowsBefore)
            expect(await countPasswordResetAudits()).toBe(auditsBefore)
        } finally {
            authTestControl.passwordResetEmailFailure = false
            await deletePasswordResetRows(TEST_AUTH_MUTABLE_USER_ID)
        }
    })

    it('retains invalid reset and verification token attempts and returns standard 429 responses.', async () => {
        const resetToken = '__TEST_INVALID_RESET_TOKEN_BACKOFFICE'
        const verificationToken = '__TEST_INVALID_VERIFY_TOKEN_BACKOFFICE'

        await consume('password-reset-redemption-token', [resetToken], 4)
        expect((await resetPassword(resetToken, '192.0.2.150')).status).toBe(
            422,
        )
        const blockedReset = await resetPassword(resetToken, '192.0.2.150')
        expect(blockedReset.status).toBe(429)
        expect(blockedReset.headers.get('retry-after')).toBe('600')
        expect((await blockedReset.json<TApiResponseError>()).error.code).toBe(
            'RATE_LIMITED',
        )

        await consume('email-verification-token', [verificationToken], 4)
        expect(
            (await verifyEmail(verificationToken, '192.0.2.151')).status,
        ).toBe(422)
        const blockedVerification = await verifyEmail(
            verificationToken,
            '192.0.2.151',
        )
        expect(blockedVerification.status).toBe(429)
        expect(blockedVerification.headers.get('retry-after')).toBe('600')
        expect(
            (await blockedVerification.json<TApiResponseError>()).error.code,
        ).toBe('RATE_LIMITED')
    })

    it('enforces reset and verification network policies independently from token keys.', async () => {
        const resetNetwork = '192.0.2.152'
        const verificationNetwork = '192.0.2.153'
        await consume('password-reset-redemption-network', [resetNetwork], 30)
        await consume('email-verification-network', [verificationNetwork], 30)

        expect(
            (await resetPassword('__TEST_RESET_NETWORK_TOKEN', resetNetwork))
                .status,
        ).toBe(429)
        expect(
            (
                await verifyEmail(
                    '__TEST_VERIFY_NETWORK_TOKEN',
                    verificationNetwork,
                )
            ).status,
        ).toBe(429)
    })

    it('releases verification reservations after classified 5xx responses.', async () => {
        authTestControl.verifyEmailResponseStatus = 503

        for (let index = 0; index < 6; index += 1) {
            const verifyResponse = await verifyEmail(
                '__TEST_VERIFY_INFRA_TOKEN',
                '192.0.2.155',
            )

            expect(verifyResponse.status).toBe(503)
            expect(
                (await verifyResponse.json<TApiResponseError>()).error.code,
            ).toBe('AUTHENTICATION_UNAVAILABLE')
        }
    })

    it('resets the password-change user bucket after success.', async () => {
        const signInResponse = await signIn(
            TEST_AUTH_MUTABLE_USERNAME,
            'P@ssw0rd1234',
            '198.51.100.156',
        )
        expect(signInResponse.status).toBe(200)
        let cookie = signInResponse.headers.getSetCookie().join('; ')

        const userStub = await consume(
            'password-change-user',
            [TEST_AUTH_MUTABLE_USER_ID],
            4,
        )
        const changed = await changePassword(
            cookie,
            'P@ssw0rd1234',
            'N3wP@ssw0rd1234',
            '198.51.100.157',
        )
        expect(changed.status).toBe(200)
        cookie = changed.headers.getSetCookie().join('; ')
        expect(cookie).toContain('session_token=')

        const tableCount = await runInDurableObject(
            userStub,
            (_instance, state) =>
                state.storage.sql
                    .exec<{ count: number }>(
                        `
                        SELECT COUNT(*) AS count
                        FROM sqlite_master
                        WHERE type = 'table'
                          AND name = 'rate_limit_reservation'
                    `,
                    )
                    .one().count,
        )
        expect(tableCount).toBe(0)

        const restored = await changePassword(
            cookie,
            'N3wP@ssw0rd1234',
            'P@ssw0rd1234',
            '198.51.100.158',
        )
        expect(restored.status).toBe(200)
    })

    it('emits correlated privacy-safe block, release-error, and reset-error events.', async () => {
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        const failingMutationNamespace = {
            getByName: () => ({
                consume: () =>
                    Promise.resolve({
                        allowed: true as const,
                        remaining: 19,
                        reservationId: '__TEST_RESERVATION',
                        retryAfterMs: 0 as const,
                    }),
                release: () =>
                    Promise.reject(
                        new Error(
                            'Simulated release failure. Bearer PRIVATE_TOKEN',
                        ),
                    ),
                reset: () =>
                    Promise.reject(
                        new Error(
                            'Simulated reset failure. Bearer PRIVATE_TOKEN',
                        ),
                    ),
            }),
        } as unknown as typeof env.HYPERIONBOFC_DO_RL
        const request = (accountId: string) =>
            app.request(
                '/api/auth/signIn/username',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'cf-connecting-ip': '198.51.100.159',
                        'cf-ray': '__TEST-CORRELATION',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                        accountId,
                        password: 'P@ssw0rd1234',
                    }),
                },
                { ...env, HYPERIONBOFC_DO_RL: failingMutationNamespace },
            )

        try {
            authTestControl.aclBuilderFailure = true
            expect((await request('__test_release_log_user')).status).toBe(503)

            authTestControl.aclBuilderFailure = false
            expect((await request(TEST_OWNER_USERNAME)).status).toBe(200)

            const errorEntries = consoleError.mock.calls.flatMap(([entry]) => {
                try {
                    return [
                        JSON.parse(String(entry)) as Record<string, unknown>,
                    ]
                } catch {
                    return []
                }
            })
            for (const type of [
                'AUTH_RATE_LIMIT_RELEASE_ERROR',
                'AUTH_RATE_LIMIT_RESET_ERROR',
            ]) {
                const entry = errorEntries.find((item) => item.type === type)
                expect(entry).toMatchObject({
                    type,
                    correlationId: '__TEST-CORRELATION',
                    environment: env.ENVIRONMENT,
                })
                expect(entry?.requestId).toEqual(expect.any(String))
                expect(entry?.scopes).toEqual(expect.any(Array))
                expect(entry).toMatchObject({
                    name: 'AggregateError',
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'RateLimitUnavailableError',
                            message: 'Rate limiting is unavailable.',
                        }),
                    ]),
                })
                expect(JSON.stringify(entry)).not.toContain(TEST_OWNER_USERNAME)
                expect(JSON.stringify(entry)).not.toContain('PRIVATE_')
            }

            const blockedIdentity = 'username:__test_block_log_user'
            await consume(
                'sign-in-identity-network',
                [
                    blockedIdentity,
                    '198.51.100.160',
                ],
                5,
            )
            const blocked = await app.request(
                '/api/auth/signIn/username',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'cf-connecting-ip': '198.51.100.160',
                        'cf-ray': '__TEST-BLOCK-CORRELATION',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                        accountId: '__test_block_log_user',
                        password: 'Wr0ng@P@ssword1234',
                    }),
                },
                env,
            )
            expect(blocked.status).toBe(429)
            const blockEntries = consoleLog.mock.calls.flatMap(([entry]) => {
                try {
                    return [
                        JSON.parse(String(entry)) as Record<string, unknown>,
                    ]
                } catch {
                    return []
                }
            })
            expect(
                blockEntries.find(
                    ({ type }) => type === 'AUTH_RATE_LIMIT_BLOCKED',
                ),
            ).toMatchObject({
                type: 'AUTH_RATE_LIMIT_BLOCKED',
                correlationId: '__TEST-BLOCK-CORRELATION',
                environment: env.ENVIRONMENT,
            })
        } finally {
            authTestControl.aclBuilderFailure = false
            consoleLog.mockRestore()
            consoleError.mockRestore()
        }
    })

    it.each([
        'anonymous',
        'administrative',
    ] as const)(
        'prepares %s reset audits before any reset-email effect.',
        async (mode) => {
            const signedIn = await signIn(
                TEST_OWNER_USERNAME,
                'P@ssw0rd1234',
                '198.18.0.191',
            )
            const cookie = signedIn.headers.getSetCookie().join('; ')
            authTestControl.auditPreparationFailure = true
            const before = await db
                .select()
                .from(dbSchema.verification)
                .where(eq(dbSchema.verification.value, TEST_OWNER_USER_ID))
            try {
                const response = await app.request(
                    mode === 'anonymous'
                        ? '/api/auth/password/resetRequest'
                        : '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': '198.18.0.192',
                            cookie,
                        },
                        body: JSON.stringify(
                            mode === 'anonymous'
                                ? { email: TEST_OWNER_EMAIL }
                                : { userPublicId: TEST_OWNER_USER_PUBLIC_ID },
                        ),
                    },
                    env,
                )
                // Anonymous auth guards preserve infrastructure-error masking.
                expect(response.status).toBe(mode === 'anonymous' ? 503 : 500)
                expect(
                    authTestControl.passwordResetEmailSent,
                ).not.toHaveBeenCalled()
                expect(
                    await db
                        .select()
                        .from(dbSchema.verification)
                        .where(
                            eq(dbSchema.verification.value, TEST_OWNER_USER_ID),
                        ),
                ).toEqual(before)
            } finally {
                authTestControl.auditPreparationFailure = false
            }
        },
    )

    it.each([
        'anonymous',
        'administrative',
    ] as const)(
        'keeps a delivered %s reset successful when its audit persistence fails.',
        async (mode) => {
            const signedIn = await signIn(
                TEST_OWNER_USERNAME,
                'P@ssw0rd1234',
                '198.18.0.193',
            )
            const cookie = signedIn.headers.getSetCookie().join('; ')
            await env.HYPERIONBOFC_D1.prepare(
                `CREATE TRIGGER test_reset_audit_failure
                 BEFORE INSERT ON audit_trail
                 WHEN NEW.action IN ('resetRequest', 'password.resetRequest')
                 BEGIN
                     SELECT RAISE(ABORT, 'test reset audit failure');
                 END`,
            ).run()
            try {
                const response = await app.request(
                    mode === 'anonymous'
                        ? '/api/auth/password/resetRequest'
                        : '/api/admin/user/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            'cf-connecting-ip': '198.18.0.194',
                            cookie,
                        },
                        body: JSON.stringify(
                            mode === 'anonymous'
                                ? { email: TEST_OWNER_EMAIL }
                                : { userPublicId: TEST_OWNER_USER_PUBLIC_ID },
                        ),
                    },
                    env,
                )
                expect(response.status).toBe(200)
                expect(
                    authTestControl.passwordResetEmailSent,
                ).toHaveBeenCalledOnce()
                expect(response.headers.get('Audit-Event-Recorded')).toBeNull()
                const tokens = await db
                    .select()
                    .from(dbSchema.verification)
                    .where(eq(dbSchema.verification.value, TEST_OWNER_USER_ID))
                expect(tokens.length).toBeGreaterThan(0)
            } finally {
                await env.HYPERIONBOFC_D1.exec(
                    'DROP TRIGGER IF EXISTS test_reset_audit_failure',
                )
                await deletePasswordResetRows(TEST_OWNER_USER_ID)
            }
        },
    )

    it('does not persist an administrative reset audit when delivery fails.', async () => {
        authTestControl.passwordResetEmailFailure = true
        const privilegedSignIn = await signIn(
            TEST_OWNER_USERNAME,
            'P@ssw0rd1234',
            '198.18.0.43',
        )
        const cookie = privilegedSignIn.headers.getSetCookie().join('; ')
        const auditsBefore = await countAdminPasswordResetAudits()

        try {
            const response = await app.request(
                '/api/admin/user/password/resetRequest',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'content-type': 'application/json',
                        cookie,
                    },
                    body: JSON.stringify({
                        userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                    }),
                },
                env,
            )

            expect(response.status).toBe(503)
            expect(response.headers.get('Audit-Event-Recorded')).toBeNull()
            expect(await countAdminPasswordResetAudits()).toBe(auditsBefore)
        } finally {
            authTestControl.passwordResetEmailFailure = false
            await deletePasswordResetRows(TEST_MEMBER_USER_ID)
        }
    })

    it('rate-limits administrative reset initiation without recording a denied event.', async () => {
        const privilegedSignIn = await signIn(
            TEST_OWNER_USERNAME,
            'P@ssw0rd1234',
            '198.18.0.42',
        )
        const cookie = privilegedSignIn.headers.getSetCookie().join('; ')
        const auditsBefore = await countAdminPasswordResetAudits()
        const resetRowsBefore =
            await countPasswordResetRows(TEST_MEMBER_USER_ID)
        const emailCallsBefore =
            authTestControl.passwordResetEmailSent.mock.calls.length
        await consume(
            'admin-password-reset-actor-target',
            [
                TEST_OWNER_USER_ID,
                TEST_MEMBER_USER_ID,
            ],
            10,
        )

        const response = await app.request(
            '/api/admin/user/password/resetRequest',
            {
                method: 'POST',
                headers: {
                    origin: env.URL_FRONTEND,
                    'content-type': 'application/json',
                    cookie,
                },
                body: JSON.stringify({
                    userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                }),
            },
            env,
        )

        expect(response.status).toBe(429)
        expect(response.headers.get('retry-after')).toBe('3600')
        expect((await response.json<TApiResponseError>()).error.code).toBe(
            'RATE_LIMITED',
        )
        expect(response.headers.get('Audit-Event-Recorded')).toBeNull()
        expect(await countAdminPasswordResetAudits()).toBe(auditsBefore)
        expect(await countPasswordResetRows(TEST_MEMBER_USER_ID)).toBe(
            resetRowsBefore,
        )
        expect(authTestControl.passwordResetEmailSent).toHaveBeenCalledTimes(
            emailCallsBefore,
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
