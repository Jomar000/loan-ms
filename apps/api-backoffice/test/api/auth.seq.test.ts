import { dbClient, dbSchema } from '@hyperion/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@hyperion/types/shared'
import { createEmailVerificationToken } from 'better-auth/api'
import { env } from 'cloudflare:workers'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import app from '../../src/core/index.js'
import {
    interceptPasswordResetToken,
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookieForOrganization,
    TEST_AUTH_MUTABLE_EMAIL,
    TEST_AUTH_MUTABLE_USERNAME,
    TEST_AUTH_MUTABLE_USER_ID,
    TEST_AUTH_MUTABLE_USER_PUBLIC_ID,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_ISOLATED_ORGANIZATION_SLUG,
    TEST_NO_ATTRIBUTE_EMAIL,
    TEST_NO_ATTRIBUTE_USERNAME,
    TEST_PRIMARY_ORGANIZATION_SLUG,
    TEST_PRIMARY_ORGANIZATION_ID,
    TEST_OWNER_USER_ID,
    TEST_OWNER_USERNAME,
} from '../utilities.js'

const AUTH_RATE_LIMIT_IP = '198.51.100.201'
const mailBindings = new Set<PropertyKey>([
    'HYPERIONBOFC_EMAIL',
    'MAILER_ACCOUNT',
    'MAILER_PROVIDER',
    'RESEND_API_KEY',
])
const mailDisabledEnvironment = new Proxy(env, {
    get(target, property, receiver) {
        if (property === 'FEATURE_MAIL') return 0
        if (mailBindings.has(property))
            throw new Error(`${String(property)} must not be accessed.`)

        return Reflect.get(target, property, receiver)
    },
})
let db: ReturnType<typeof dbClient>

const failD1Batch = (database: D1Database) =>
    new Proxy(database, {
        get(target, property, receiver) {
            if (property === 'batch')
                return async () => {
                    throw new Error('injected D1 batch failure')
                }
            const value = Reflect.get(target, property, receiver)
            return typeof value === 'function' ? value.bind(target) : value
        },
    })

type TSessionResponseData = {
    organizationSlug: string
    userRoles: string[]
    expiresAt: number
}

beforeAll(() => {
    db = dbClient(env.HYPERIONBOFC_D1)
})

afterAll(async () => {})

const restoreMutableAuthAttribute = async () => {
    const { userAttribute } = dbSchema

    await db
        .delete(userAttribute)
        .where(eq(userAttribute.userId, TEST_AUTH_MUTABLE_USER_ID))
    await db.insert(userAttribute).values({
        userId: TEST_AUTH_MUTABLE_USER_ID,
        isLocked: false,
    })
}

const signInMutableAuthUser = async () => {
    const response = await app.request(
        '/api/auth/signIn/username',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                accountId: TEST_AUTH_MUTABLE_USERNAME,
                password: 'P@ssw0rd1234',
            }),
        },
        env,
    )

    expect(response.status).toBe(200)

    return response.headers.getSetCookie().join('; ')
}

const ORGANIZATION_SWITCH_USER_AGENT = '__test-organization-switch-agent/1.0'

const switchOrganization = (cookie: string, organizationSlug: string) =>
    app.request(
        '/api/auth/organization/setActive',
        {
            method: 'POST',
            headers: {
                origin: env.URL_FRONTEND,
                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                'content-type': 'application/json',
                'user-agent': ORGANIZATION_SWITCH_USER_AGENT,
                cookie,
            },
            body: JSON.stringify({ organizationSlug }),
        },
        env,
    )

const switchAuditWhere = (userId: string) =>
    and(
        eq(dbSchema.auditTrail.userId, userId),
        eq(dbSchema.auditTrail.action, 'organization.setActive'),
    )

const clearSwitchAudits = async (userId: string) => {
    await db.delete(dbSchema.auditTrail).where(switchAuditWhere(userId))
}

const readSwitchAudits = (userId: string) =>
    db.select().from(dbSchema.auditTrail).where(switchAuditWhere(userId))

const withMutableIsolatedMembership = async (
    role: string,
    callback: () => Promise<void>,
) => {
    const { member } = dbSchema

    await db.insert(member).values({
        id: '__TEST-MEMBER_AUTH_MUTABLE_ISOLATED',
        userId: TEST_AUTH_MUTABLE_USER_ID,
        organizationId: TEST_ISOLATED_ORGANIZATION_ID,
        role,
    })

    try {
        await callback()
    } finally {
        await db
            .delete(member)
            .where(
                and(
                    eq(member.userId, TEST_AUTH_MUTABLE_USER_ID),
                    eq(member.organizationId, TEST_ISOLATED_ORGANIZATION_ID),
                ),
            )
    }
}

const verificationUser = {
    id: '__TEST-USER_EMAIL_VERIFICATION_BACKOFFICE',
    name: '__TEST-EMAIL VERIFICATION BACKOFFICE',
    email: 'email.verification.backoffice@test.hyperion.app',
    username: '__test_email_verification_backoffice',
}

