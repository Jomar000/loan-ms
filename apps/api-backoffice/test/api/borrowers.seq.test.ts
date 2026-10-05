import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseError, TApiResponseOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, eq, inArray } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

type TBorrower = {
    birthDate: null | string
    borrowerNumber: string
    emergencyContactName: null | string
    emergencyContactNumber: null | string
    emergencyContactRelationship: null | string
    fullName: string
    paymentTag: 'BAD_PAYER' | 'GOOD_PAYER' | 'SCAMMER'
    paymentTagSource: 'MANUAL_OVERRIDE' | 'SYSTEM'
    publicId: string
    status: 'ACTIVE' | 'ARCHIVED' | 'BLOCKED' | 'INACTIVE'
    systemPaymentTag: 'BAD_PAYER' | 'GOOD_PAYER' | 'SCAMMER'
}

const borrowerInput = {
    addressLine: '1 __TEST-Borrower Street',
    barangay: '__TEST Barangay',
    cityMunicipality: '__TEST City',
    contactNumber: '+639171234567',
    fullName: '__TEST BORROWER PRIMARY',
    gender: 'PREFER_NOT_TO_SAY' as const,
    province: '__TEST Province',
}
const { fullName: _fullName, ...legacyBorrowerFields } = borrowerInput
const legacyBorrowerInput = {
    ...legacyBorrowerFields,
    birthDate: '1990-01-01',
    emergencyContactName: '__TEST Emergency',
    emergencyContactNumber: '+639179999999',
    emergencyContactRelationship: 'SIBLING',
    firstName: '__TEST BORROWER',
    lastName: 'PRIMARY',
}
const objectStorageId = 'TESTBorrowerDocumentObject001'
let borrowerPublicId: string
let duplicateBorrowerPublicId: string
let db: ReturnType<typeof dbClient>
let isolatedOwnerCookie: string
let memberCookie: string
let ownerCookie: string

beforeAll(async () => {
    db = dbClient(env.LOANMSBOFC_D1)
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
    isolatedOwnerCookie = await seedTestingCookieForOrganization(
        TEST_OWNER_USER_ID,
        TEST_ISOLATED_ORGANIZATION_ID,
        { db },
    )
    await db.insert(dbSchema.objectStorage).values({
        hashSha256: 'a'.repeat(64),
        id: objectStorageId,
        isPublic: false,
        isUploaded: true,
        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
        size: 1,
    })
})

