import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'
import {
    getTestingRequest,
    postTestingRequest,
    seedTestingCookieForOrganization,
    seedTestingCookies,
    TEST_AUTH_MUTABLE_USER_ID,
    TEST_MEMBER_USER_ID,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../utilities.js'

type TAddress = {
    publicId: string
    type: 'RESIDENTIAL' | 'MAILING' | 'OTHER'
    label: string | null
    isPrimary: boolean
    addressLine1: string
    addressLine2: string | null
    dependentLocality: string | null
    locality: string | null
    administrativeArea: string | null
    postalCode: string | null
    countryCode: string
    psgcCode: string | null
}

const mailingAddress = {
    type: 'MAILING' as const,
    label: '__TEST-ADDRESS-MAILING',
    addressLine1: '25 Mixed Case Street',
    addressLine2: 'Unit Á',
    dependentLocality: 'Barangay Test',
    locality: 'Test City',
    administrativeArea: 'Test Province',
    postalCode: 'AB1 2CD',
    countryCode: 'ph',
    psgcCode: '1381300000',
    makePrimary: true,
    idempotencyKey: '00000000-0000-7000-8000-000000000101',
}

const otherAddress = {
    type: 'OTHER' as const,
    label: '__TEST-ADDRESS-OTHER',
    addressLine1: 'PO Box 42',
    locality: 'Singapore',
    postalCode: '018956',
    countryCode: 'sg',
    makePrimary: false,
    idempotencyKey: '00000000-0000-7000-8000-000000000102',
}

const testAddressLabels = [
    mailingAddress.label,
    otherAddress.label,
    '__TEST-ADDRESS-FOREIGN',
    '__TEST-ADDRESS-FIRST-A',
    '__TEST-ADDRESS-FIRST-B',
]

let db: ReturnType<typeof dbClient>
let standardCookie: string
let mailingPublicId: string
let otherPublicId: string
let foreignAddressPublicId: string
let mutableCookie: string

function sqlAddressAuditRecord(publicId: string) {
    return sql`EXISTS (
        SELECT 1 FROM json_each(${dbSchema.auditTrail.records})
        WHERE json_extract(value, '$.id') = ${publicId}
          AND json_extract(value, '$.table') = 'user_address'
    )`
}

beforeAll(async () => {
    db = dbClient(env.LOANMSPUB_D1)
    ;[
        ,
        standardCookie,
    ] = await seedTestingCookies()
    mutableCookie = await seedTestingCookieForOrganization(
        TEST_AUTH_MUTABLE_USER_ID,
        TEST_PRIMARY_ORGANIZATION_ID,
    )

    await db.delete(dbSchema.userAddress).where(
        and(
            inArray(dbSchema.userAddress.userId, [
                TEST_MEMBER_USER_ID,
                TEST_OWNER_USER_ID,
                TEST_AUTH_MUTABLE_USER_ID,
            ]),
            inArray(dbSchema.userAddress.label, testAddressLabels),
        ),
    )

    const [foreignAddress] = await db
        .insert(dbSchema.userAddress)
        .values({
            addressLine1: 'Foreign owner address',
            countryCode: 'SG',
            idempotencyKey: '00000000-0000-7000-8000-000000000105',
            isPrimary: false,
            label: '__TEST-ADDRESS-FOREIGN',
            locality: 'Singapore',
            postalCode: '018956',
            type: 'OTHER',
            userId: TEST_OWNER_USER_ID,
        })
        .returning({ publicId: dbSchema.userAddress.publicId })

    if (!foreignAddress)
        throw new Error('Foreign-owner address fixture was not created.')

    foreignAddressPublicId = foreignAddress.publicId
})

afterAll(async () => {
    try {
        await db.delete(dbSchema.userAddress).where(
            and(
                inArray(dbSchema.userAddress.userId, [
                    TEST_MEMBER_USER_ID,
                    TEST_OWNER_USER_ID,
                    TEST_AUTH_MUTABLE_USER_ID,
                ]),
                inArray(dbSchema.userAddress.label, testAddressLabels),
            ),
        )
    } finally {
        // D1 clients do not require teardown.
    }
})

const readAddresses = async (cookie = standardCookie) => {
    const response = await getTestingRequest('/api/user/address/readMany', {
        cookie,
    })
    const responseData = await response.json<TApiResponseOk<TAddress[]>>()

    expect(response.status).toBe(200)
    expect(responseData.success).toBe(true)
    return responseData.data
}

describe('User Address Endpoint', () => {
    describe('Sequential Tests', () => {
        it('Should require authentication.', async () => {
            const response = await getTestingRequest(
                '/api/user/address/readMany',
            )
            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(401)
            expect(responseData.error.code).toBe('UNAUTHORIZED')
        })

        it('Should create an idempotent primary mailing address.', async () => {
            const oldPrimary = (await readAddresses()).find(
                ({ isPrimary }) => isPrimary,
            )
            const first = await postTestingRequest('/api/user/address/create', {
                cookie: standardCookie,
                body: mailingAddress,
            })
            const firstData = await first.json<TApiResponseOk<TAddress>>()

            const retry = await postTestingRequest('/api/user/address/create', {
                cookie: standardCookie,
                body: mailingAddress,
            })
            const retryData = await retry.json<TApiResponseOk<TAddress>>()

            expect(first.status).toBe(201)
            expect(retry.status).toBe(201)
            expect(firstData.data.publicId).toBe(retryData.data.publicId)
            expect(firstData.data).toMatchObject({
                addressLine1: '25 Mixed Case Street',
                addressLine2: 'Unit Á',
                countryCode: 'PH',
                isPrimary: true,
                psgcCode: '1381300000',
            })

            mailingPublicId = firstData.data.publicId
            const [audit] = await db
                .select({ records: dbSchema.auditTrail.records })
                .from(dbSchema.auditTrail)
                .where(
                    and(
                        eq(dbSchema.auditTrail.component, 'user.address'),
                        eq(dbSchema.auditTrail.action, 'create'),
                        sqlAddressAuditRecord(mailingPublicId),
                    ),
                )
                .orderBy(desc(dbSchema.auditTrail.id))
                .limit(1)
            expect(audit.records).toContainEqual(
                expect.objectContaining({
                    id: mailingPublicId,
                    newData: expect.objectContaining({
                        isPrimary: true,
                        dependentLocality: mailingAddress.dependentLocality,
                        locality: mailingAddress.locality,
                        administrativeArea: mailingAddress.administrativeArea,
                    }),
                }),
            )
            if (oldPrimary) {
                expect(audit.records).toContainEqual(
                    expect.objectContaining({
                        id: oldPrimary.publicId,
                        oldData: expect.objectContaining({ isPrimary: true }),
                        newData: expect.objectContaining({ isPrimary: false }),
                    }),
                )
            }
            const addresses = await readAddresses()
            expect(
                addresses.filter(
                    (address) => address.label === mailingAddress.label,
                ),
            ).toHaveLength(1)
        })

        it('Should create and update an international address.', async () => {
            const response = await postTestingRequest(
                '/api/user/address/create',
                {
                    cookie: standardCookie,
                    body: otherAddress,
                },
            )
            const responseData = await response.json<TApiResponseOk<TAddress>>()
            otherPublicId = responseData.data.publicId

            const update = await postTestingRequest(
                '/api/user/address/update',
                {
                    cookie: standardCookie,
                    body: {
                        publicId: otherPublicId,
                        ...otherAddress,
                        addressLine1: 'P.O. Box 42 – 日本語',
                    },
                },
            )
            const updateData = await update.json<TApiResponseOk<TAddress>>()

            expect(response.status).toBe(201)
            expect(update.status).toBe(200)
            expect(updateData.data).toMatchObject({
                addressLine1: 'P.O. Box 42 – 日本語',
                countryCode: 'SG',
                isPrimary: false,
            })
        })

        it('Should reject one stale concurrent update and audit the winner.', async () => {
            const addressLine1Values = [
                'Concurrent address A',
                'Concurrent address B',
            ]
            const responses = await Promise.all(
                addressLine1Values.map((addressLine1) =>
                    postTestingRequest('/api/user/address/update', {
                        cookie: standardCookie,
                        body: {
                            publicId: otherPublicId,
                            ...otherAddress,
                            addressLine1,
                        },
                    }),
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
                        eq(dbSchema.auditTrail.component, 'user.address'),
                        eq(dbSchema.auditTrail.action, 'update'),
                        sqlAddressAuditRecord(otherPublicId),
                    ),
                )
                .orderBy(desc(dbSchema.auditTrail.id))
                .limit(1)
            const transition = audits[0]?.records?.find(
                ({ id }) => id === otherPublicId,
            )

            expect(transition?.oldData).toMatchObject({
                addressLine1: 'P.O. Box 42 – 日本語',
            })
            expect(addressLine1Values).toContain(
                transition?.newData?.addressLine1,
            )
        })

        it('Should roll back all primary flags when address auditing fails.', async () => {
            const before = await readAddresses()
            await env.LOANMSPUB_D1.prepare(
                `CREATE TRIGGER test_address_audit_failure
                 BEFORE INSERT ON audit_trail
                 WHEN NEW.component = 'user.address'
                 BEGIN
                     SELECT RAISE(ABORT, 'test address audit failure');
                 END`,
            ).run()
            try {
                const response = await postTestingRequest(
                    '/api/user/address/setPrimary',
                    {
                        cookie: standardCookie,
                        body: { publicId: otherPublicId },
                    },
                )
                expect(response.status).toBe(500)
                expect(await readAddresses()).toEqual(before)
            } finally {
                await env.LOANMSPUB_D1.exec(
                    'DROP TRIGGER IF EXISTS test_address_audit_failure',
                )
            }
        })

        it('Should enforce Philippine and PSGC validation rules.', async () => {
            const missingBarangay = await postTestingRequest(
                '/api/user/address/create',
                {
                    cookie: standardCookie,
                    body: {
                        ...mailingAddress,
                        idempotencyKey: '00000000-0000-7000-8000-000000000103',
                        dependentLocality: undefined,
                    },
                },
            )
            const foreignPsgc = await postTestingRequest(
                '/api/user/address/create',
                {
                    cookie: standardCookie,
                    body: {
                        ...otherAddress,
                        idempotencyKey: '00000000-0000-7000-8000-000000000104',
                        psgcCode: '1381300000',
                    },
                },
            )

            expect(missingBarangay.status).toBe(400)
            expect(foreignPsgc.status).toBe(400)
        })

        it('Should return 404 when mutating an address owned by another user.', async () => {
            const [before] = await db
                .select({
                    isPrimary: dbSchema.userAddress.isPrimary,
                    userId: dbSchema.userAddress.userId,
                })
                .from(dbSchema.userAddress)
                .where(
                    eq(dbSchema.userAddress.publicId, foreignAddressPublicId),
                )
            const response = await postTestingRequest(
                '/api/user/address/setPrimary',
                {
                    cookie: standardCookie,
                    body: { publicId: foreignAddressPublicId },
                },
            )
            const responseData = await response.json<TApiResponseError>()
            const [after] = await db
                .select({
                    isPrimary: dbSchema.userAddress.isPrimary,
                    userId: dbSchema.userAddress.userId,
                })
                .from(dbSchema.userAddress)
                .where(
                    eq(dbSchema.userAddress.publicId, foreignAddressPublicId),
                )

            expect(response.status).toBe(404)
            expect(responseData.error.code).toBe('ADDRESS_NOT_FOUND')
            expect(before).toEqual({
                isPrimary: false,
                userId: TEST_OWNER_USER_ID,
            })
            expect(after).toEqual(before)
        })

        it('Should serialize concurrent primary selections.', async () => {
            const responses = await Promise.all([
                postTestingRequest('/api/user/address/setPrimary', {
                    cookie: standardCookie,
                    body: { publicId: otherPublicId },
                }),
                postTestingRequest('/api/user/address/setPrimary', {
                    cookie: standardCookie,
                    body: { publicId: otherPublicId },
                }),
            ])

            expect(responses.map(({ status }) => status).sort()).toEqual([
                200,
                409,
            ])

            const addresses = await readAddresses()
            expect(
                addresses.filter((address) => address.isPrimary),
            ).toHaveLength(1)
            expect(
                addresses.find(({ publicId }) => publicId === otherPublicId),
            ).toMatchObject({ isPrimary: true })

            const [audit] = await db
                .select({ records: dbSchema.auditTrail.records })
                .from(dbSchema.auditTrail)
                .where(
                    and(
                        eq(dbSchema.auditTrail.component, 'user.address'),
                        eq(dbSchema.auditTrail.action, 'setPrimary'),
                        sqlAddressAuditRecord(mailingPublicId),
                        sqlAddressAuditRecord(otherPublicId),
                    ),
                )
                .limit(1)

            expect(audit?.records).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: mailingPublicId,
                        oldData: { isPrimary: true },
                        newData: { isPrimary: false },
                    }),
                    expect.objectContaining({
                        id: otherPublicId,
                        oldData: { isPrimary: false },
                        newData: { isPrimary: true },
                    }),
                ]),
            )
        })

        it('Should keep the first serialized concurrent address primary.', async () => {
            await db
                .delete(dbSchema.userAddress)
                .where(
                    eq(dbSchema.userAddress.userId, TEST_AUTH_MUTABLE_USER_ID),
                )

            const create = (label: string, idempotencyKey: string) =>
                postTestingRequest('/api/user/address/create', {
                    cookie: mutableCookie,
                    body: {
                        ...otherAddress,
                        label,
                        idempotencyKey,
                    },
                })
            const responses = await Promise.all([
                create(
                    '__TEST-ADDRESS-FIRST-A',
                    '00000000-0000-7000-8000-000000000106',
                ),
                create(
                    '__TEST-ADDRESS-FIRST-B',
                    '00000000-0000-7000-8000-000000000107',
                ),
            ])
            const rows = await db
                .select({
                    id: dbSchema.userAddress.id,
                    isPrimary: dbSchema.userAddress.isPrimary,
                })
                .from(dbSchema.userAddress)
                .where(
                    eq(dbSchema.userAddress.userId, TEST_AUTH_MUTABLE_USER_ID),
                )
                .orderBy(
                    dbSchema.userAddress.createdAt,
                    dbSchema.userAddress.id,
                )

            expect(responses.map(({ status }) => status)).toEqual([
                201,
                201,
            ])
            expect(rows).toHaveLength(2)
            expect(rows.filter(({ isPrimary }) => isPrimary)).toHaveLength(1)
            expect(rows[0].isPrimary).toBe(true)
        })

        it('Should allow one concurrent primary delete and audit its promoted replacement.', async () => {
            const before = await readAddresses()
            const primary = before.find(
                (address) =>
                    address.isPrimary &&
                    [
                        mailingPublicId,
                        otherPublicId,
                    ].includes(address.publicId),
            )

            expect(primary).toBeTruthy()

            const responses = await Promise.all(
                [
                    0,
                    1,
                ].map(() =>
                    postTestingRequest('/api/user/address/delete', {
                        cookie: standardCookie,
                        body: { publicId: primary!.publicId },
                    }),
                ),
            )

            expect(responses.map(({ status }) => status).sort()).toEqual([
                200,
                409,
            ])

            const after = await readAddresses()
            expect(
                after.some((address) => address.publicId === primary!.publicId),
            ).toBe(false)
            expect(after.filter((address) => address.isPrimary)).toHaveLength(1)
            const replacement = after.find((address) => address.isPrimary)
            expect(replacement).toBeDefined()

            const [audit] = await db
                .select({ records: dbSchema.auditTrail.records })
                .from(dbSchema.auditTrail)
                .where(
                    and(
                        eq(dbSchema.auditTrail.component, 'user.address'),
                        eq(dbSchema.auditTrail.action, 'delete'),
                        sqlAddressAuditRecord(primary!.publicId),
                        sqlAddressAuditRecord(replacement!.publicId),
                    ),
                )
                .limit(1)

            expect(audit?.records).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: primary!.publicId }),
                    expect.objectContaining({
                        id: replacement!.publicId,
                        oldData: { isPrimary: false },
                        newData: { isPrimary: true },
                    }),
                ]),
            )
        })

        it('Should preserve infrastructure failures when deleting a primary address.', async () => {
            const primary = (await readAddresses()).find(
                (address) => address.isPrimary,
            )!
            const failingDatabase = new Proxy(env.LOANMSPUB_D1, {
                get(target, property, receiver) {
                    if (property === 'batch')
                        return async () => {
                            throw new Error('injected D1 batch failure')
                        }
                    const value = Reflect.get(target, property, receiver)
                    return typeof value === 'function'
                        ? value.bind(target)
                        : value
                },
            })
            const response = await app.request(
                '/api/user/address/delete',
                {
                    method: 'POST',
                    headers: {
                        origin: env.URL_FRONTEND,
                        'content-type': 'application/json',
                        cookie: standardCookie,
                    },
                    body: JSON.stringify({ publicId: primary.publicId }),
                },
                { ...env, LOANMSPUB_D1: failingDatabase },
            )

            expect(response.status).toBe(500)
            expect(
                (await response.json<TApiResponseError>()).error.code,
            ).not.toBe('ADDRESS_DELETE_CONFLICT')
            expect(
                (await readAddresses()).some(
                    (address) => address.publicId === primary.publicId,
                ),
            ).toBe(true)
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