describe('Auth Endpoint', () => {
    describe('Sequential Tests', () => {
        describe('Organization Switching', () => {
            it('Switches the persisted active organization without extending the session.', async () => {
                const { auditTrail } = dbSchema
                await db
                    .delete(auditTrail)
                    .where(
                        and(
                            eq(auditTrail.userId, TEST_OWNER_USER_ID),
                            eq(auditTrail.action, 'organization.setActive'),
                        ),
                    )

                const signInResponse = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_OWNER_USERNAME,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )
                const cookie = signInResponse.headers.getSetCookie().join('; ')
                const initialSessionResponse = await app.request(
                    '/api/auth/session',
                    {
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            cookie,
                        },
                    },
                    env,
                )
                const initialSession =
                    await initialSessionResponse.json<
                        TApiResponseOk<TSessionResponseData>
                    >()

                const switchResponse = await app.request(
                    '/api/auth/organization/setActive',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                            cookie,
                        },
                        body: JSON.stringify({
                            organizationSlug: TEST_ISOLATED_ORGANIZATION_SLUG,
                        }),
                    },
                    env,
                )
                const responseData =
                    await switchResponse.json<TApiResponseOk<null>>()

                const switchedSessionResponse = await app.request(
                    '/api/auth/session',
                    {
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            cookie,
                        },
                    },
                    env,
                )
                const switchedSession =
                    await switchedSessionResponse.json<
                        TApiResponseOk<TSessionResponseData>
                    >()

                expect(switchResponse.status).toBe(200)
                expect(switchResponse.headers.get('set-cookie')).toBeNull()
                expect(responseData.data).toBeNull()
                expect(switchedSession.data.organizationSlug).toBe(
                    TEST_ISOLATED_ORGANIZATION_SLUG,
                )
                expect(switchedSession.data.userRoles).toEqual(['owner'])
                expect(switchedSession.data.expiresAt).toBe(
                    initialSession.data.expiresAt,
                )

                const switchAudits = await db
                    .select({ organizationId: auditTrail.organizationId })
                    .from(auditTrail)
                    .where(
                        and(
                            eq(auditTrail.userId, TEST_OWNER_USER_ID),
                            eq(auditTrail.action, 'organization.setActive'),
                        ),
                    )

                expect(switchAudits).toEqual([
                    { organizationId: TEST_ISOLATED_ORGANIZATION_ID },
                ])
            })

            it('Attributes the switch to the selected membership, user identity, and request metadata.', async () => {
                await clearSwitchAudits(TEST_OWNER_USER_ID)

                const [owner] = await db
                    .select({
                        name: dbSchema.user.name,
                        username: dbSchema.user.username,
                    })
                    .from(dbSchema.user)
                    .where(eq(dbSchema.user.id, TEST_OWNER_USER_ID))
                const cookie = await seedTestingCookieForOrganization(
                    TEST_OWNER_USER_ID,
                    TEST_PRIMARY_ORGANIZATION_ID,
                    { db },
                )
                const switchResponse = await switchOrganization(
                    cookie,
                    TEST_ISOLATED_ORGANIZATION_SLUG,
                )
                const audits = await readSwitchAudits(TEST_OWNER_USER_ID)

                expect(switchResponse.status).toBe(200)
                expect(switchResponse.headers.get('Audit-Event-Recorded')).toBe(
                    'true',
                )
                expect(audits).toHaveLength(1)
                expect(audits[0]).toMatchObject({
                    organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                    userId: TEST_OWNER_USER_ID,
                    actorType: 'user',
                    actorDisplayName: owner.name,
                    actorIdentifier: owner.username,
                    actorRole: 'owner',
                    component: 'auth',
                    action: 'organization.setActive',
                    ipAddress: AUTH_RATE_LIMIT_IP,
                    userAgent: ORGANIZATION_SWITCH_USER_AGENT,
                })
            })

            it.each([
                'member',
                'owner,admin,member',
            ])(
                'Records the target membership role %j instead of the source role.',
                async (targetRole) => {
                    await clearSwitchAudits(TEST_AUTH_MUTABLE_USER_ID)

                    await withMutableIsolatedMembership(
                        targetRole,
                        async () => {
                            const cookie =
                                await seedTestingCookieForOrganization(
                                    TEST_AUTH_MUTABLE_USER_ID,
                                    TEST_PRIMARY_ORGANIZATION_ID,
                                    { db },
                                )
                            const switchResponse = await switchOrganization(
                                cookie,
                                TEST_ISOLATED_ORGANIZATION_SLUG,
                            )
                            const audits = await readSwitchAudits(
                                TEST_AUTH_MUTABLE_USER_ID,
                            )

                            expect(switchResponse.status).toBe(200)
                            expect(audits).toHaveLength(1)
                            expect(audits[0]).toMatchObject({
                                organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                                userId: TEST_AUTH_MUTABLE_USER_ID,
                                actorRole: targetRole,
                            })
                            expect(audits[0].actorRole).not.toBe('admin')
                        },
                    )
                },
            )

            it.each([
                [
                    'an organization without membership',
                    TEST_ISOLATED_ORGANIZATION_SLUG,
                ],
                [
                    'an unknown organization',
                    '__test-missing-organization',
                ],
            ])(
                'Rejects selecting %s without an audit event.',
                async (_label, organizationSlug) => {
                    await clearSwitchAudits(TEST_AUTH_MUTABLE_USER_ID)

                    const cookie = await seedTestingCookieForOrganization(
                        TEST_AUTH_MUTABLE_USER_ID,
                        TEST_PRIMARY_ORGANIZATION_ID,
                        { db },
                    )
                    const switchResponse = await switchOrganization(
                        cookie,
                        organizationSlug,
                    )
                    const responseData =
                        await switchResponse.json<TApiResponseError>()
                    const sessionResponse = await app.request(
                        '/api/auth/session',
                        {
                            headers: { origin: env.URL_FRONTEND, cookie },
                        },
                        env,
                    )
                    const session =
                        await sessionResponse.json<
                            TApiResponseOk<TSessionResponseData>
                        >()

                    expect(switchResponse.status).toBe(422)
                    expect(responseData.error.message).toBe(
                        'Organization could not be selected.',
                    )
                    expect(
                        switchResponse.headers.get('Audit-Event-Recorded'),
                    ).toBeNull()
                    expect(session.data.organizationSlug).toBe(
                        TEST_PRIMARY_ORGANIZATION_SLUG,
                    )
                    expect(
                        await readSwitchAudits(TEST_AUTH_MUTABLE_USER_ID),
                    ).toEqual([])
                },
            )

            it('Forwards a sliding refresh cookie only after session identity validation.', async () => {
                const cookie = await seedTestingCookieForOrganization(
                    TEST_OWNER_USER_ID,
                    TEST_PRIMARY_ORGANIZATION_ID,
                    {
                        db,
                        sessionAgeSeconds: Number(env.SESSION_UPDATE_AGE) + 1,
                    },
                )
                const sessionToken = decodeURIComponent(
                    cookie.split('=', 2)[1],
                ).split('.')[0]
                const [sessionBeforeRefresh] = await db
                    .select({ expiresAt: dbSchema.session.expiresAt })
                    .from(dbSchema.session)
                    .where(eq(dbSchema.session.token, sessionToken))
                const response = await app.request(
                    '/api/auth/session',
                    {
                        headers: { origin: env.URL_FRONTEND, cookie },
                    },
                    env,
                )
                const [sessionAfterRefresh] = await db
                    .select({ expiresAt: dbSchema.session.expiresAt })
                    .from(dbSchema.session)
                    .where(eq(dbSchema.session.token, sessionToken))

                expect(response.status).toBe(200)
                expect(response.headers.getSetCookie()).toEqual(
                    expect.arrayContaining([
                        expect.not.stringContaining('Max-Age=0'),
                    ]),
                )
                expect(sessionAfterRefresh.expiresAt.getTime()).toBeGreaterThan(
                    sessionBeforeRefresh.expiresAt.getTime(),
                )
            })

            it('Rejects an expired D1 session through normal lazy validation.', async () => {
                const cookie = await seedTestingCookieForOrganization(
                    TEST_OWNER_USER_ID,
                    TEST_PRIMARY_ORGANIZATION_ID,
                    {
                        db,
                        sessionAgeSeconds: Number(env.SESSION_EXPIRATION) + 1,
                    },
                )
                const response = await app.request(
                    '/api/auth/session',
                    {
                        headers: { origin: env.URL_FRONTEND, cookie },
                    },
                    env,
                )
                const sessionToken = decodeURIComponent(
                    cookie.split('=', 2)[1],
                ).split('.')[0]
                const [persistedSession] = await db
                    .select({ id: dbSchema.session.id })
                    .from(dbSchema.session)
                    .where(eq(dbSchema.session.token, sessionToken))

                expect(response.status).toBe(401)
                expect(persistedSession).toBeUndefined()
            })

            it('Resolves eight simultaneous session requests with identical payloads.', async () => {
                const cookie = await seedTestingCookieForOrganization(
                    TEST_OWNER_USER_ID,
                    TEST_PRIMARY_ORGANIZATION_ID,
                    { db },
                )
                const responses = await Promise.all(
                    Array.from({ length: 8 }, () =>
                        app.request(
                            '/api/auth/session',
                            {
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                    cookie,
                                },
                            },
                            env,
                        ),
                    ),
                )
                const payloads = await Promise.all(
                    responses.map((response) =>
                        response.json<TApiResponseOk<TSessionResponseData>>(),
                    ),
                )

                expect(responses.map((response) => response.status)).toEqual(
                    Array(8).fill(200),
                )
                expect(payloads).toEqual(Array(8).fill(payloads[0]))
            })

            it('Keeps concurrent sliding-refresh session requests valid without clearing the session.', async () => {
                const cookie = await seedTestingCookieForOrganization(
                    TEST_OWNER_USER_ID,
                    TEST_PRIMARY_ORGANIZATION_ID,
                    {
                        db,
                        sessionAgeSeconds: Number(env.SESSION_UPDATE_AGE) + 1,
                    },
                )
                const responses = await Promise.all(
                    Array.from({ length: 8 }, () =>
                        app.request(
                            '/api/auth/session',
                            {
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                    cookie,
                                },
                            },
                            env,
                        ),
                    ),
                )

                expect(responses.map((response) => response.status)).toEqual(
                    Array(8).fill(200),
                )
                for (const response of responses) {
                    expect(response.headers.getSetCookie()).not.toEqual(
                        expect.arrayContaining([
                            expect.stringContaining('Max-Age=0'),
                        ]),
                    )
                }
            })

            it('Withholds a sliding refresh when tenant membership is missing while session-only recovery remains available.', async () => {
                const { member } = dbSchema
                const membershipWhere = and(
                    eq(member.userId, TEST_AUTH_MUTABLE_USER_ID),
                    eq(member.organizationId, TEST_PRIMARY_ORGANIZATION_ID),
                )
                const isolatedMembershipWhere = and(
                    eq(member.userId, TEST_AUTH_MUTABLE_USER_ID),
                    eq(member.organizationId, TEST_ISOLATED_ORGANIZATION_ID),
                )
                const [membership] = await db
                    .select()
                    .from(member)
                    .where(membershipWhere)

                expect(membership).toBeDefined()

                await clearSwitchAudits(TEST_AUTH_MUTABLE_USER_ID)
                await db.insert(member).values({
                    id: '__TEST-MEMBER_AUTH_MUTABLE_ISOLATED',
                    userId: TEST_AUTH_MUTABLE_USER_ID,
                    organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                    role: 'member',
                })
                let primaryMembershipDeleted = false

                try {
                    const cookie = await seedTestingCookieForOrganization(
                        TEST_AUTH_MUTABLE_USER_ID,
                        TEST_PRIMARY_ORGANIZATION_ID,
                        {
                            db,
                            sessionAgeSeconds:
                                Number(env.SESSION_UPDATE_AGE) + 1,
                        },
                    )

                    await db.delete(member).where(membershipWhere)
                    primaryMembershipDeleted = true

                    const tenantResponse = await app.request(
                        '/api/auth/session',
                        {
                            headers: { origin: env.URL_FRONTEND, cookie },
                        },
                        env,
                    )
                    const listResponse = await queryTestingRequest(
                        '/api/auth/organization/readMany',
                        { filters: {}, limit: 100, offset: 0 },
                        { cookie },
                    )
                    const switchResponse = await app.request(
                        '/api/auth/organization/setActive',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                'content-type': 'application/json',
                                cookie,
                            },
                            body: JSON.stringify({
                                organizationSlug:
                                    TEST_ISOLATED_ORGANIZATION_SLUG,
                            }),
                        },
                        env,
                    )

                    expect(tenantResponse.status).toBe(403)
                    expect(tenantResponse.headers.get('set-cookie')).toBeNull()
                    expect(listResponse.status).toBe(200)
                    expect(switchResponse.status).toBe(200)
                    expect(switchResponse.headers.get('set-cookie')).toBeNull()
                    expect(
                        await readSwitchAudits(TEST_AUTH_MUTABLE_USER_ID),
                    ).toMatchObject([
                        {
                            organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                            actorRole: 'member',
                        },
                    ])
                } finally {
                    if (primaryMembershipDeleted) {
                        await db.insert(member).values(membership!)
                    }
                    await db.delete(member).where(isolatedMembershipWhere)
                }
            })

            it('Keeps a completed organization switch successful when its audit insert fails.', async () => {
                const triggerName = 'test_fail_org_switch_audit_backoffice'
                const consoleError = vi
                    .spyOn(console, 'error')
                    .mockImplementation(() => undefined)

                await clearSwitchAudits(TEST_OWNER_USER_ID)
                await db.$client
                    .prepare(
                        `CREATE TRIGGER ${triggerName}
                         BEFORE INSERT ON audit_trail
                         WHEN NEW.action = 'organization.setActive'
                         BEGIN
                             SELECT RAISE(FAIL, 'test organization switch audit failure');
                         END`,
                    )
                    .run()

                try {
                    const cookie = await seedTestingCookieForOrganization(
                        TEST_OWNER_USER_ID,
                        TEST_PRIMARY_ORGANIZATION_ID,
                        { db },
                    )
                    const switchResponse = await app.request(
                        '/api/auth/organization/setActive',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                'content-type': 'application/json',
                                cookie,
                            },
                            body: JSON.stringify({
                                organizationSlug:
                                    TEST_ISOLATED_ORGANIZATION_SLUG,
                            }),
                        },
                        env,
                    )
                    const sessionResponse = await app.request(
                        '/api/auth/session',
                        {
                            headers: { origin: env.URL_FRONTEND, cookie },
                        },
                        env,
                    )
                    const session =
                        await sessionResponse.json<
                            TApiResponseOk<TSessionResponseData>
                        >()

                    expect(switchResponse.status).toBe(200)
                    expect(sessionResponse.status).toBe(200)
                    expect(session.data.organizationSlug).toBe(
                        TEST_ISOLATED_ORGANIZATION_SLUG,
                    )
                    expect(
                        switchResponse.headers.get('Audit-Event-Recorded'),
                    ).toBeNull()
                    expect(await readSwitchAudits(TEST_OWNER_USER_ID)).toEqual(
                        [],
                    )
                    expect(consoleError).toHaveBeenCalledOnce()
                    expect(
                        JSON.parse(consoleError.mock.calls[0][0]),
                    ).toMatchObject({
                        type: 'AUDIT_TRAIL_WRITE_ERROR',
                        action: 'organization.setActive',
                        component: 'auth',
                    })
                } finally {
                    await db.$client
                        .prepare(`DROP TRIGGER IF EXISTS ${triggerName}`)
                        .run()
                    consoleError.mockRestore()
                }
            })
        })

        describe('Role Hardening', () => {
            it.each([
                '',
                'admin,,member',
                '__unknown_role',
            ])('Rejects invalid membership role %j.', async (invalidRole) => {
                const { member } = dbSchema
                const membershipWhere = and(
                    eq(member.userId, TEST_AUTH_MUTABLE_USER_ID),
                    eq(member.organizationId, TEST_PRIMARY_ORGANIZATION_ID),
                )

                await db
                    .update(member)
                    .set({ role: invalidRole })
                    .where(membershipWhere)

                try {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_AUTH_MUTABLE_USERNAME,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )
                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData.error.code).toBe(
                        'UNPROCESSABLE_CONTENT',
                    )
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                    expect(response.headers.get('set-cookie')).toBeNull()
                } finally {
                    await db
                        .update(member)
                        .set({ role: 'admin' })
                        .where(membershipWhere)
                }
            })
        })

        describe('Email Verification Flow', () => {
            let verificationToken = ''

            beforeAll(async () => {
                const { member, user } = dbSchema

                await db
                    .delete(member)
                    .where(eq(member.userId, verificationUser.id))
                await db.delete(user).where(eq(user.id, verificationUser.id))
                await db.insert(user).values(verificationUser)
                await db.insert(member).values({
                    id: `${verificationUser.id}-MEMBERSHIP`,
                    organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    role: 'member',
                    userId: verificationUser.id,
                })
                verificationToken = await createEmailVerificationToken(
                    env.BETTER_AUTH_SECRET,
                    verificationUser.email,
                )
            })

            afterAll(async () => {
                const { member, user } = dbSchema
                await db
                    .delete(member)
                    .where(eq(member.userId, verificationUser.id))
                await db.delete(user).where(eq(user.id, verificationUser.id))
            })

            it('Valid token should verify the user.', async () => {
                const response = await app.request(
                    '/api/auth/verifyEmail',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ token: verificationToken }),
                    },
                    mailDisabledEnvironment,
                )
                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('Audit-Event-Recorded')).toBe(
                    'true',
                )
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()

                const { auditTrail, user } = dbSchema
                const [verifiedUser] = await db
                    .select({ emailVerified: user.emailVerified })
                    .from(user)
                    .where(eq(user.id, verificationUser.id))

                expect(verifiedUser.emailVerified).toBe(true)

                const [auditEntry] = await db
                    .select({
                        actorType: auditTrail.actorType,
                        organizationId: auditTrail.organizationId,
                    })
                    .from(auditTrail)
                    .where(
                        and(
                            eq(auditTrail.action, 'verifyEmail'),
                            eq(
                                auditTrail.organizationId,
                                TEST_PRIMARY_ORGANIZATION_ID,
                            ),
                        ),
                    )
                    .orderBy(sql`${auditTrail.id} DESC`)
                    .limit(1)
                expect(auditEntry).toEqual({
                    actorType: 'anonymous',
                    organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                })
            })

            it('Reusing a valid token should remain successful.', async () => {
                const response = await postTestingRequest(
                    '/api/auth/verifyEmail',
                    {
                        body: { token: verificationToken },
                        ipAddress: AUTH_RATE_LIMIT_IP,
                    },
                )
                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()
            })
        })

        describe('User Attribute Lock Enforcement', () => {
            it('Does not forward a refreshed valid session cookie for a locked user.', async () => {
                await restoreMutableAuthAttribute()
                const cookie = await seedTestingCookieForOrganization(
                    TEST_AUTH_MUTABLE_USER_ID,
                    TEST_PRIMARY_ORGANIZATION_ID,
                    {
                        db,
                        sessionAgeSeconds: Number(env.SESSION_UPDATE_AGE) + 1,
                    },
                )
                const { userAttribute } = dbSchema

                try {
                    await db
                        .update(userAttribute)
                        .set({ isLocked: true })
                        .where(
                            eq(userAttribute.userId, TEST_AUTH_MUTABLE_USER_ID),
                        )

                    const response = await app.request(
                        '/api/auth/session',
                        {
                            headers: { origin: env.URL_FRONTEND, cookie },
                        },
                        env,
                    )

                    expect(response.status).toBe(423)
                    expect(response.headers.getSetCookie()).not.toEqual(
                        expect.arrayContaining([
                            expect.not.stringContaining('Max-Age=0'),
                        ]),
                    )
                } finally {
                    await restoreMutableAuthAttribute()
                }
            })

            it('Sign-in by username with missing user attribute should fail closed.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_NO_ATTRIBUTE_USERNAME,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData.error.code).toBe('UNPROCESSABLE_CONTENT')
                expect(responseData.error.message).toBe(
                    'Invalid credentials provided.',
                )
            })

            it('Sign-in by email with missing user attribute should fail closed.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/email',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_NO_ATTRIBUTE_EMAIL,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData.error.code).toBe('UNPROCESSABLE_CONTENT')
                expect(responseData.error.message).toBe(
                    'Invalid credentials provided.',
                )
            })

            it('Authenticated session should fail after user is locked.', async () => {
                await restoreMutableAuthAttribute()

                const [
                    firstSessionCookie,
                    secondSessionCookie,
                ] = await Promise.all([
                    signInMutableAuthUser(),
                    signInMutableAuthUser(),
                ])
                const { userAttribute } = dbSchema

                try {
                    await db
                        .update(userAttribute)
                        .set({ isLocked: true })
                        .where(
                            eq(userAttribute.userId, TEST_AUTH_MUTABLE_USER_ID),
                        )

                    const response = await app.request(
                        '/api/user/profile/read',
                        {
                            method: 'GET',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                cookie: firstSessionCookie,
                            },
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(423)
                    expect(responseData.error.code).toBe('LOCKED')
                    expect(responseData.error.message).toBe(
                        'Account is currently locked.',
                    )
                    expect(response.headers.get('set-cookie')).toBeTruthy()

                    const revokedSessionResponse = await app.request(
                        '/api/user/profile/read',
                        {
                            method: 'GET',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                cookie: secondSessionCookie,
                            },
                        },
                        env,
                    )

                    const revokedSessionResponseData =
                        await revokedSessionResponse.json<TApiResponseError>()

                    expect(revokedSessionResponse.status).toBe(401)
                    expect(revokedSessionResponseData.error.code).toBe(
                        'UNAUTHORIZED',
                    )
                } finally {
                    await restoreMutableAuthAttribute()
                }
            })

            it('Authenticated session should fail after user attribute is removed.', async () => {
                await restoreMutableAuthAttribute()

                const [
                    firstSessionCookie,
                    secondSessionCookie,
                ] = await Promise.all([
                    signInMutableAuthUser(),
                    signInMutableAuthUser(),
                ])
                const { userAttribute } = dbSchema

                try {
                    await db
                        .delete(userAttribute)
                        .where(
                            eq(userAttribute.userId, TEST_AUTH_MUTABLE_USER_ID),
                        )

                    const response = await app.request(
                        '/api/user/profile/read',
                        {
                            method: 'GET',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                cookie: firstSessionCookie,
                            },
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(423)
                    expect(responseData.error.code).toBe('LOCKED')
                    expect(responseData.error.message).toBe(
                        'Account is currently locked.',
                    )
                    expect(response.headers.get('set-cookie')).toBeTruthy()

                    const revokedSessionResponse = await app.request(
                        '/api/user/profile/read',
                        {
                            method: 'GET',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                cookie: secondSessionCookie,
                            },
                        },
                        env,
                    )

                    const revokedSessionResponseData =
                        await revokedSessionResponse.json<TApiResponseError>()

                    expect(revokedSessionResponse.status).toBe(401)
                    expect(revokedSessionResponseData.error.code).toBe(
                        'UNAUTHORIZED',
                    )
                } finally {
                    await restoreMutableAuthAttribute()
                }
            })
        })

        describe('Password Change Flow', () => {
            it('Keeps credentials and sessions intact when the atomic password batch fails.', async () => {
                const mutableAuthCookie = await signInMutableAuthUser()
                await signInMutableAuthUser()
                const credentialWhere = and(
                    eq(dbSchema.account.userId, TEST_AUTH_MUTABLE_USER_ID),
                    eq(dbSchema.account.providerId, 'credential'),
                )
                const [
                    credentialBefore,
                    sessionsBefore,
                    [auditsBefore],
                ] = await Promise.all([
                    db.select().from(dbSchema.account).where(credentialWhere),
                    db
                        .select({ id: dbSchema.session.id })
                        .from(dbSchema.session)
                        .where(
                            eq(
                                dbSchema.session.userId,
                                TEST_AUTH_MUTABLE_USER_ID,
                            ),
                        )
                        .orderBy(dbSchema.session.id),
                    db
                        .select({ count: count() })
                        .from(dbSchema.auditTrail)
                        .where(
                            eq(dbSchema.auditTrail.action, 'password.change'),
                        ),
                ])
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                            cookie: mutableAuthCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'P@ssw0rd1234',
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    {
                        ...env,
                        HYPERIONBOFC_D1: failD1Batch(env.HYPERIONBOFC_D1),
                    },
                )
                const [
                    credentialAfter,
                    sessionsAfter,
                    [auditsAfter],
                ] = await Promise.all([
                    db.select().from(dbSchema.account).where(credentialWhere),
                    db
                        .select({ id: dbSchema.session.id })
                        .from(dbSchema.session)
                        .where(
                            eq(
                                dbSchema.session.userId,
                                TEST_AUTH_MUTABLE_USER_ID,
                            ),
                        )
                        .orderBy(dbSchema.session.id),
                    db
                        .select({ count: count() })
                        .from(dbSchema.auditTrail)
                        .where(
                            eq(dbSchema.auditTrail.action, 'password.change'),
                        ),
                ])

                expect(response.status).toBe(503)
                expect(credentialAfter).toEqual(credentialBefore)
                expect(sessionsAfter).toEqual(sessionsBefore)
                expect(auditsAfter).toEqual(auditsBefore)
            })

            it('Valid password change should pass.', async () => {
                const mutableAuthCookie = await signInMutableAuthUser()
                const otherMutableAuthCookie = await signInMutableAuthUser()
                const currentSessionToken = decodeURIComponent(
                    mutableAuthCookie.split('=', 2)[1],
                ).split('.')[0]
                const otherSessionToken = decodeURIComponent(
                    otherMutableAuthCookie.split('=', 2)[1],
                ).split('.')[0]
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                            cookie: mutableAuthCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'P@ssw0rd1234',
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )
                const rotatedSessionCookie = response.headers
                    .getSetCookie()
                    .join('; ')
                const [
                    [persistedCurrentSession],
                    [persistedOtherSession],
                ] = await Promise.all([
                    db
                        .select({ id: dbSchema.session.id })
                        .from(dbSchema.session)
                        .where(eq(dbSchema.session.token, currentSessionToken)),
                    db
                        .select({ id: dbSchema.session.id })
                        .from(dbSchema.session)
                        .where(eq(dbSchema.session.token, otherSessionToken)),
                ])

                const responseData = await response.json<TApiResponseOk<null>>()
                const oldCurrentSessionResponse = await app.request(
                    '/api/auth/session',
                    {
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            cookie: mutableAuthCookie,
                        },
                    },
                    env,
                )
                const rotatedSessionResponse = await app.request(
                    '/api/auth/session',
                    {
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            cookie: rotatedSessionCookie,
                        },
                    },
                    env,
                )
                const otherSessionResponse = await app.request(
                    '/api/auth/session',
                    {
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            cookie: otherMutableAuthCookie,
                        },
                    },
                    env,
                )

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()
                expect(rotatedSessionCookie).toContain('session_token=')
                expect(oldCurrentSessionResponse.status).toBe(401)
                expect(rotatedSessionResponse.status).toBe(200)
                expect(otherSessionResponse.status).toBe(401)
                expect(persistedCurrentSession).toBeUndefined()
                expect(persistedOtherSession).toBeUndefined()
            })

            it('Sign-in with the new password should pass.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_AUTH_MUTABLE_USERNAME,
                            password: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData =
                    await response.json<TApiResponseOk<unknown>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('set-cookie')).toBeTruthy()
                expect(responseData).toHaveProperty('data')
            })

            it('Sign-in with the old password should fail.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_AUTH_MUTABLE_USERNAME,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe(
                    'Invalid credentials provided.',
                )
            })

            it('Restore original password.', async () => {
                /**
                 * @description
                 * Sign in with new password to get a fresh session,
                 * then change back to original.
                 */
                const signInResponse = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_AUTH_MUTABLE_USERNAME,
                            password: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const freshCookie = signInResponse.headers
                    .getSetCookie()
                    .join('; ')

                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                            cookie: freshCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'N3wP@ssw0rd1234',
                            newPassword: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
            })
        })

        /**
         * @description
         * Full Password Reset Flow (Token Interception)
         *
         * Simulates the complete user-initiated password reset process:
         * 1. Request password reset and intercept the token
         * 2. Use the token to complete the password reset
         * 3. Verify sign-in with the new password
         *
         * The reset request and database token interception are performed in
         * `beforeAll()` so the ordered flow can redeem the captured token.
         */
        describe('Full Password Reset Flow (Token Interception)', () => {
            let interceptedToken: string

            beforeAll(async () => {
                const response = await app.request(
                    '/api/auth/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            email: TEST_AUTH_MUTABLE_EMAIL,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('Audit-Event-Recorded')).toBe(
                    'true',
                )
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()

                const [resetRequestAudit] = await db
                    .select({ records: dbSchema.auditTrail.records })
                    .from(dbSchema.auditTrail)
                    .where(
                        and(
                            eq(dbSchema.auditTrail.component, 'auth'),
                            eq(
                                dbSchema.auditTrail.action,
                                'password.resetRequest',
                            ),
                        ),
                    )
                    .orderBy(desc(dbSchema.auditTrail.id))
                    .limit(1)

                expect(resetRequestAudit?.records).toEqual([
                    {
                        entityType: 'user',
                        id: TEST_AUTH_MUTABLE_USER_PUBLIC_ID,
                        table: 'user',
                    },
                ])

                interceptedToken = await interceptPasswordResetToken(
                    TEST_AUTH_MUTABLE_USER_ID,
                )
                expect(interceptedToken).toBeTruthy()
                expect(
                    await env.HYPERIONBOFC_KV.list({ prefix: 'verification:' }),
                ).toMatchObject({ keys: [] })
            })

            it('Step 0: Preserves the reset token and credential when the atomic batch fails.', async () => {
                const credentialWhere = and(
                    eq(dbSchema.account.userId, TEST_AUTH_MUTABLE_USER_ID),
                    eq(dbSchema.account.providerId, 'credential'),
                )
                const [
                    credentialBefore,
                    [auditsBefore],
                ] = await Promise.all([
                    db.select().from(dbSchema.account).where(credentialWhere),
                    db
                        .select({ count: count() })
                        .from(dbSchema.auditTrail)
                        .where(
                            eq(dbSchema.auditTrail.action, 'password.reset'),
                        ),
                ])
                const response = await app.request(
                    '/api/auth/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            token: interceptedToken,
                            newPassword: 'R3set@P@ssw0rd5678',
                        }),
                    },
                    {
                        ...env,
                        HYPERIONBOFC_D1: failD1Batch(env.HYPERIONBOFC_D1),
                    },
                )
                const [
                    tokensAfter,
                    credentialAfter,
                    [auditsAfter],
                ] = await Promise.all([
                    db
                        .select({ id: dbSchema.verification.id })
                        .from(dbSchema.verification)
                        .where(
                            eq(
                                dbSchema.verification.identifier,
                                `reset-password:${interceptedToken}`,
                            ),
                        ),
                    db.select().from(dbSchema.account).where(credentialWhere),
                    db
                        .select({ count: count() })
                        .from(dbSchema.auditTrail)
                        .where(
                            eq(dbSchema.auditTrail.action, 'password.reset'),
                        ),
                ])

                expect(response.status).toBe(503)
                expect(tokensAfter).toHaveLength(1)
                expect(credentialAfter).toEqual(credentialBefore)
                expect(auditsAfter).toEqual(auditsBefore)
            })

            it('Step 1: Allows exactly one concurrent redemption of the intercepted token.', async () => {
                const responses = await Promise.all(
                    Array.from({ length: 2 }, () =>
                        app.request(
                            '/api/auth/password/reset',
                            {
                                method: 'POST',
                                headers: {
                                    origin: env.URL_FRONTEND,
                                    'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                    token: interceptedToken,
                                    newPassword: 'R3set@P@ssw0rd5678',
                                }),
                            },
                            mailDisabledEnvironment,
                        ),
                    ),
                )

                expect(responses.map(({ status }) => status).sort()).toEqual([
                    200,
                    422,
                ])
                expect(
                    responses.filter(
                        (response) =>
                            response.headers.get('Audit-Event-Recorded') ===
                            'true',
                    ),
                ).toHaveLength(1)

                const resetAudits = await db
                    .select({
                        action: dbSchema.auditTrail.action,
                        actorType: dbSchema.auditTrail.actorType,
                        organizationId: dbSchema.auditTrail.organizationId,
                    })
                    .from(dbSchema.auditTrail)
                    .where(
                        and(
                            eq(
                                dbSchema.auditTrail.organizationId,
                                TEST_PRIMARY_ORGANIZATION_ID,
                            ),
                            sql`${dbSchema.auditTrail.action} IN ('password.resetRequest', 'password.reset')`,
                        ),
                    )
                expect(resetAudits).toEqual(
                    expect.arrayContaining([
                        {
                            action: 'password.resetRequest',
                            actorType: 'anonymous',
                            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        },
                        {
                            action: 'password.reset',
                            actorType: 'anonymous',
                            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                        },
                    ]),
                )
            })

            it('Step 2: Sign-in with the new password should pass.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_AUTH_MUTABLE_USERNAME,
                            password: 'R3set@P@ssw0rd5678',
                        }),
                    },
                    env,
                )

                const responseData =
                    await response.json<TApiResponseOk<unknown>>()

                expect(response.status).toBe(200)
                expect(response.headers.get('set-cookie')).toBeTruthy()
                expect(responseData).toHaveProperty('data')
            })

            it('Step 3: Sign-in with the old password should fail.', async () => {
                const response = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_AUTH_MUTABLE_USERNAME,
                            password: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe(
                    'Invalid credentials provided.',
                )
            })

            it('Step 4: Restore original password.', async () => {
                /**
                 * @description
                 * Sign in with new password to get a fresh session,
                 * then use password change to restore original.
                 */
                const signInResponse = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                            accountId: TEST_AUTH_MUTABLE_USERNAME,
                            password: 'R3set@P@ssw0rd5678',
                        }),
                    },
                    env,
                )

                const freshCookie = signInResponse.headers
                    .getSetCookie()
                    .join('; ')

                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': AUTH_RATE_LIMIT_IP,
                            'content-type': 'application/json',
                            cookie: freshCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'R3set@P@ssw0rd5678',
                            newPassword: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
            })
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
