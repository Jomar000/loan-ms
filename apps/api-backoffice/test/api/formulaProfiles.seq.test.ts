import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import {
    getTestingRequest,
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookieForOrganization,
    seedTestingCookies,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

type TFormulaProfile = {
    isActive: boolean
    isDefault: boolean
    name: string
    publicId: string
    version: number
}

const profileInput = (version: number, interestRateBasisPoints = 2_000) => ({
    allowRenewalPrincipalChange: true,
    effectiveDate: '2026-10-05',
    installmentCount: 60,
    interestMethod: 'FLAT_PERCENTAGE' as const,
    interestRateBasisPoints,
    minimumRenewalCompletedInstallments: 20,
    name: '__TEST-Standard Formula',
    partialCreditPolicy: 'CARRY_FORWARD' as const,
    paymentFrequency: 'DAILY' as const,
    renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE' as const,
    roundingMode: 'HALF_UP' as const,
    roundingPrecision: 0,
    termDays: 60,
    version,
})

let isolatedOwnerCookie: string
let memberCookie: string
let ownerCookie: string
let versionOnePublicId: string

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
    isolatedOwnerCookie = await seedTestingCookieForOrganization(
        TEST_OWNER_USER_ID,
        TEST_ISOLATED_ORGANIZATION_ID,
        { db: dbClient(env.LOANMSBOFC_D1) },
    )
})

