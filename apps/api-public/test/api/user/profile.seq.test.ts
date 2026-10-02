import { dbClient, dbSchema } from '@hyperion/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { and, desc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'
import {
    seedTestingCookies,
    TEST_MEMBER_USER_ID,
    TEST_MEMBER_USER_PUBLIC_ID,
} from '../../utilities.js'

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

const expectProfileContract = (data: object, includesUserId = false) => {
    expect(data).not.toHaveProperty('addressId')
    expect(data).not.toHaveProperty('createdAt')
    expect(data).not.toHaveProperty('updatedAt')

    if (includesUserId) expect(data).toHaveProperty('userId')
    else expect(data).not.toHaveProperty('userId')
}

const profileUpdatePayload = {
    backupPhoneNumber: '09171234567',
    firstName: 'TEST',
    gender: 'MALE' as const,
    lastName: 'PROFILE',
}

let db: ReturnType<typeof dbClient>

function sqlProfileAuditRecord(publicId: string) {
    return sql`EXISTS (
        SELECT 1 FROM json_each(${dbSchema.auditTrail.records})
        WHERE json_extract(value, '$.id') = ${publicId}
          AND json_extract(value, '$.table') = 'user_profile'
    )`
}

beforeAll(async () => {
    db = dbClient(env.HYPERIONPUB_D1)
    ;[
        ,
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

describe('User Profile Endpoint', () => {
    describe('Sequential Tests', () => {
        it('User profile reads and updates should return object data.', async () => {
            const userReadResponse = await app.request(
                '/api/user/profile/read',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: standardCookie,
                    },
                },
                env,
            )
            const userReadJson =
                await userReadResponse.json<TApiResponseOk<TProfileData>>()

            expect(userReadResponse.status).toBe(200)
            expect(Array.isArray(userReadJson.data)).toBe(false)
            expectProfileContract(userReadJson.data)

            const userUpdateResponse = await app.request(
                '/api/user/profile/update',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'content-type': 'application/json',
                        cookie: standardCookie,
                    },
                    body: JSON.stringify(profileUpdatePayload),
                },
                env,
            )
            const userUpdateJson =
                await userUpdateResponse.json<TApiResponseOk<TProfileData>>()

            expect(userUpdateResponse.status).toBe(200)
            expect(Array.isArray(userUpdateJson.data)).toBe(false)
            expectProfileContract(userUpdateJson.data)
        })

        it('Rejects one stale concurrent profile update and audits the winner.', async () => {
            const firstNames = [
                'CONCURRENT-A',
                'CONCURRENT-B',
            ]
            const responses = await Promise.all(
                firstNames.map((firstName) =>
                    app.request(
                        '/api/user/profile/update',
                        {
                            method: 'POST',
                            headers: {
                                origin: env.URL_FRONTEND,
                                'content-type': 'application/json',
                                cookie: standardCookie,
                            },
                            body: JSON.stringify({
                                ...profileUpdatePayload,
                                firstName,
                            }),
                        },
                        env,
                    ),
                ),
            )

            expect(responses.map(({ status }) => status).sort()).toEqual([
                200,
                409,
            ])

            const audits = await db
                .select({ records: dbSchema.auditTrail.records })
                .from(dbSchema.auditTrail)
                .where(
                    and(
                        eq(dbSchema.auditTrail.component, 'user.profile'),
                        eq(dbSchema.auditTrail.action, 'update'),
                        sqlProfileAuditRecord(TEST_MEMBER_USER_PUBLIC_ID),
                    ),
                )
                .orderBy(desc(dbSchema.auditTrail.id))
                .limit(1)
            const transition = audits[0]?.records?.find(
                ({ id }) => id === TEST_MEMBER_USER_PUBLIC_ID,
            )

            expect(transition?.oldData).toMatchObject({ firstName: 'TEST' })
            expect(firstNames).toContain(transition?.newData?.firstName)
        })

        it('Returns the contracted errors when the self profile row is missing.', async () => {
            if (!originalMemberProfile)
                throw new Error('Profile fixture missing.')

            await db
                .delete(dbSchema.userProfile)
                .where(eq(dbSchema.userProfile.userId, TEST_MEMBER_USER_ID))
            try {
                const readResponse = await app.request(
                    '/api/user/profile/read',
                    {
                        method: 'GET',
                        headers: {
                            origin: env.URL_FRONTEND,
                            cookie: standardCookie,
                        },
                    },
                    env,
                )
                const updateResponse = await app.request(
                    '/api/user/profile/update',
                    {
                        method: 'POST',
                        headers: {
                            origin: env.URL_FRONTEND,
                            'content-type': 'application/json',
                            cookie: standardCookie,
                        },
                        body: JSON.stringify(profileUpdatePayload),
                    },
                    env,
                )
                const readJson = await readResponse.json<TApiResponseError>()
                const updateJson =
                    await updateResponse.json<TApiResponseError>()

                expect(readResponse.status).toBe(404)
                expect(readJson.error.code).toBe('NOT_FOUND')
                expect(updateResponse.status).toBe(404)
                expect(updateJson.error.code).toBe('NOT_FOUND')
            } finally {
                await db.insert(dbSchema.userProfile).values({
                    userId: TEST_MEMBER_USER_ID,
                    ...originalMemberProfile,
                })
            }
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
