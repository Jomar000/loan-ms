import { dbClient, dbSchema } from '@hyperion/database/d1'
import type {
    TApiResponseError,
    TApiResponseOk,
    TApiResponsePaginatedOk,
} from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { asc, count as countFn, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../../../src/core/index.js'
import {
    queryTestingRequest,
    seedTestingCookies,
    TEST_MEMBER_USER_ID,
    TEST_MEMBER_USER_PUBLIC_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../../utilities.js'

let privilegedCookie: string
let standardCookie: string
let originalMemberProfile: TProfileData | undefined
type TProfileData = {
    backupPhoneNumber: string | null
    firstName: string
    gender: 'MALE' | 'FEMALE'
    lastName: string
    middleName: string | null
    nameExtension: string | null
}

type TAdminProfileData = TProfileData & { userPublicId: string }

const expectProfileContract = (data: object, includesUserPublicId = false) => {
    expect(data).not.toHaveProperty('addressId')
    expect(data).not.toHaveProperty('createdAt')
    expect(data).not.toHaveProperty('updatedAt')

    expect(Object.keys(data).sort()).toEqual(
        [
            'backupPhoneNumber',
            'firstName',
            'gender',
            'lastName',
            'middleName',
            'nameExtension',
            ...(includesUserPublicId ? ['userPublicId'] : []),
        ].sort(),
    )
    if (includesUserPublicId) expect(data).toHaveProperty('userPublicId')
    else expect(data).not.toHaveProperty('userPublicId')
}

const profileUpdatePayload = {
    backupPhoneNumber: '09171234567',
    firstName: 'TEST',
    gender: 'MALE' as const,
    lastName: 'PROFILE',
}

let db: ReturnType<typeof dbClient>

beforeAll(async () => {
    db = dbClient(env.HYPERIONPUB_D1)
    ;[
        privilegedCookie,
        standardCookie,
    ] = await seedTestingCookies()

    const { userProfile } = dbSchema

    ;[originalMemberProfile] = await db
        .select({
            backupPhoneNumber: userProfile.backupPhoneNumber,
            firstName: userProfile.firstName,
            gender: userProfile.gender,
            lastName: userProfile.lastName,
            middleName: userProfile.middleName,
            nameExtension: userProfile.nameExtension,
        })
        .from(userProfile)
        .where(eq(userProfile.userId, TEST_MEMBER_USER_ID))

    if (!originalMemberProfile) {
        throw new Error('Seeded test member profile was not found.')
    }
})

afterAll(async () => {
    try {
        if (originalMemberProfile) {
            await db
                .update(dbSchema.userProfile)
                .set(originalMemberProfile)
                .where(eq(dbSchema.userProfile.userId, TEST_MEMBER_USER_ID))
        }
    } finally {
        // D1 clients do not require teardown.
    }
})

describe('Admin user profile endpoint', () => {
    describe('Sequential Tests', () => {
        it('Admin profile list should return paginated metadata.', async () => {
            const { member, user, userProfile } = dbSchema
            const expectedRows = await db
                .select({ userPublicId: user.publicId })
                .from(userProfile)
                .innerJoin(member, eq(member.userId, userProfile.userId))
                .innerJoin(user, eq(user.id, userProfile.userId))
                .where(eq(member.organizationId, TEST_PRIMARY_ORGANIZATION_ID))
                .limit(2)
                .orderBy(asc(userProfile.userId))
            const [{ count: expectedCount }] = await db
                .select({ count: countFn(userProfile.userId) })
                .from(userProfile)
                .innerJoin(member, eq(member.userId, userProfile.userId))
                .where(eq(member.organizationId, TEST_PRIMARY_ORGANIZATION_ID))
            const response = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                {
                    limit: '2',
                    offset: '0',
                    sortOrder: 'asc',
                },
                { cookie: privilegedCookie },
            )
            const responseJson =
                await response.json<
                    TApiResponsePaginatedOk<TAdminProfileData[]>
                >()

            expect(response.status).toBe(200)
            expect(Array.isArray(responseJson.data)).toBe(true)
            expect(responseJson.count).toBe(expectedCount)
            expect(
                responseJson.data.map(({ userPublicId }) => userPublicId),
            ).toEqual(expectedRows.map(({ userPublicId }) => userPublicId))
            expect(responseJson.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                    }),
                ]),
            )
            expect(responseJson.limit).toBe(2)
            expect(responseJson.offset).toBe(0)
            responseJson.data.forEach((data) =>
                expectProfileContract(data, true),
            )
        })

        it('Admin profile list should apply defaults and validate input.', async () => {
            const defaultResponse = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                {},
                { cookie: privilegedCookie },
            )
            const defaultResponseJson =
                await defaultResponse.json<
                    TApiResponsePaginatedOk<TAdminProfileData[]>
                >()
            const invalidResponse = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                { limit: 101 },
                { cookie: privilegedCookie },
            )
            const fractionalLimitResponse = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                { limit: 1.5 },
                { cookie: privilegedCookie },
            )
            const fractionalOffsetResponse = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                { offset: '1.5' },
                { cookie: privilegedCookie },
            )

            expect(defaultResponse.status).toBe(200)
            expect(defaultResponseJson.limit).toBe(100)
            expect(defaultResponseJson.offset).toBe(0)
            expect(invalidResponse.status).toBe(400)
            expect(fractionalLimitResponse.status).toBe(400)
            expect(fractionalOffsetResponse.status).toBe(400)
        })

        it('Admin profile list should enforce access and allow QUERY preflight.', async () => {
            const unauthenticatedResponse = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                {},
            )
            const unauthorizedResponse = await queryTestingRequest(
                '/api/admin/user/profile/readMany',
                {},
                { cookie: standardCookie },
            )
            const preflightResponse = await app.request(
                '/api/admin/user/profile/readMany',
                {
                    method: 'OPTIONS',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'access-control-request-method': 'QUERY',
                        'access-control-request-headers': 'content-type',
                    },
                },
                env,
            )

            expect(unauthenticatedResponse.status).toBe(401)
            expect(unauthorizedResponse.status).toBe(403)
            expect(preflightResponse.status).toBe(204)
            expect(
                preflightResponse.headers.get('access-control-allow-methods'),
            ).toContain('QUERY')
        })

        it('Admin profile reads and updates should return object data.', async () => {
            const internalIdResponse = await app.request(
                `/api/admin/user/profile/read?userPublicId=${TEST_MEMBER_USER_ID}`,
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                    },
                },
                env,
            )
            const adminReadResponse = await app.request(
                `/api/admin/user/profile/read?userPublicId=${TEST_MEMBER_USER_PUBLIC_ID}`,
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                    },
                },
                env,
            )
            const adminReadJson =
                await adminReadResponse.json<
                    TApiResponseOk<TAdminProfileData>
                >()

            expect(internalIdResponse.status).toBe(400)
            expect(adminReadResponse.status).toBe(200)
            expect(Array.isArray(adminReadJson.data)).toBe(false)
            expectProfileContract(adminReadJson.data, true)

            const adminUpdateResponse = await app.request(
                '/api/admin/user/profile/update',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'content-type': 'application/json',
                        cookie: privilegedCookie,
                    },
                    body: JSON.stringify({
                        userPublicId: TEST_MEMBER_USER_PUBLIC_ID,
                        ...profileUpdatePayload,
                    }),
                },
                env,
            )
            const adminUpdateJson =
                await adminUpdateResponse.json<
                    TApiResponseOk<TAdminProfileData>
                >()

            expect(adminUpdateResponse.status).toBe(200)
            expect(Array.isArray(adminUpdateJson.data)).toBe(false)
            expectProfileContract(adminUpdateJson.data, true)
        })

        it('Admin profile reads and updates return the contracted missing-target errors.', async () => {
            const missingPublicId = '019936e2-b837-7000-8000-00000000ffff'
            const readResponse = await app.request(
                `/api/admin/user/profile/read?userPublicId=${missingPublicId}`,
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                    },
                },
                env,
            )
            const updateResponse = await app.request(
                '/api/admin/user/profile/update',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'content-type': 'application/json',
                        cookie: privilegedCookie,
                    },
                    body: JSON.stringify({
                        userPublicId: missingPublicId,
                        ...profileUpdatePayload,
                    }),
                },
                env,
            )
            const readJson = await readResponse.json<TApiResponseError>()
            const updateJson = await updateResponse.json<TApiResponseError>()

            expect(readResponse.status).toBe(404)
            expect(readJson.error.code).toBe('NOT_FOUND')
            expect(updateResponse.status).toBe(404)
            expect(updateJson.error.code).toBe('NOT_FOUND')
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
