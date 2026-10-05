import { dbClient, dbSchema } from '@loanms/database/d1'
import type {
    TApiResponseError,
    TApiResponseOk,
    TApiResponsePaginatedOk,
} from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import {
    getTestingRequest,
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookies,
    TEST_MEMBER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

let memberCookie: string
let ownerCookie: string
let borrowerPublicId: string
let loanPublicId: string
let paymentPublicId: string
let productPublicId: string

const tagPolicy = {
    allowManualOverride: true,
    automaticTaggingEnabled: true,
    blockNewLoanForScammer: false,
    daily: {
        badPayerMaximumMissedInstallments: 1,
        goodPayerMaximumMissedInstallments: 0,
        scammerMinimumMissedInstallments: 2,
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
}

const updateSettings = async (
    expectedVersion: number,
    overrides: Partial<{
        allowAdvancePayments: boolean
        allowPartialPayments: boolean
        defaultPaymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
        enabledPaymentFrequencies: ('DAILY' | 'MONTHLY' | 'WEEKLY')[]
    }> = {},
) =>
    postTestingRequest('/api/settings/update', {
        body: {
            allowAdvancePayments: true,
            allowPartialPayments: true,
            borrowerTagPolicy: tagPolicy,
            defaultLoanProductPublicId: null,
            defaultPaymentFrequency: 'DAILY',
            enabledPaymentFrequencies: [
                'DAILY',
                'WEEKLY',
                'MONTHLY',
            ],
            expectedVersion,
            idempotencyKey: uuidv7(),
            requireRenewalApproval: true,
            ...overrides,
        },
        cookie: ownerCookie,
    })

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
    await postTestingRequest('/api/companyFund/setup', {
        body: {
            fundName: '__TEST Payment Primary Fund',
            idempotencyKey: uuidv7(),
            openingCapitalMinor: 100_000_00,
            transactionDate: '2026-10-01',
        },
        cookie: ownerCookie,
    })
    const db = dbClient(env.LOANMSBOFC_D1)
    const formulaPublicId = uuidv7()
    await db.insert(dbSchema.loanFormulaProfile).values({
        allowRenewalPrincipalChange: false,
        effectiveAt: new Date(0),
        finalInstallmentResiduePolicy: 'LAST_INSTALLMENT_ABSORBS_RESIDUE',
        fixedInterestAmountMinor: null,
        installmentCount: 2,
        interestMethod: 'FLAT_PERCENTAGE',
        interestRateBasisPoints: 2_000,
        isActive: true,
        isDefault: true,
        minCompletedInstallments: 0,
        name: '__TEST-Payment Formula',
        organizationId: TEST_PRIMARY_ORGANIZATION_ID,
        partialCreditPolicy: 'CARRY_FORWARD',
        paymentFrequency: 'DAILY',
        publicId: formulaPublicId,
        renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
        roundingMode: 'HALF_UP',
        termDays: 2,
        timezone: 'Asia/Manila',
        version: 1,
    })
    const borrowerResponse = await postTestingRequest('/api/borrowers/create', {
        body: {
            addressLine: '1 __TEST-Payment Street',
            barangay: '__TEST Barangay',
            birthDate: '1990-01-01',
            cityMunicipality: '__TEST City',
            contactNumber: '+639179998811',
            emergencyContactName: '__TEST Emergency',
            emergencyContactNumber: '+639179998812',
            emergencyContactRelationship: 'SIBLING',
            firstName: '__TEST PAYMENT',
            gender: 'PREFER_NOT_TO_SAY',
            idempotencyKey: uuidv7(),
            lastName: 'BORROWER',
            province: '__TEST Province',
        },
        cookie: ownerCookie,
    })
    const borrowerJson =
        await borrowerResponse.json<
            TApiResponseOk<{ borrower: { publicId: string } }>
        >()
    borrowerPublicId = borrowerJson.data.borrower.publicId
    const product = await postTestingRequest('/api/loans/product/create', {
        body: {
            formulaProfilePublicId: formulaPublicId,
            idempotencyKey: uuidv7(),
            maximumPrincipalMinor: 10_000_00,
            minimumPrincipalMinor: 1_000_00,
            name: '__TEST-Payment Product',
        },
        cookie: ownerCookie,
    })
    const productJson =
        await product.json<TApiResponseOk<{ publicId: string }>>()
    productPublicId = productJson.data.publicId
    const create = await postTestingRequest('/api/loans/create', {
        body: {
            borrowerPublicId,
            firstPaymentDate: '2026-10-02',
            idempotencyKey: uuidv7(),
            loanProductPublicId: productPublicId,
            principalMinor: 1_000_00,
            releaseDate: '2026-10-01',
        },
        cookie: ownerCookie,
    })
    const createJson = await create.json<TApiResponseOk<{ publicId: string }>>()
    loanPublicId = createJson.data.publicId
    await postTestingRequest(`/api/loans/${loanPublicId}/approve`, {
        body: {},
        cookie: ownerCookie,
    })
    await postTestingRequest(`/api/loans/${loanPublicId}/release`, {
        body: {},
        cookie: ownerCookie,
    })
})

