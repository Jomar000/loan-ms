import { dbClient, dbSchema } from '@hyperion/database/d1'
import type {
    TApiResponseError,
    TApiResponseOk,
    TApiResponsePaginatedOk,
} from '@hyperion/types/shared'
import { createEmailVerificationToken } from 'better-auth/api'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import app from '../../src/core/index.js'
import {
    postTestingRequest,
    queryTestingRequest,
    signInTestingUser,
    TEST_DEFAULT_CLIENT_IP,
    TEST_LOCKED_EMAIL,
    TEST_LOCKED_USERNAME,
    TEST_ISOLATED_ORGANIZATION_SLUG,
    TEST_MEMBER_EMAIL,
    TEST_MEMBER_USER_ID,
    TEST_MEMBER_USERNAME,
    TEST_MULTI_ROLE_USERNAME,
    TEST_OWNER_EMAIL,
    TEST_OWNER_USER_ID,
    TEST_OWNER_USERNAME,
    TEST_PRIMARY_ORGANIZATION_ID,
    TEST_PRIMARY_ORGANIZATION_SLUG,
} from '../utilities.js'

let standardCookie: string

const TEST_SEARCH_ORGANIZATION_ID = '__TEST-ORG_SEARCH'
const TEST_SEARCH_ORGANIZATION_NAME = '__TEST-NAME-ONLY ORGANIZATION'
const TEST_SEARCH_ORGANIZATION_SLUG = '__test-slug-only'

type TSessionResponseData = {
    organizationName: string
    organizationSlug: string
    userRoles: string[]
    permissions: Record<string, never>
    expiresAt: number
    refreshAt: number
}

beforeAll(async () => {
    const db = dbClient(env.HYPERIONPUB_D1)

    try {
        await db
            .insert(dbSchema.organization)
            .values({
                id: TEST_SEARCH_ORGANIZATION_ID,
                name: TEST_SEARCH_ORGANIZATION_NAME,
                slug: TEST_SEARCH_ORGANIZATION_SLUG,
            })
            .onConflictDoNothing()
        await db
            .insert(dbSchema.member)
            .values({
                id: '__TEST-MEMBER_ORGANIZATION_SEARCH',
                organizationId: TEST_SEARCH_ORGANIZATION_ID,
                role: 'member',
                userId: TEST_MEMBER_USER_ID,
            })
            .onConflictDoNothing()
    } finally {
        // D1 clients do not require teardown.
    }

    standardCookie = await signInTestingUser(TEST_MEMBER_USERNAME)
})