afterAll(async () => {
    const borrowerPublicIds = [
        borrowerPublicId,
        duplicateBorrowerPublicId,
    ].filter(Boolean)
    if (borrowerPublicIds.length > 0) {
        const borrowers = await db
            .select({ id: dbSchema.borrower.id })
            .from(dbSchema.borrower)
            .where(
                and(
                    eq(
                        dbSchema.borrower.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    inArray(dbSchema.borrower.publicId, borrowerPublicIds),
                ),
            )
        if (borrowers.length > 0) {
            await db.delete(dbSchema.borrowerDocument).where(
                inArray(
                    dbSchema.borrowerDocument.borrowerId,
                    borrowers.map((borrower) => borrower.id),
                ),
            )
            await db.delete(dbSchema.borrowerPaymentTagHistory).where(
                inArray(
                    dbSchema.borrowerPaymentTagHistory.borrowerId,
                    borrowers.map((borrower) => borrower.id),
                ),
            )
        }
        await db
            .delete(dbSchema.borrower)
            .where(inArray(dbSchema.borrower.publicId, borrowerPublicIds))
    }
    await db
        .delete(dbSchema.objectStorage)
        .where(eq(dbSchema.objectStorage.id, objectStorageId))
})

describe('Borrower management API', () => {
    it('creates a borrower without a loan, warns instead of blocking a duplicate, and replays idempotently', async () => {
        const idempotencyKey = uuidv7()
        const first = await postTestingRequest('/api/borrowers/create', {
            body: { ...borrowerInput, idempotencyKey },
            cookie: ownerCookie,
        })
        const firstJson = await first.json<
            TApiResponseOk<{
                borrower: TBorrower
                duplicateCandidates: TBorrower[]
            }>
        >()
        borrowerPublicId = firstJson.data.borrower.publicId
        const replay = await postTestingRequest('/api/borrowers/create', {
            body: { ...borrowerInput, idempotencyKey },
            cookie: ownerCookie,
        })
        const duplicate = await postTestingRequest('/api/borrowers/create', {
            body: { ...legacyBorrowerInput, idempotencyKey: uuidv7() },
            cookie: ownerCookie,
        })
        const duplicateJson = await duplicate.json<
            TApiResponseOk<{
                borrower: TBorrower
                duplicateCandidates: TBorrower[]
            }>
        >()
        duplicateBorrowerPublicId = duplicateJson.data.borrower.publicId

        expect(first.status).toBe(201)
        expect(first.headers.get('audit-event-recorded')).toBe('true')
        expect(firstJson.data.borrower).toMatchObject({
            birthDate: null,
            emergencyContactName: null,
            emergencyContactNumber: null,
            emergencyContactRelationship: null,
            fullName: '__TEST BORROWER PRIMARY',
            paymentTag: 'GOOD_PAYER',
            paymentTagSource: 'SYSTEM',
            status: 'ACTIVE',
            systemPaymentTag: 'GOOD_PAYER',
        })
        expect(firstJson.data.borrower.borrowerNumber).toMatch(/^BR-/)
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(duplicate.status).toBe(201)
        expect(duplicateJson.data.duplicateCandidates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ publicId: borrowerPublicId }),
            ]),
        )
    })

    it('keeps borrower reads tenant-scoped and lists the no-loan borrower', async () => {
        const [
            list,
            read,
            isolatedRead,
        ] = await Promise.all([
            queryTestingRequest(
                '/api/borrowers/readMany',
                { filters: { search: 'BORROWER PRIMARY' } },
                { cookie: ownerCookie },
            ),
            getTestingRequest(`/api/borrowers/read/${borrowerPublicId}`, {
                cookie: ownerCookie,
            }),
            getTestingRequest(`/api/borrowers/read/${borrowerPublicId}`, {
                cookie: isolatedOwnerCookie,
            }),
        ])
        const listJson = await list.json<{
            data: TBorrower[]
            success: true
        }>()

        expect(list.status).toBe(200)
        expect(listJson.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ publicId: borrowerPublicId }),
            ]),
        )
        expect(read.status).toBe(200)
        expect(isolatedRead.status).toBe(404)
    })

    it('registers a tenant-owned document exactly once for an idempotency key', async () => {
        const idempotencyKey = uuidv7()
        const body = {
            borrowerPublicId,
            documentType: 'VALID_ID',
            idempotencyKey,
            objectStorageId,
        }
        const first = await postTestingRequest(
            '/api/borrowers/document/create',
            {
                body,
                cookie: ownerCookie,
            },
        )
        const replay = await postTestingRequest(
            '/api/borrowers/document/create',
            {
                body,
                cookie: ownerCookie,
            },
        )
        const documents = await getTestingRequest(
            `/api/borrowers/document/readMany/${borrowerPublicId}`,
            { cookie: ownerCookie },
        )
        const documentJson = await documents.json<{
            data: { objectStorageId: string }[]
            success: true
        }>()

        expect(first.status).toBe(200)
        expect(first.headers.get('audit-event-recorded')).toBe('true')
        expect(replay.status).toBe(200)
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(documentJson.data).toEqual([
            expect.objectContaining({ objectStorageId }),
        ])
    })

    it('allows only owner/admin roles to override a payment tag and records the reset', async () => {
        const overrideBody = {
            paymentTag: 'BAD_PAYER',
            publicId: borrowerPublicId,
            reason: '__TEST manual review',
        }
        const denied = await postTestingRequest(
            '/api/borrowers/paymentTag/override',
            {
                body: overrideBody,
                cookie: memberCookie,
            },
        )
        const settings = {
            allowAdvancePayments: true,
            allowPartialPayments: true,
            borrowerTagPolicy: {
                allowManualOverride: false,
                automaticTaggingEnabled: true,
                blockNewLoanForScammer: false,
                daily: {
                    badPayerMaximumMissedInstallments: 6,
                    goodPayerMaximumMissedInstallments: 2,
                    scammerMinimumMissedInstallments: 7,
                },
                monthly: {
                    badPayerMaximumMissedInstallments: 6,
                    goodPayerMaximumMissedInstallments: 2,
                    scammerMinimumMissedInstallments: 7,
                },
                requireBadPayerRenewalApproval: true,
                requireOverrideReason: true,
                requireScammerRenewalApproval: true,
                showHistoricalWorstTag: true,
                weekly: {
                    badPayerMaximumMissedInstallments: 6,
                    goodPayerMaximumMissedInstallments: 2,
                    scammerMinimumMissedInstallments: 7,
                },
            },
            defaultLoanProductPublicId: null,
            defaultPaymentFrequency: 'DAILY',
            enabledPaymentFrequencies: [
                'DAILY',
                'WEEKLY',
                'MONTHLY',
            ],
            requireRenewalApproval: true,
        }
        await postTestingRequest('/api/settings/update', {
            body: {
                ...settings,
                expectedVersion: 0,
                idempotencyKey: uuidv7(),
            },
            cookie: ownerCookie,
        })
        const policyDenied = await postTestingRequest(
            '/api/borrowers/paymentTag/override',
            {
                body: overrideBody,
                cookie: ownerCookie,
            },
        )
        await postTestingRequest('/api/settings/update', {
            body: {
                ...settings,
                borrowerTagPolicy: {
                    ...settings.borrowerTagPolicy,
                    allowManualOverride: true,
                },
                expectedVersion: 1,
                idempotencyKey: uuidv7(),
            },
            cookie: ownerCookie,
        })
        const override = await postTestingRequest(
            '/api/borrowers/paymentTag/override',
            {
                body: overrideBody,
                cookie: ownerCookie,
            },
        )
        const reset = await postTestingRequest(
            '/api/borrowers/paymentTag/reset',
            {
                body: { publicId: borrowerPublicId },
                cookie: ownerCookie,
            },
        )
        const deniedJson = await denied.json<TApiResponseError>()

        expect(denied.status).toBe(403)
        expect(policyDenied.status).toBe(403)
        expect(deniedJson.error.code).toBe('FORBIDDEN')
        expect(override.headers.get('audit-event-recorded')).toBe('true')
        expect(reset.headers.get('audit-event-recorded')).toBe('true')
        const history = await db
            .select({
                source: dbSchema.borrowerPaymentTagHistory.paymentTagSource,
            })
            .from(dbSchema.borrowerPaymentTagHistory)
        expect(history.map((entry) => entry.source)).toEqual([
            'MANUAL_OVERRIDE',
            'SYSTEM',
        ])
    })

    it('archives rather than deleting the borrower and keeps it historically readable', async () => {
        const archive = await postTestingRequest('/api/borrowers/archive', {
            body: { publicId: borrowerPublicId },
            cookie: ownerCookie,
        })
        const read = await getTestingRequest(
            `/api/borrowers/read/${borrowerPublicId}`,
            {
                cookie: ownerCookie,
            },
        )
        const readJson = await read.json<TApiResponseOk<TBorrower>>()

        expect(archive.headers.get('audit-event-recorded')).toBe('true')
        expect(read.status).toBe(200)
        expect(readJson.data.status).toBe('ARCHIVED')
    })
})