async function createActiveLoan(principalMinor = 4_000_00) {
    const create = await postTestingRequest('/api/loans/create', {
        body: {
            borrowerPublicId,
            firstPaymentDate: '2026-10-10',
            idempotencyKey: uuidv7(),
            loanProductPublicId: productPublicId,
            principalMinor,
            releaseDate: '2026-10-09',
        },
        cookie: ownerCookie,
    })
    const createJson = await create.json<TApiResponseOk<{ publicId: string }>>()
    await postTestingRequest(`/api/loans/${createJson.data.publicId}/approve`, {
        body: {},
        cookie: ownerCookie,
    })
    await postTestingRequest(`/api/loans/${createJson.data.publicId}/release`, {
        body: {},
        cookie: ownerCookie,
    })
    return createJson.data.publicId
}

describe('Payment and collection API', () => {
    it('quotes, posts idempotently, allocates FIFO, and reverses a payment with ledger evidence', async () => {
        expect((await updateSettings(0)).status).toBe(200)
        const idempotencyKey = uuidv7()
        const body = {
            amountReceivedMinor: 70_000,
            idempotencyKey,
            loanPublicId,
            paymentDate: '2026-10-03',
            paymentMethod: 'CASH',
            referenceNumber: '__TEST-Receipt',
        }
        const quote = await postTestingRequest('/api/payments/quote', {
            body: {
                amountReceivedMinor: body.amountReceivedMinor,
                loanPublicId,
                paymentDate: body.paymentDate,
                paymentMethod: body.paymentMethod,
                referenceNumber: body.referenceNumber,
            },
            cookie: ownerCookie,
        })
        const posted = await postTestingRequest('/api/payments/create', {
            body,
            cookie: ownerCookie,
        })
        const postedJson =
            await posted.json<TApiResponseOk<{ publicId: string }>>()
        paymentPublicId = postedJson.data.publicId
        const replay = await postTestingRequest('/api/payments/create', {
            body,
            cookie: ownerCookie,
        })
        const collections = await getTestingRequest(
            '/api/collections/overdue',
            {
                cookie: ownerCookie,
            },
        )
        const history = await queryTestingRequest(
            '/api/payments/readMany',
            { filters: { loanPublicId } },
            { cookie: ownerCookie },
        )
        const reverse = await postTestingRequest(
            `/api/payments/${paymentPublicId}/reverse`,
            {
                body: { reason: '__TEST incorrect cash entry' },
                cookie: ownerCookie,
            },
        )
        const tag = await getTestingRequest(
            `/api/borrowers/paymentTag/read/${borrowerPublicId}`,
            { cookie: ownerCookie },
        )
        const tagJson = await tag.json<
            TApiResponseOk<{
                currentCalculatedTag: string
                currentTag: string
                historicalWorstTag: string | null
                missedInstallmentCount: number
            }>
        >()
        const db = dbClient(env.LOANMSBOFC_D1)
        const [payment] = await db
            .select({ status: dbSchema.payment.status })
            .from(dbSchema.payment)
            .where(
                and(
                    eq(
                        dbSchema.payment.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.payment.publicId, paymentPublicId),
                ),
            )
        const ledgerRows = await db
            .select({ type: dbSchema.cashTransaction.transactionType })
            .from(dbSchema.cashTransaction)
            .where(
                eq(
                    dbSchema.cashTransaction.paymentId,
                    (
                        await db
                            .select({ id: dbSchema.payment.id })
                            .from(dbSchema.payment)
                            .where(
                                eq(dbSchema.payment.publicId, paymentPublicId),
                            )
                            .limit(1)
                    )[0]!.id,
                ),
            )
        const tagHistory = await db
            .select({
                paymentTag: dbSchema.borrowerPaymentTagHistory.paymentTag,
                source: dbSchema.borrowerPaymentTagHistory.paymentTagSource,
                systemPaymentTag:
                    dbSchema.borrowerPaymentTagHistory.systemPaymentTag,
            })
            .from(dbSchema.borrowerPaymentTagHistory)

        expect(quote.status).toBe(200)
        expect(posted.status).toBe(201)
        expect(posted.headers.get('audit-event-recorded')).toBe('true')
        expect(replay.status).toBe(200)
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(collections.status).toBe(200)
        expect(history.status).toBe(200)
        expect(reverse.status).toBe(200)
        expect(reverse.headers.get('audit-event-recorded')).toBe('true')
        expect(tagJson.data).toMatchObject({
            currentCalculatedTag: 'SCAMMER',
            currentTag: 'SCAMMER',
            historicalWorstTag: 'SCAMMER',
            missedInstallmentCount: 2,
        })
        expect(payment).toEqual({ status: 'REVERSED' })
        expect(ledgerRows.map((row) => row.type)).toEqual([
            'PAYMENT_RECEIVED',
            'PAYMENT_REVERSAL',
        ])
        expect(tagHistory).toEqual([
            {
                paymentTag: 'SCAMMER',
                source: 'SYSTEM',
                systemPaymentTag: 'SCAMMER',
            },
        ])

        const unallocated = await postTestingRequest('/api/payments/create', {
            body: {
                amountReceivedMinor: 1_200_01,
                idempotencyKey: uuidv7(),
                loanPublicId,
                paymentDate: '2026-10-03',
                paymentMethod: 'CASH',
            },
            cookie: ownerCookie,
        })
        const unallocatedJson = await unallocated.json<TApiResponseError>()
        expect(unallocated.status).toBe(409)
        expect(unallocatedJson.error.code).toBe('CONFLICT')

        const overdue = await queryTestingRequest(
            '/api/overdue/readMany',
            { filters: {}, limit: 1, offset: 0, sortOrder: 'desc' },
            { cookie: ownerCookie },
        )
        const overdueJson =
            await overdue.json<
                TApiResponsePaginatedOk<{ loanPublicId: string }[]>
            >()
        expect(overdue.status).toBe(200)
        expect(overdueJson.count).toBe(1)
        expect(overdueJson.data).toEqual([
            expect.objectContaining({ loanPublicId }),
        ])

        const report = await queryTestingRequest(
            '/api/reports/summary',
            { filters: { dateFrom: '2026-10-03', dateTo: '2026-10-03' } },
            { cookie: ownerCookie },
        )
        const reportJson = await report.json<
            TApiResponseOk<{
                currentAsOfDate: string
                currentOutstandingReceivableMinor: number
                periodCashInMinor: number
                periodDateFrom: string | null
                periodDateTo: string | null
            }>
        >()
        expect(report.status).toBe(200)
        expect(reportJson.data).toMatchObject({
            currentAsOfDate: '2026-10-05',
            periodDateFrom: '2026-10-03',
            periodDateTo: '2026-10-03',
        })
        expect(reportJson.data.periodCashInMinor).toBe(0)
        expect(
            reportJson.data.currentOutstandingReceivableMinor,
        ).toBeGreaterThan(0)
    })

    it('enforces payment settings before recording financial effects', async () => {
        const policyLoanPublicId = await createActiveLoan()
        expect(
            (
                await updateSettings(1, {
                    allowAdvancePayments: false,
                    allowPartialPayments: false,
                })
            ).status,
        ).toBe(200)

        const partial = await postTestingRequest('/api/payments/create', {
            body: {
                amountReceivedMinor: 1,
                idempotencyKey: uuidv7(),
                loanPublicId: policyLoanPublicId,
                paymentDate: '2026-10-10',
                paymentMethod: 'CASH',
            },
            cookie: ownerCookie,
        })
        const advance = await postTestingRequest('/api/payments/create', {
            body: {
                amountReceivedMinor: 2_400_00,
                idempotencyKey: uuidv7(),
                loanPublicId: policyLoanPublicId,
                paymentDate: '2026-10-09',
                paymentMethod: 'CASH',
            },
            cookie: ownerCookie,
        })
        expect(partial.status).toBe(409)
        expect(advance.status).toBe(409)

        expect(
            (
                await updateSettings(2, {
                    defaultPaymentFrequency: 'WEEKLY',
                    enabledPaymentFrequencies: ['WEEKLY'],
                })
            ).status,
        ).toBe(200)
        const disabledFrequency = await postTestingRequest(
            '/api/payments/quote',
            {
                body: {
                    amountReceivedMinor: 1_000,
                    loanPublicId: policyLoanPublicId,
                    paymentDate: '2026-10-10',
                    paymentMethod: 'CASH',
                },
                cookie: ownerCookie,
            },
        )
        expect(disabledFrequency.status).toBe(409)
        expect((await updateSettings(3)).status).toBe(200)
    })

    it('accepts multiple payments totaling 4,000 pesos and permits only one concurrent winner', async () => {
        const cumulativeLoanPublicId = await createActiveLoan()
        const cumulativePayments = []
        for (let index = 0; index < 4; index += 1) {
            cumulativePayments.push(
                await postTestingRequest('/api/payments/create', {
                    body: {
                        amountReceivedMinor: 1_000_00,
                        idempotencyKey: uuidv7(),
                        loanPublicId: cumulativeLoanPublicId,
                        paymentDate: '2026-10-10',
                        paymentMethod: 'CASH',
                    },
                    cookie: ownerCookie,
                }),
            )
        }
        expect(cumulativePayments.map((response) => response.status)).toEqual([
            201,
            201,
            201,
            201,
        ])
        const cumulativeHistory = await queryTestingRequest(
            '/api/payments/readMany',
            { filters: { loanPublicId: cumulativeLoanPublicId } },
            { cookie: ownerCookie },
        )
        const cumulativeJson =
            await cumulativeHistory.json<
                TApiResponsePaginatedOk<{ amountReceivedMinor: number }[]>
            >()
        expect(
            cumulativeJson.data.reduce(
                (total, payment) => total + payment.amountReceivedMinor,
                0,
            ),
        ).toBe(4_000_00)

        const concurrentLoanPublicId = await createActiveLoan()
        const concurrentBody = {
            amountReceivedMinor: 1_000_00,
            idempotencyKey: uuidv7(),
            loanPublicId: concurrentLoanPublicId,
            paymentDate: '2026-10-10',
            paymentMethod: 'CASH',
        }
        const concurrent = await Promise.all([
            postTestingRequest('/api/payments/create', {
                body: concurrentBody,
                cookie: ownerCookie,
            }),
            postTestingRequest('/api/payments/create', {
                body: concurrentBody,
                cookie: ownerCookie,
            }),
        ])
        expect(concurrent.some((response) => response.status === 201)).toBe(
            true,
        )
        expect(
            concurrent.every((response) =>
                [
                    200,
                    201,
                    409,
                ].includes(response.status),
            ),
        ).toBe(true)
        const concurrentHistory = await queryTestingRequest(
            '/api/payments/readMany',
            { filters: { loanPublicId: concurrentLoanPublicId } },
            { cookie: ownerCookie },
        )
        const concurrentJson =
            await concurrentHistory.json<TApiResponsePaginatedOk<unknown[]>>()
        expect(concurrentJson.count).toBe(1)
    })

    it('enforces Cashier, Collector assignment, and Viewer read-only boundaries', async () => {
        const db = dbClient(env.LOANMSBOFC_D1)
        const setRole = async (role: string) =>
            db
                .update(dbSchema.member)
                .set({ role })
                .where(
                    and(
                        eq(
                            dbSchema.member.organizationId,
                            TEST_PRIMARY_ORGANIZATION_ID,
                        ),
                        eq(dbSchema.member.userId, TEST_MEMBER_USER_ID),
                    ),
                )

        await setRole('viewer')
        const viewerPayment = await postTestingRequest('/api/payments/create', {
            body: {
                amountReceivedMinor: 1_000,
                idempotencyKey: uuidv7(),
                loanPublicId,
                paymentDate: '2026-10-03',
                paymentMethod: 'CASH',
            },
            cookie: memberCookie,
        })
        const viewerBorrower = await postTestingRequest(
            '/api/borrowers/create',
            {
                body: {},
                cookie: memberCookie,
            },
        )
        const viewerReport = await queryTestingRequest(
            '/api/reports/summary',
            { filters: {} },
            { cookie: memberCookie },
        )

        await setRole('cashier')
        const cashierQuote = await postTestingRequest('/api/payments/quote', {
            body: {
                amountReceivedMinor: 1_000,
                loanPublicId,
                paymentDate: '2026-10-03',
                paymentMethod: 'CASH',
            },
            cookie: memberCookie,
        })
        const cashierReverse = await postTestingRequest(
            `/api/payments/${paymentPublicId}/reverse`,
            {
                body: { reason: '__TEST cashier cannot reverse' },
                cookie: memberCookie,
            },
        )

        await setRole('collector')
        const collectorUnassigned = await postTestingRequest(
            '/api/payments/quote',
            {
                body: {
                    amountReceivedMinor: 1_000,
                    loanPublicId,
                    paymentDate: '2026-10-03',
                    paymentMethod: 'CASH',
                },
                cookie: memberCookie,
            },
        )
        const [loan] = await db
            .select({ id: dbSchema.loan.id })
            .from(dbSchema.loan)
            .where(eq(dbSchema.loan.publicId, loanPublicId))
        await db.insert(dbSchema.loanCollectionAssignment).values({
            assignedByUserId: TEST_MEMBER_USER_ID,
            collectorUserId: TEST_MEMBER_USER_ID,
            loanId: loan!.id,
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
        })
        const collectorAssigned = await postTestingRequest(
            '/api/payments/quote',
            {
                body: {
                    amountReceivedMinor: 1_000,
                    loanPublicId,
                    paymentDate: '2026-10-03',
                    paymentMethod: 'CASH',
                },
                cookie: memberCookie,
            },
        )

        expect(viewerPayment.status).toBe(403)
        expect(viewerBorrower.status).toBe(403)
        expect(viewerReport.status).toBe(200)
        expect(cashierQuote.status).toBe(200)
        expect(cashierReverse.status).toBe(403)
        expect(collectorUnassigned.status).toBe(403)
        expect(collectorAssigned.status).toBe(200)
    })
})