describe('Auth Endpoint', () => {
    describe('Tests', () => {
        describe.concurrent('Organizations', () => {
            it('Authenticated users should list only their organizations.', async () => {
                const response = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    {
                        filters: {},
                        limit: 100,
                        offset: 0,
                    },
                    { cookie: standardCookie },
                )
                const responseData =
                    await response.json<
                        TApiResponsePaginatedOk<
                            Array<{ name: string; slug: string }>
                        >
                    >()

                expect(response.status).toBe(200)
                expect(responseData.data).toEqual(
                    expect.arrayContaining([
                        {
                            name: '__TEST-PRIMARY ORGANIZATION',
                            slug: TEST_PRIMARY_ORGANIZATION_SLUG,
                        },
                    ]),
                )
                expect(responseData.data[0]).not.toHaveProperty('id')
                expect(responseData.data[0]).not.toHaveProperty('createdAt')
                expect(responseData.data).not.toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            slug: TEST_ISOLATED_ORGANIZATION_SLUG,
                        }),
                    ]),
                )
            })

            it('Organization search should be paginated and validated.', async () => {
                const searchResponse = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    {
                        filters: { searchFilter: 'primary' },
                        limit: 1,
                        offset: 0,
                    },
                    { cookie: standardCookie },
                )
                const searchData =
                    await searchResponse.json<
                        TApiResponsePaginatedOk<
                            Array<{ name: string; slug: string }>
                        >
                    >()

                expect(searchResponse.status).toBe(200)
                expect(searchData.limit).toBe(1)
                expect(searchData.offset).toBe(0)
                expect(searchData.count).toBeGreaterThanOrEqual(
                    searchData.data.length,
                )
                expect(searchData.data).toEqual([
                    {
                        name: '__TEST-PRIMARY ORGANIZATION',
                        slug: TEST_PRIMARY_ORGANIZATION_SLUG,
                    },
                ])
                expect(searchData.data).not.toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            slug: TEST_ISOLATED_ORGANIZATION_SLUG,
                        }),
                        expect.objectContaining({
                            slug: TEST_SEARCH_ORGANIZATION_SLUG,
                        }),
                    ]),
                )

                const invalidResponse = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    { limit: 101 },
                    { cookie: standardCookie },
                )

                expect(invalidResponse.status).toBe(400)
            })

            it.each([
                [
                    'name',
                    'name-only',
                ],
                [
                    'slug',
                    'SLUG-ONLY',
                ],
            ])(
                'Organization search should match by %s case-insensitively.',
                async (_field, searchFilter) => {
                    const response = await queryTestingRequest(
                        '/api/auth/organization/readMany',
                        {
                            filters: { searchFilter },
                            limit: 100,
                            offset: 0,
                        },
                        { cookie: standardCookie },
                    )
                    const responseData =
                        await response.json<
                            TApiResponsePaginatedOk<
                                Array<{ name: string; slug: string }>
                            >
                        >()

                    expect(response.status).toBe(200)
                    expect(responseData.data).toEqual([
                        {
                            name: TEST_SEARCH_ORGANIZATION_NAME,
                            slug: TEST_SEARCH_ORGANIZATION_SLUG,
                        },
                    ])
                },
            )

            it('Organization search should not expose non-member organizations.', async () => {
                const response = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    {
                        filters: {
                            searchFilter: TEST_ISOLATED_ORGANIZATION_SLUG,
                        },
                        limit: 100,
                        offset: 0,
                    },
                    { cookie: standardCookie },
                )
                const responseData =
                    await response.json<
                        TApiResponsePaginatedOk<
                            Array<{ name: string; slug: string }>
                        >
                    >()

                expect(response.status).toBe(200)
                expect(responseData.data).toEqual([])
            })

            it('Organization ordering should default ascending and honor descending.', async () => {
                const ownerCookie = await signInTestingUser(TEST_OWNER_USERNAME)
                const ascendingResponse = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    { filters: {}, limit: 100, offset: 0 },
                    { cookie: ownerCookie },
                )
                const descendingResponse = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    {
                        filters: {},
                        limit: 100,
                        offset: 0,
                        sortOrder: 'desc',
                    },
                    { cookie: ownerCookie },
                )
                const ascending =
                    await ascendingResponse.json<
                        TApiResponsePaginatedOk<
                            Array<{ name: string; slug: string }>
                        >
                    >()
                const descending =
                    await descendingResponse.json<
                        TApiResponsePaginatedOk<
                            Array<{ name: string; slug: string }>
                        >
                    >()
                const ascendingSlugs = ascending.data.map(({ slug }) => slug)
                const descendingSlugs = descending.data.map(({ slug }) => slug)

                expect(ascendingResponse.status).toBe(200)
                expect(descendingResponse.status).toBe(200)
                expect(
                    ascendingSlugs.indexOf(TEST_ISOLATED_ORGANIZATION_SLUG),
                ).toBeLessThan(
                    ascendingSlugs.indexOf(TEST_PRIMARY_ORGANIZATION_SLUG),
                )
                expect(
                    descendingSlugs.indexOf(TEST_ISOLATED_ORGANIZATION_SLUG),
                ).toBeGreaterThan(
                    descendingSlugs.indexOf(TEST_PRIMARY_ORGANIZATION_SLUG),
                )
            })

            it('Unauthenticated organization requests should fail.', async () => {
                const listResponse = await queryTestingRequest(
                    '/api/auth/organization/readMany',
                    {},
                )
                const switchResponse = await app.request(
                    '/api/auth/organization/setActive',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            organizationSlug: TEST_PRIMARY_ORGANIZATION_SLUG,
                        }),
                    },
                    env,
                )

                expect(listResponse.status).toBe(401)
                expect(switchResponse.status).toBe(401)
            })

            it('Organization readMany should allow QUERY preflight.', async () => {
                const preflightResponse = await app.request(
                    '/api/auth/organization/readMany',
                    {
                        method: 'OPTIONS',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'access-control-request-method': 'QUERY',
                            'access-control-request-headers': 'content-type',
                        },
                    },
                    env,
                )

                expect(preflightResponse.status).toBe(204)
                expect(
                    preflightResponse.headers.get(
                        'access-control-allow-methods',
                    ),
                ).toContain('QUERY')
            })

            it('Selecting an unavailable organization should fail.', async () => {
                const isolatedCookie =
                    await signInTestingUser(TEST_MEMBER_USERNAME)
                const response = await app.request(
                    '/api/auth/organization/setActive',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                            cookie: isolatedCookie,
                        },
                        body: JSON.stringify({
                            organizationSlug: '__test-isolated',
                        }),
                    },
                    env,
                )
                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData.error.code).toBe('UNPROCESSABLE_CONTENT')
            })
        })

        describe('Sign-in', () => {
            describe('Username', () => {
                it('Sign-in with valid credentials should pass.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
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

                    const responseData =
                        await response.json<TApiResponseOk<null>>()

                    expect(response.status).toBe(200)
                    expect(response.headers.get('set-cookie')).toBeTruthy()
                    const sessionCookie = response.headers
                        .getSetCookie()
                        .find((cookie) =>
                            cookie.startsWith('__Host-test_session_token='),
                        )

                    expect(sessionCookie).toBeDefined()
                    expect(sessionCookie?.toLowerCase()).toContain('secure')
                    expect(sessionCookie?.toLowerCase()).toContain('path=/')
                    expect(sessionCookie?.toLowerCase()).not.toContain(
                        'domain=',
                    )
                    expect(sessionCookie).not.toContain('__Secure-__Host-')
                    expect(responseData.data).toBeNull()

                    const sessionResponse = await app.request(
                        '/api/auth/session',
                        {
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                cookie: sessionCookie!.split(';')[0],
                            },
                        },
                        env,
                    )
                    const sessionData =
                        await sessionResponse.json<
                            TApiResponseOk<TSessionResponseData>
                        >()
                    const sessionToken = decodeURIComponent(
                        sessionCookie!.split(';', 1)[0].split('=', 2)[1],
                    ).split('.')[0]
                    const sessionDb = dbClient(env.HYPERIONPUB_D1)
                    let persistedSession

                    try {
                        ;[persistedSession] = await sessionDb
                            .select({
                                token: dbSchema.session.token,
                                userId: dbSchema.session.userId,
                                activeOrganizationId:
                                    dbSchema.session.activeOrganizationId,
                            })
                            .from(dbSchema.session)
                            .where(eq(dbSchema.session.token, sessionToken))
                    } finally {
                        // D1 clients do not require teardown.
                    }

                    const [
                        kvSession,
                        kvMetadata,
                        aclCache,
                    ] = await Promise.all([
                        env.HYPERIONPUB_KV.get(sessionToken),
                        env.HYPERIONPUB_KV.get(
                            `active-sessions-${TEST_OWNER_USER_ID}`,
                        ),
                        env.HYPERIONPUB_KV.get(
                            'api-public:cache:acl:v20260825',
                        ),
                    ])

                    expect(sessionData.data.organizationName).toBe(
                        '__TEST-PRIMARY ORGANIZATION',
                    )
                    expect(sessionData.data.organizationSlug).toBe(
                        TEST_PRIMARY_ORGANIZATION_SLUG,
                    )
                    expect(sessionData.data.userRoles).toEqual(['owner'])
                    expect(sessionData.data.permissions).toEqual({})
                    expect(sessionData.data).not.toHaveProperty('roles')
                    expect(persistedSession).toEqual({
                        token: sessionToken,
                        userId: TEST_OWNER_USER_ID,
                        activeOrganizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    })
                    expect(kvSession).toBeNull()
                    expect(kvMetadata).toBeNull()
                    expect(aclCache).toBeTruthy()
                })

                it('Sign-in with missing Organization ID should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                accountId: TEST_OWNER_USERNAME,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(400)
                    expect(responseData).toHaveProperty('error')
                })

                it('Sign-in with invalid Organization ID should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: 'INVALID',
                                accountId: TEST_OWNER_USERNAME,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with invalid username should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: 'INVALID',
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with invalid password should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_OWNER_USERNAME,
                                password: 'P@ssw0rd4321',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with weak password should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_OWNER_USERNAME,
                                password: 'weak',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(400)
                    expect(responseData).toHaveProperty('error')
                })

                it('Sign-in with locked account should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_LOCKED_USERNAME,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.code).toBe(
                        'UNPROCESSABLE_CONTENT',
                    )
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with multi-role membership should return parsed user roles.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/username',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_MULTI_ROLE_USERNAME,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseOk<null>>()

                    expect(response.status).toBe(200)
                    expect(responseData.data).toBeNull()
                    const sessionResponse = await app.request(
                        '/api/auth/session',
                        {
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                cookie: response.headers
                                    .getSetCookie()[0]
                                    .split(';')[0],
                            },
                        },
                        env,
                    )
                    const sessionData =
                        await sessionResponse.json<
                            TApiResponseOk<TSessionResponseData>
                        >()
                    expect(sessionData.data.userRoles).toEqual([
                        'owner',
                        'admin',
                        'member',
                    ])
                    expect(sessionData.data.permissions).toEqual({})
                })
            })

            describe('E-mail', () => {
                it('Sign-in with valid credentials should pass.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_OWNER_EMAIL,
                                password: 'P@ssw0rd1234',
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

                it('Sign-in with missing Organization ID should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                accountId: TEST_OWNER_EMAIL,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(400)
                    expect(responseData).toHaveProperty('error')
                })

                it('Sign-in with invalid Organization ID should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: 'INVALID',
                                accountId: TEST_OWNER_EMAIL,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with invalid e-mail should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: 'INVALID@INVALID.invalid',
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with invalid password should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_OWNER_EMAIL,
                                password: 'P@ssw0rd4321',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })

                it('Sign-in with weak password should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_OWNER_EMAIL,
                                password: 'weak',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(400)
                    expect(responseData).toHaveProperty('error')
                })

                it('Sign-in with locked account should fail.', async () => {
                    const response = await app.request(
                        '/api/auth/signIn/email',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                                'content-type': 'application/json',
                            },
                            body: JSON.stringify({
                                organizationId: TEST_PRIMARY_ORGANIZATION_SLUG,
                                accountId: TEST_LOCKED_EMAIL,
                                password: 'P@ssw0rd1234',
                            }),
                        },
                        env,
                    )

                    const responseData =
                        await response.json<TApiResponseError>()

                    expect(response.status).toBe(422)
                    expect(responseData).toHaveProperty('error')
                    expect(responseData.error.code).toBe(
                        'UNPROCESSABLE_CONTENT',
                    )
                    expect(responseData.error.message).toBe(
                        'Invalid credentials provided.',
                    )
                })
            })
        })

        describe('Sign-out', { concurrent: false }, () => {
            it('Sign-out with valid session should pass.', async () => {
                // Sign in first to get a session cookie
                const signInResponse = await app.request(
                    '/api/auth/signIn/username',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
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

                const setCookies = signInResponse.headers.getSetCookie()
                const sessionTokenCookie = setCookies.find((cookie) =>
                    cookie.startsWith('__Host-test_session_token='),
                )
                expect(sessionTokenCookie).toBeDefined()
                const sessionToken = decodeURIComponent(
                    sessionTokenCookie!.split(';', 1)[0].split('=', 2)[1],
                ).split('.')[0]
                const sessionCookie = setCookies.join('; ')
                const db = dbClient(env.HYPERIONPUB_D1)
                const readAuthorizationVersion = async () =>
                    (
                        await db
                            .select({
                                value: dbSchema.member
                                    .websocketAuthorizationVersion,
                            })
                            .from(dbSchema.member)
                            .where(
                                and(
                                    eq(
                                        dbSchema.member.organizationId,
                                        TEST_PRIMARY_ORGANIZATION_ID,
                                    ),
                                    eq(
                                        dbSchema.member.userId,
                                        TEST_OWNER_USER_ID,
                                    ),
                                ),
                            )
                            .limit(1)
                    )[0]?.value
                const previousAuthorizationVersion =
                    await readAuthorizationVersion()

                try {
                    const response = await postTestingRequest(
                        '/api/auth/signOut',
                        {
                            cookie: sessionCookie,
                            waitForCfExecutionContext: true,
                        },
                    )
                    const responseData =
                        await response.json<TApiResponseOk<null>>()

                    expect(response.status).toBe(200)
                    expect(response.headers.get('set-cookie')).toBeTruthy()
                    expect(responseData.success).toBe(true)
                    expect(responseData.data).toBeNull()
                    expect(await readAuthorizationVersion()).not.toBe(
                        previousAuthorizationVersion,
                    )
                    const [persistedSession] = await db
                        .select({ id: dbSchema.session.id })
                        .from(dbSchema.session)
                        .where(eq(dbSchema.session.token, sessionToken))
                    expect(persistedSession).toBeUndefined()
                } finally {
                    // D1 clients do not require teardown.
                }
            }, 20_000)
        })

        describe.concurrent('Email Verification Validation', () => {
            it('Missing token should return 400.', async () => {
                const response = await postTestingRequest(
                    '/api/auth/verifyEmail',
                    { body: {} },
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData.error.code).toBe('DATA_VALIDATION')
            })

            it('Invalid token should return 422.', async () => {
                const response = await postTestingRequest(
                    '/api/auth/verifyEmail',
                    { body: { token: 'invalid-token' } },
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData.error.code).toBe('UNPROCESSABLE_CONTENT')
                expect(responseData.error.message).toBe(
                    'Email verification failed. The token may be invalid or expired.',
                )
            })

            it('Expired token should return 422.', async () => {
                const token = await createEmailVerificationToken(
                    env.BETTER_AUTH_SECRET,
                    'expired.email.verification.public@test.hyperion.app',
                    undefined,
                    -1,
                )
                const response = await postTestingRequest(
                    '/api/auth/verifyEmail',
                    { body: { token } },
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData.error.code).toBe('UNPROCESSABLE_CONTENT')
                expect(responseData.error.message).toBe(
                    'Email verification failed. The token may be invalid or expired.',
                )
            })
        })

        describe.concurrent('Password Change Validation', () => {
            it('Unauthenticated request should return 401.', async () => {
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            currentPassword: 'P@ssw0rd1234',
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(401)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.code).toBe('UNAUTHORIZED')
            })

            it('Missing currentPassword should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify({
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Missing newPassword should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'P@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Weak newPassword should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'P@ssw0rd1234',
                            newPassword: 'weak',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Incorrect currentPassword should return 422.', async () => {
                const response = await app.request(
                    '/api/auth/password/change',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify({
                            currentPassword: 'Wr0ng@P@ssw0rd99',
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe(
                    'Password change failed. Please verify your current password.',
                )
            })
        })

        describe.concurrent('Password Reset Request', () => {
            it('Missing email should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({}),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Invalid email format should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            email: 'not-an-email',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Valid email should return 200.', async () => {
                const response = await app.request(
                    '/api/auth/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            email: TEST_MEMBER_EMAIL,
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()
            })

            it('Non-existent email should silently succeed with 200.', async () => {
                const response = await app.request(
                    '/api/auth/password/resetRequest',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            email: '__TEST-nonexistent@test.hyperion.app',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseOk<null>>()

                expect(response.status).toBe(200)
                expect(responseData.success).toBe(true)
                expect(responseData.data).toBeNull()
            })
        })

        describe.concurrent('Password Reset Validation', () => {
            it('Missing token should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Missing newPassword should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            token: 'some-token-value',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Weak newPassword should return 400.', async () => {
                const response = await app.request(
                    '/api/auth/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            token: 'some-token-value',
                            newPassword: 'weak',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(400)
                expect(responseData).toHaveProperty('error')
            })

            it('Invalid token should return 422.', async () => {
                const response = await app.request(
                    '/api/auth/password/reset',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'cf-connecting-ip': TEST_DEFAULT_CLIENT_IP,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({
                            token: 'invalid-token-value-here',
                            newPassword: 'N3wP@ssw0rd1234',
                        }),
                    },
                    env,
                )

                const responseData = await response.json<TApiResponseError>()

                expect(response.status).toBe(422)
                expect(responseData).toHaveProperty('error')
                expect(responseData.error.message).toBe(
                    'Password reset failed. The token may be invalid or expired.',
                )
            })
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
