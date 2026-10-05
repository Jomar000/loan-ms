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
    seedTestingCookies,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

let borrowerPublicId: string
let loanProductPublicId: string
let loanPublicId: string
let memberCookie: string
let ownerCookie: string

const formulaProfilePublicId = '019936e2-b837-7000-8000-000000000301'

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
    const db = dbClient(env.LOANMSBOFC_D1)
    await db.insert(dbSchema.loanFormulaProfile).values({
        allowRenewalPrincipalChange: false,
        effectiveAt: new Date(0),
        finalInstallmentResiduePolicy: 'LAST_INSTALLMENT_ABSORBS_RESIDUE',
        fixedInterestAmountMinor: null,
        installmentCount: 60,
        interestMethod: 'FLAT_PERCENTAGE',
        interestRateBasisPoints: 2_000,
        isActive: true,
        isDefault: true,
        minCompletedInstallments: 0,
        name: '__TEST-Loan Formula',
        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
        partialCreditPolicy: 'CARRY_FORWARD',
        paymentFrequency: 'DAILY',
        publicId: formulaProfilePublicId,
        renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        roundingMode: 'HALF_UP',
        termDays: 60,
        timezone: 'Asia/Manila',
        version: 1,
    })
    const borrower = await postTestingRequest('/api/borrowers/create', {
        body: {
            addressLine: '1 __TEST-Loan Street',
            barangay: '__TEST Barangay',
            birthDate: '1990-01-01',
            cityMunicipality: '__TEST City',
            contactNumber: '+639179876543',
            emergencyContactName: '__TEST Emergency',
            emergencyContactNumber: '+639178765432',
            emergencyContactRelationship: 'SIBLING',
            firstName: '__TEST LOAN',
            gender: 'PREFER_NOT_TO_SAY',
            idempotencyKey: uuidv7(),
            lastName: 'BORROWER',
            province: '__TEST Province',
        },
        cookie: ownerCookie,
    })
    const borrowerJson =
        await borrower.json<
            TApiResponseOk<{ borrower: { publicId: string } }>
        >()
    borrowerPublicId = borrowerJson.data.borrower.publicId
})

