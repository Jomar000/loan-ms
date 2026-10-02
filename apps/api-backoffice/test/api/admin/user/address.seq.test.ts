import { dbClient, dbSchema } from '@hyperion/database/d1'
import type { TApiResponseOk } from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { and, eq, like } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
    getTestingRequest,
    postTestingRequest,
    seedTestingCookies,
    TEST_MEMBER_USER_ID,
    TEST_MEMBER_USER_PUBLIC_ID,
} from '../../../utilities.js'

type TAddress = { publicId: string }

let db: ReturnType<typeof dbClient>
let privilegedCookie: string
let testAddressPublicId: string

const cleanTestAddress = async () => {
    await db
        .delete(dbSchema.userAddress)
        .where(
            and(
                eq(dbSchema.userAddress.userId, TEST_MEMBER_USER_ID),
                like(dbSchema.userAddress.label, '__TEST-ADDRESS-ADMIN%'),
            ),
        )
}

beforeAll(async () => {
    db = dbClient(env.HYPERIONBOFC_D1)
    const cookies = await seedTestingCookies()
    privilegedCookie = cookies[0]

    await cleanTestAddress()

    const response = await postTestingRequest('/api/user/address/create', {
        cookie: cookies[1],
        body: {
            addressLine1: 'Admin provenance address',
            countryCode: 'sg',
            idempotencyKey: '00000000-0000-7000-8000-000000000103',
            label: '__TEST-ADDRESS-ADMIN',
            locality: 'Singapore',
            makePrimary: false,
            postalCode: '018956',
            type: 'OTHER',
        },
    })
    const responseData = await response.json<TApiResponseOk<TAddress>>()

    if (response.status !== 201)
        throw new Error('Admin address fixture was not created.')

    testAddressPublicId = responseData.data.publicId
})

afterAll(async () => {
    try {
        await cleanTestAddress()
    } finally {
        // D1 clients do not require teardown.
    }
})

describe('Admin user address endpoint', () => {
    it('rejects an internal user ID as an administrative selector.', async () => {
        const response = await getTestingRequest(
            '/api/admin/user/address/readMany',
            {
                cookie: privilegedCookie,
                query: { userPublicId: TEST_MEMBER_USER_ID },
            },
        )

        expect(response.status).toBe(400)
    })

    it('allows an administrator to read a member address book.', async () => {
        const response = await getTestingRequest(
            '/api/admin/user/address/readMany',
            {
                cookie: privilegedCookie,
                query: { userPublicId: TEST_MEMBER_USER_PUBLIC_ID },
            },
        )
        const responseData = await response.json<TApiResponseOk<TAddress[]>>()

        expect(response.status).toBe(200)
        expect(responseData.success).toBe(true)
        expect(responseData.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ publicId: testAddressPublicId }),
            ]),
        )
        const testAddress = responseData.data.find(
            ({ publicId }) => publicId === testAddressPublicId,
        )

        expect(testAddress).toBeDefined()
        expect(testAddress).not.toHaveProperty('id')
        expect(testAddress).not.toHaveProperty('userId')
        expect(testAddress).not.toHaveProperty('createdAt')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