describe('Formula profile management API', () => {
    it.each([
        0,
        -1,
        1.5,
        1,
    ])(
        'rejects an invalid or unsupported collection per payment of %s',
        async (collectionAmountMinor) => {
            const response = await postTestingRequest(
                '/api/settings/formulaProfile/preview',
                {
                    body: {
                        firstPaymentDate: '2026-10-10',
                        formulaProfile: {
                            ...profileInput(1),
                            collectionAmountMinor,
                        },
                        principalMinor: 300_000,
                        releaseDate: '2026-10-09',
                    },
                    cookie: ownerCookie,
                },
            )
            expect(response.status).toBe(400)
            const json = await response.json<TApiResponseError>()
            expect(json.error.code).toBe(
                collectionAmountMinor === 1 ? 'BAD_REQUEST' : 'DATA_VALIDATION',
            )
        },
    )
    it('previews collection schedules using the requested principal instead of the example term', async () => {
        const response = await postTestingRequest(
            '/api/settings/formulaProfile/preview',
            {
                body: {
                    firstPaymentDate: '2026-10-10',
                    formulaProfile: {
                        ...profileInput(1),
                        collectionAmountMinor: 14_000,
                    },
                    principalMinor: 300_000,
                    releaseDate: '2026-10-09',
                    totalPaidMinor: 350_000,
                },
                cookie: ownerCookie,
            },
        )
        expect(response.status).toBe(200)
        const json =
            await response.json<TApiResponseOk<Record<string, number>>>()
        expect(json.data).toMatchObject({
            totalPayableMinor: 360_000,
            interestAmountMinor: 60_000,
            installmentAmountMinor: 14_000,
            completedInstallmentCount: 25,
            remainingInstallmentCount: 1,
            actualOutstandingBalanceMinor: 10_000,
        })
    })
    it('previews through the authoritative calculation engine and protects the management surface', async () => {
        const body = {
            firstPaymentDate: '2026-10-05',
            formulaProfile: profileInput(1),
            principalMinor: 700_000,
            releaseDate: '2026-10-05',
            totalPaidMinor: 400_000,
        }
        const [
            ownerResponse,
            memberResponse,
        ] = await Promise.all([
            postTestingRequest('/api/settings/formulaProfile/preview', {
                body,
                cookie: ownerCookie,
            }),
            postTestingRequest('/api/settings/formulaProfile/preview', {
                body,
                cookie: memberCookie,
            }),
        ])
        const ownerJson = await ownerResponse.json<
            TApiResponseOk<{
                completedInstallmentCount: number
                partialPaymentCreditMinor: number
                renewalCashReleaseMinor: number
                renewalSettlementBalanceMinor: number
                totalPayableMinor: number
            }>
        >()

        expect(ownerResponse.status).toBe(200)
        expect(ownerResponse.headers.get('audit-event-recorded')).toBeNull()
        expect(ownerJson.data).toMatchObject({
            completedInstallmentCount: 28,
            partialPaymentCreditMinor: 8_000,
            renewalCashReleaseMinor: 252_000,
            renewalSettlementBalanceMinor: 448_000,
            totalPayableMinor: 840_000,
        })
        expect(memberResponse.status).toBe(403)
    })

    it('creates one immutable inactive version and safely replays the same request', async () => {
        const idempotencyKey = uuidv7()
        const body = {
            formulaProfile: profileInput(1),
            idempotencyKey,
        }
        const first = await postTestingRequest(
            '/api/settings/formulaProfile/create',
            { body, cookie: ownerCookie },
        )
        const firstJson = await first.json<TApiResponseOk<TFormulaProfile>>()
        const replay = await postTestingRequest(
            '/api/settings/formulaProfile/create',
            { body, cookie: ownerCookie },
        )
        const changedReplay = await postTestingRequest(
            '/api/settings/formulaProfile/create',
            {
                body: {
                    ...body,
                    formulaProfile: profileInput(1, 2_100),
                },
                cookie: ownerCookie,
            },
        )

        expect(first.status).toBe(201)
        expect(first.headers.get('audit-event-recorded')).toBe('true')
        expect(firstJson.data).toMatchObject({
            isActive: false,
            isDefault: false,
            name: '__TEST-Standard Formula',
            version: 1,
        })
        expect(replay.status).toBe(200)
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(await replay.json()).toEqual(firstJson)
        expect(changedReplay.status).toBe(409)
        versionOnePublicId = firstJson.data.publicId

        const persisted = await dbClient(env.LOANMSBOFC_D1)
            .select({
                idempotencyKey: dbSchema.loanFormulaProfile.idempotencyKey,
                requestFingerprint:
                    dbSchema.loanFormulaProfile.requestFingerprint,
            })
            .from(dbSchema.loanFormulaProfile)
            .where(
                and(
                    eq(
                        dbSchema.loanFormulaProfile.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.loanFormulaProfile.publicId,
                        versionOnePublicId,
                    ),
                ),
            )
        expect(persisted).toEqual([
            {
                idempotencyKey,
                requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
            },
        ])
    })

    it('creates only the next version and activates it as the tenant default', async () => {
        const invalidVersion = await postTestingRequest(
            `/api/settings/formulaProfile/${versionOnePublicId}/version`,
            {
                body: {
                    formulaProfile: profileInput(3),
                    idempotencyKey: uuidv7(),
                },
                cookie: ownerCookie,
            },
        )
        const versionResponse = await postTestingRequest(
            `/api/settings/formulaProfile/${versionOnePublicId}/version`,
            {
                body: {
                    formulaProfile: profileInput(2, 2_100),
                    idempotencyKey: uuidv7(),
                },
                cookie: ownerCookie,
            },
        )
        const versionJson =
            await versionResponse.json<TApiResponseOk<TFormulaProfile>>()
        const activate = await postTestingRequest(
            `/api/settings/formulaProfile/${versionJson.data.publicId}/activate`,
            {
                body: { isDefault: true },
                cookie: ownerCookie,
            },
        )
        const activateJson =
            await activate.json<TApiResponseOk<TFormulaProfile>>()

        expect(invalidVersion.status).toBe(409)
        expect(versionResponse.status).toBe(201)
        expect(versionJson.data).toMatchObject({
            isActive: false,
            version: 2,
        })
        expect(activate.status).toBe(200)
        expect(activate.headers.get('audit-event-recorded')).toBe('true')
        expect(activateJson.data).toMatchObject({
            isActive: true,
            isDefault: true,
            version: 2,
        })
    })

    it('lists and reads only the active tenant profiles', async () => {
        const primary = await queryTestingRequest(
            '/api/settings/formulaProfile/readMany',
            { filters: {}, limit: 100, offset: 0, sortOrder: 'desc' },
            { cookie: ownerCookie },
        )
        const isolated = await queryTestingRequest(
            '/api/settings/formulaProfile/readMany',
            { filters: {}, limit: 100, offset: 0, sortOrder: 'desc' },
            { cookie: isolatedOwnerCookie },
        )
        const primaryJson = await primary.json<
            TApiResponseOk<TFormulaProfile[]> & { count: number }
        >()
        const isolatedJson = await isolated.json<
            TApiResponseOk<TFormulaProfile[]> & { count: number }
        >()
        const read = await getTestingRequest(
            `/api/settings/formulaProfile/read/${versionOnePublicId}`,
            { cookie: isolatedOwnerCookie },
        )
        const readJson = await read.json<TApiResponseError>()

        expect(primary.status).toBe(200)
        expect(primaryJson.count).toBe(2)
        expect(primaryJson.data.map(({ version }) => version)).toEqual([
            2,
            1,
        ])
        expect(isolated.status).toBe(200)
        expect(isolatedJson).toMatchObject({ count: 0, data: [] })
        expect(read.status).toBe(404)
        expect(readJson.error.code).toBe('NOT_FOUND')
    })

    it('removes an inactive profile and rejects unauthorized or repeated deletion', async () => {
        const create = await postTestingRequest(
            '/api/settings/formulaProfile/create',
            {
                body: {
                    formulaProfile: {
                        ...profileInput(1),
                        name: '__TEST-Delete Formula',
                    },
                    idempotencyKey: uuidv7(),
                },
                cookie: ownerCookie,
            },
        )
        const created = await create.json<TApiResponseOk<TFormulaProfile>>()
        const path = `/api/settings/formulaProfile/${created.data.publicId}/delete`
        const member = await postTestingRequest(path, { cookie: memberCookie })
        const otherTenant = await postTestingRequest(path, {
            cookie: isolatedOwnerCookie,
        })
        const deleted = await postTestingRequest(path, { cookie: ownerCookie })
        const repeated = await postTestingRequest(path, { cookie: ownerCookie })

        expect(create.status).toBe(201)
        expect(member.status).toBe(403)
        expect(otherTenant.status).toBe(404)
        expect(deleted.status).toBe(200)
        expect(deleted.headers.get('audit-event-recorded')).toBe('true')
        expect(await deleted.json()).toMatchObject({
            success: true,
            data: { publicId: created.data.publicId },
        })
        expect(repeated.status).toBe(404)
        expect(
            await getTestingRequest(
                `/api/settings/formulaProfile/read/${created.data.publicId}`,
                { cookie: ownerCookie },
            ),
        ).toHaveProperty('status', 404)
        const [stored] = await dbClient(env.LOANMSBOFC_D1)
            .select({ deletedAt: dbSchema.loanFormulaProfile.deletedAt })
            .from(dbSchema.loanFormulaProfile)
            .where(
                and(
                    eq(
                        dbSchema.loanFormulaProfile.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.loanFormulaProfile.publicId,
                        created.data.publicId,
                    ),
                ),
            )
        expect(stored?.deletedAt).toBeInstanceOf(Date)
    })

    it('removes an active profile while preserving its linked product', async () => {
        const read = await queryTestingRequest(
            '/api/settings/formulaProfile/readMany',
            {
                filters: { isActive: true },
                limit: 100,
                offset: 0,
                sortOrder: 'desc',
            },
            { cookie: ownerCookie },
        )
        const body = await read.json<TApiResponseOk<TFormulaProfile[]>>()
        const publicId = body.data[0]!.publicId
        const product = await postTestingRequest('/api/loans/product/create', {
            body: {
                formulaProfilePublicId: publicId,
                idempotencyKey: uuidv7(),
                maximumPrincipalMinor: 2_000_000,
                minimumPrincipalMinor: 100_000,
                name: '__TEST-Deleted Formula Product',
            },
            cookie: ownerCookie,
        })
        const response = await postTestingRequest(
            `/api/settings/formulaProfile/${publicId}/delete`,
            { cookie: ownerCookie },
        )
        const remaining = await queryTestingRequest(
            '/api/settings/formulaProfile/readMany',
            {
                filters: { isActive: true },
                limit: 100,
                offset: 0,
                sortOrder: 'desc',
            },
            { cookie: ownerCookie },
        )
        const remainingJson = await remaining.json<
            TApiResponseOk<TFormulaProfile[]> & { count: number }
        >()
        const products = await queryTestingRequest(
            '/api/loans/product/readMany',
            { filters: {}, limit: 100, offset: 0, sortOrder: 'desc' },
            { cookie: ownerCookie },
        )
        const productsJson = await products.json<
            TApiResponseOk<{ formulaProfilePublicId: string }[]> & {
                count: number
            }
        >()
        const reactivation = await postTestingRequest(
            `/api/settings/formulaProfile/${publicId}/activate`,
            { body: { isDefault: true }, cookie: ownerCookie },
        )
        const newProduct = await postTestingRequest(
            '/api/loans/product/create',
            {
                body: {
                    formulaProfilePublicId: publicId,
                    idempotencyKey: uuidv7(),
                    maximumPrincipalMinor: 2_000_000,
                    minimumPrincipalMinor: 100_000,
                    name: '__TEST-New Deleted Formula Product',
                },
                cookie: ownerCookie,
            },
        )
        const [stored] = await dbClient(env.LOANMSBOFC_D1)
            .select({
                deletedAt: dbSchema.loanFormulaProfile.deletedAt,
                isActive: dbSchema.loanFormulaProfile.isActive,
                isDefault: dbSchema.loanFormulaProfile.isDefault,
            })
            .from(dbSchema.loanFormulaProfile)
            .where(
                and(
                    eq(
                        dbSchema.loanFormulaProfile.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loanFormulaProfile.publicId, publicId),
                ),
            )

        expect(product.status).toBe(201)
        expect(response.status).toBe(200)
        expect(response.headers.get('audit-event-recorded')).toBe('true')
        expect(remainingJson.data).toEqual([])
        expect(remainingJson.count).toBe(0)
        expect(productsJson.data).toEqual([
            expect.objectContaining({ formulaProfilePublicId: publicId }),
        ])
        expect(reactivation.status).toBe(404)
        expect(newProduct.status).toBe(404)
        expect(stored).toMatchObject({
            deletedAt: expect.any(Date),
            isActive: false,
            isDefault: false,
        })
    })
})