describe('Loan origination API', () => {
    it('creates an immutable product snapshot and quotes a ₱7,000 daily loan', async () => {
        const create = await postTestingRequest('/api/loans/product/create', {
            body: {
                formulaProfilePublicId,
                idempotencyKey: uuidv7(),
                maximumPrincipalMinor: 20_000_00,
                minimumPrincipalMinor: 1_000_00,
                name: '__TEST Regular 60-Day',
            },
            cookie: ownerCookie,
        })
        const createJson =
            await create.json<TApiResponseOk<{ publicId: string }>>()
        loanProductPublicId = createJson.data.publicId
        const quote = await postTestingRequest('/api/loans/quote', {
            body: {
                borrowerPublicId,
                firstPaymentDate: '2026-10-10',
                loanProductPublicId,
                principalMinor: 7_000_00,
                releaseDate: '2026-10-09',
            },
            cookie: ownerCookie,
        })
        const quoteJson = await quote.json<
            TApiResponseOk<{
                installments: { amountDueMinor: number }[]
                interestAmountMinor: number
                totalPayableMinor: number
            }>
        >()

        expect(create.status).toBe(201)
        expect(create.headers.get('audit-event-recorded')).toBe('true')
        expect(quote.status).toBe(200)
        expect(quoteJson.data.interestAmountMinor).toBe(1_400_00)
        expect(quoteJson.data.totalPayableMinor).toBe(8_400_00)
        expect(quoteJson.data.installments).toHaveLength(60)
        expect(quoteJson.data.installments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ amountDueMinor: 140_00 }),
            ]),
        )
    })

    it('creates once, authorizes approval, releases atomically, and creates the schedule and cash out', async () => {
        const idempotencyKey = uuidv7()
        const body = {
            borrowerPublicId,
            firstPaymentDate: '2026-10-10',
            idempotencyKey,
            loanProductPublicId,
            principalMinor: 7_000_00,
            releaseDate: '2026-10-09',
        }
        const first = await postTestingRequest('/api/loans/create', {
            body,
            cookie: ownerCookie,
        })
        const firstJson =
            await first.json<TApiResponseOk<{ publicId: string }>>()
        loanPublicId = firstJson.data.publicId
        const replay = await postTestingRequest('/api/loans/create', {
            body,
            cookie: ownerCookie,
        })
        const denied = await postTestingRequest(
            `/api/loans/${loanPublicId}/approve`,
            { body: {}, cookie: memberCookie },
        )
        const approve = await postTestingRequest(
            `/api/loans/${loanPublicId}/approve`,
            { body: {}, cookie: ownerCookie },
        )
        const noFundRelease = await postTestingRequest(
            `/api/loans/${loanPublicId}/release`,
            { body: {}, cookie: ownerCookie },
        )
        const fundSetup = await postTestingRequest('/api/companyFund/setup', {
            body: {
                fundName: '__TEST Loan Primary Fund',
                idempotencyKey: uuidv7(),
                openingCapitalMinor: 100_000_00,
                transactionDate: '2026-10-01',
            },
            cookie: ownerCookie,
        })
        const release = await postTestingRequest(
            `/api/loans/${loanPublicId}/release`,
            { body: {}, cookie: ownerCookie },
        )
        const secondRelease = await postTestingRequest(
            `/api/loans/${loanPublicId}/release`,
            { body: {}, cookie: ownerCookie },
        )
        const detail = await getTestingRequest(
            `/api/loans/read/${loanPublicId}`,
            { cookie: ownerCookie },
        )
        const list = await queryTestingRequest(
            '/api/loans/readMany',
            { filters: { borrowerPublicId } },
            { cookie: ownerCookie },
        )
        const db = dbClient(env.LOANMSBOFC_D1)
        const [storedLoan] = await db
            .select({ id: dbSchema.loan.id })
            .from(dbSchema.loan)
            .where(
                and(
                    eq(
                        dbSchema.loan.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loan.publicId, loanPublicId),
                ),
            )
        const installments = await db
            .select({ id: dbSchema.loanInstallment.id })
            .from(dbSchema.loanInstallment)
            .where(eq(dbSchema.loanInstallment.loanId, storedLoan.id))
        const cashTransactions = await db
            .select({ amountMinor: dbSchema.cashTransaction.amountMinor })
            .from(dbSchema.cashTransaction)
            .where(eq(dbSchema.cashTransaction.loanId, storedLoan.id))
        const deniedJson = await denied.json<TApiResponseError>()
        const releaseJson =
            await release.json<TApiResponseOk<{ status: string }>>()

        expect(first.status).toBe(201)
        expect(first.headers.get('audit-event-recorded')).toBe('true')
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(deniedJson.error.code).toBe('FORBIDDEN')
        expect(approve.status).toBe(200)
        expect(noFundRelease.status).toBe(409)
        expect(fundSetup.status).toBe(201)
        expect(release.status).toBe(200)
        expect(release.headers.get('audit-event-recorded')).toBe('true')
        expect(releaseJson.data.status).toBe('ACTIVE')
        expect(secondRelease.status).toBe(409)
        expect(detail.status).toBe(200)
        expect(list.status).toBe(200)
        expect(installments).toHaveLength(60)
        expect(cashTransactions).toEqual([{ amountMinor: 7_000_00 }])
    })

    it('enforces enabled payment frequencies and the configured Scammer origination block', async () => {
        const settingsBody = {
            allowAdvancePayments: true,
            allowPartialPayments: true,
            borrowerTagPolicy: {
                allowManualOverride: true,
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
            idempotencyKey: uuidv7(),
            requireRenewalApproval: true,
        }
        const disabled = await postTestingRequest('/api/settings/update', {
            body: {
                ...settingsBody,
                defaultPaymentFrequency: 'WEEKLY',
                enabledPaymentFrequencies: ['WEEKLY'],
                expectedVersion: 0,
            },
            cookie: ownerCookie,
        })
        const disabledQuote = await postTestingRequest('/api/loans/quote', {
            body: {
                borrowerPublicId,
                firstPaymentDate: '2026-10-10',
                loanProductPublicId,
                principalMinor: 7_000_00,
                releaseDate: '2026-10-09',
            },
            cookie: ownerCookie,
        })
        const db = dbClient(env.LOANMSBOFC_D1)
        await db
            .update(dbSchema.borrower)
            .set({ paymentTag: 'SCAMMER', systemPaymentTag: 'SCAMMER' })
            .where(eq(dbSchema.borrower.publicId, borrowerPublicId))
        const blocked = await postTestingRequest('/api/settings/update', {
            body: {
                ...settingsBody,
                borrowerTagPolicy: {
                    ...settingsBody.borrowerTagPolicy,
                    blockNewLoanForScammer: true,
                },
                defaultPaymentFrequency: 'DAILY',
                enabledPaymentFrequencies: [
                    'DAILY',
                    'WEEKLY',
                    'MONTHLY',
                ],
                expectedVersion: 1,
                idempotencyKey: uuidv7(),
            },
            cookie: ownerCookie,
        })
        const blockedQuote = await postTestingRequest('/api/loans/quote', {
            body: {
                borrowerPublicId,
                firstPaymentDate: '2026-10-10',
                loanProductPublicId,
                principalMinor: 7_000_00,
                releaseDate: '2026-10-09',
            },
            cookie: ownerCookie,
        })

        expect(disabled.status).toBe(200)
        expect(disabledQuote.status).toBe(409)
        expect(blocked.status).toBe(200)
        expect(blockedQuote.status).toBe(409)
    })
})
