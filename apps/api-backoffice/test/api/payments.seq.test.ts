import { dbClient, dbSchema } from '@loanms/database/d1'
import type {
    TApiResponseError,
    TApiResponseOk,
    TApiResponsePaginatedOk,
} from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { and, asc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import { currentManilaDate } from '../../src/services/borrowerPaymentTag.js'
import {
    getTestingRequest,
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookies,
    TEST_MEMBER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'
import {
    traceGetRequest,
    traceQueryRequest,
} from './queryPerformance.shared.js'

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
    await setTestLoanSchedule(loanPublicId, '2026-10-02')
})

// Release intentionally anchors dates to the current day. Payment scenarios
// own fixed schedules so their overdue, advance-payment, and coverage cases
// exercise the intended dates independently of the day the suite runs.
async function setTestLoanSchedule(publicId: string, firstDueDate: string) {
    const db = dbClient(env.LOANMSBOFC_D1)
    const [record] = await db
        .select({ id: dbSchema.loan.id })
        .from(dbSchema.loan)
        .where(
            and(
                eq(dbSchema.loan.organizationId, TEST_PRIMARY_ORGANIZATION_ID),
                eq(dbSchema.loan.publicId, publicId),
            ),
        )
    const installments = await db
        .select({ id: dbSchema.loanInstallment.id })
        .from(dbSchema.loanInstallment)
        .where(
            and(
                eq(
                    dbSchema.loanInstallment.organizationId,
                    TEST_PRIMARY_ORGANIZATION_ID,
                ),
                eq(dbSchema.loanInstallment.loanId, record!.id),
            ),
        )
        .orderBy(asc(dbSchema.loanInstallment.installmentNumber))
    const dates = installments.map((_, index) => {
        const date = new Date(`${firstDueDate}T00:00:00.000Z`)
        date.setUTCDate(date.getUTCDate() + index)
        return date.toISOString().slice(0, 10)
    })
    for (const [
        index,
        installment,
    ] of installments.entries()) {
        await db
            .update(dbSchema.loanInstallment)
            .set({
                dueDate: dates[index]!,
                periodStart: dates[index]!,
                periodEnd: dates[index]!,
            })
            .where(
                and(
                    eq(
                        dbSchema.loanInstallment.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loanInstallment.id, installment.id),
                ),
            )
    }
    const releaseDate = new Date(`${firstDueDate}T00:00:00.000Z`)
    releaseDate.setUTCDate(releaseDate.getUTCDate() - 1)
    await db
        .update(dbSchema.loan)
        .set({
            releaseDate: releaseDate.toISOString().slice(0, 10),
            releasedAt: releaseDate,
            firstPaymentDate: firstDueDate,
            expectedCompletionDate: dates.at(-1)!,
        })
        .where(
            and(
                eq(dbSchema.loan.organizationId, TEST_PRIMARY_ORGANIZATION_ID),
                eq(dbSchema.loan.id, record!.id),
            ),
        )
}

async function createActiveLoan(
    principalMinor = 4_000_00,
    loanProductPublicId = productPublicId,
) {
    const create = await postTestingRequest('/api/loans/create', {
        body: {
            borrowerPublicId,
            firstPaymentDate: '2026-10-10',
            idempotencyKey: uuidv7(),
            loanProductPublicId,
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
    await setTestLoanSchedule(createJson.data.publicId, '2026-10-10')
    return createJson.data.publicId
}

describe('Payment and collection API', () => {
    it.each([
        { mode: 'automatic', coveredDates: undefined },
        { mode: 'single-date', coveredDates: ['2026-10-11'] },
        {
            mode: 'multiple-date',
            coveredDates: [
                '2026-10-10',
                '2026-10-11',
            ],
        },
    ])(
        'fills the oldest unpaid installments in $mode mode and restores them on reversal',
        async ({ coveredDates }) => {
            const publicId = await createActiveLoan(100_000)
            const first = await postTestingRequest('/api/payments/create', {
                body: {
                    amountReceivedMinor: 37_500,
                    coveredDates: ['2026-10-10'],
                    idempotencyKey: uuidv7(),
                    loanPublicId: publicId,
                    paymentDate: '2026-10-10',
                    paymentMethod: 'CASH',
                },
                cookie: ownerCookie,
            })
            expect(first.status).toBe(201)
            const draft = {
                amountReceivedMinor: 75_000,
                ...(coveredDates === undefined ? {} : { coveredDates }),
                loanPublicId: publicId,
                paymentDate: '2026-10-11',
                paymentMethod: 'CASH',
            }
            const quote = await postTestingRequest('/api/payments/quote', {
                body: draft,
                cookie: ownerCookie,
            })
            const quoted = await quote.json<
                TApiResponseOk<{
                    allocations: {
                        dueDate: string
                        allocatedAmountMinor: number
                        amountPaidMinor: number
                    }[]
                    partialPaymentCreditAfterPaymentMinor: number
                }>
            >()
            expect(quote.status).toBe(200)
            expect(quoted.data.allocations).toEqual([
                expect.objectContaining({
                    dueDate: '2026-10-10',
                    allocatedAmountMinor: 22_500,
                    amountPaidMinor: 60_000,
                }),
                expect.objectContaining({
                    dueDate: '2026-10-11',
                    allocatedAmountMinor: 52_500,
                    amountPaidMinor: 52_500,
                }),
            ])
            expect(quoted.data.partialPaymentCreditAfterPaymentMinor).toBe(
                52_500,
            )
            const input = { ...draft, idempotencyKey: uuidv7() }
            const posted = await postTestingRequest('/api/payments/create', {
                body: input,
                cookie: ownerCookie,
            })
            const payment = await posted.json<
                TApiResponseOk<{
                    publicId: string
                    allocations: unknown[]
                    partialPaymentCreditAfterPaymentMinor: number
                    actualOutstandingBalanceAfterPaymentMinor: number
                    completedInstallmentsAfterPayment: number
                }>
            >()
            expect(posted.status).toBe(201)
            expect(payment.data.allocations).toEqual(quoted.data.allocations)
            expect(payment.data).toMatchObject({
                partialPaymentCreditAfterPaymentMinor: 52_500,
                actualOutstandingBalanceAfterPaymentMinor: 7_500,
                completedInstallmentsAfterPayment: 1,
            })
            const replay = await postTestingRequest('/api/payments/create', {
                body: input,
                cookie: ownerCookie,
            })
            expect(replay.status).toBe(200)
            expect(
                (await replay.json<TApiResponseOk<{ publicId: string }>>()).data
                    .publicId,
            ).toBe(payment.data.publicId)
            const reverse = await postTestingRequest(
                `/api/payments/${payment.data.publicId}/reverse`,
                {
                    body: { reason: '__TEST excess backfill reversal' },
                    cookie: ownerCookie,
                },
            )
            expect(reverse.status).toBe(200)
            const db = dbClient(env.LOANMSBOFC_D1)
            const [loan] = await db
                .select({
                    id: dbSchema.loan.id,
                    paid: dbSchema.loan.totalAmountPaidMinor,
                    partial: dbSchema.loan.partialPaymentCreditMinor,
                    outstanding: dbSchema.loan.actualOutstandingBalanceMinor,
                })
                .from(dbSchema.loan)
                .where(
                    and(
                        eq(
                            dbSchema.loan.organizationId,
                            TEST_PRIMARY_ORGANIZATION_ID,
                        ),
                        eq(dbSchema.loan.publicId, publicId),
                    ),
                )
            expect(loan).toMatchObject({
                paid: 37_500,
                partial: 37_500,
                outstanding: 82_500,
            })
            const installments = await db
                .select({ paid: dbSchema.loanInstallment.amountPaidMinor })
                .from(dbSchema.loanInstallment)
                .where(
                    and(
                        eq(
                            dbSchema.loanInstallment.organizationId,
                            TEST_PRIMARY_ORGANIZATION_ID,
                        ),
                        eq(dbSchema.loanInstallment.loanId, loan!.id),
                    ),
                )
                .orderBy(asc(dbSchema.loanInstallment.installmentNumber))
            expect(installments.map((item) => item.paid)).toEqual([
                37_500,
                0,
            ])
        },
    )

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
            currentAsOfDate: currentManilaDate(),
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
        const db = dbClient(env.LOANMSBOFC_D1)
        const [settings] = await db
            .select({ version: dbSchema.systemSettings.version })
            .from(dbSchema.systemSettings)
            .where(
                and(
                    eq(
                        dbSchema.systemSettings.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.systemSettings.isCurrent, true),
                ),
            )
        const version = settings?.version ?? 0
        expect(
            (
                await updateSettings(version, {
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
                coveredDates: ['2026-10-10'],
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
                await updateSettings(version + 1, {
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
        expect((await updateSettings(version + 2)).status).toBe(200)
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

        // Cross the D1 100-bind boundary without changing the assigned loan's
        // installments. The scope must stay a SQL subquery, not an ID array.
        const [source] = await db
            .select()
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
            .limit(1)
        const { id: _id, ...base } = source!
        const inserts = Array.from({ length: 100 }, () => {
            const publicId = uuidv7()
            return db
                .insert(dbSchema.loan)
                .values({
                    ...base,
                    publicId,
                    loanNumber: `__TEST-SCOPE-${publicId}`,
                    createIdempotencyKey: uuidv7(),
                    releaseIdempotencyKey: uuidv7(),
                })
                .returning({ id: dbSchema.loan.id })
        })
        const [
            first,
            ...remaining
        ] = inserts
        const clones = (
            await db.batch([
                first!,
                ...remaining,
            ])
        ).flat()
        const assignments = clones.map((record) =>
            db.insert(dbSchema.loanCollectionAssignment).values({
                assignedByUserId: TEST_MEMBER_USER_ID,
                collectorUserId: TEST_MEMBER_USER_ID,
                loanId: record.id,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            }),
        )
        const [
            firstAssignment,
            ...remainingAssignments
        ] = assignments
        await db.batch([
            firstAssignment!,
            ...remainingAssignments,
        ])
        const collections = await traceGetRequest(
            `/api/collections/borrower/${borrowerPublicId}`,
            memberCookie,
        )
        expect(collections.response.status).toBe(200)
        const schedule =
            await collections.response.json<
                TApiResponseOk<
                    { loanPublicId: string; remainingAmountMinor: number }[]
                >
            >()
        expect(schedule.data).toHaveLength(2)
        expect(
            schedule.data.every(
                (item) =>
                    item.loanPublicId === loanPublicId &&
                    item.remainingAmountMinor > 0,
            ),
        ).toBe(true)
        expect(
            collections.statements.filter((query) =>
                /from "loan_installment"/i.test(query),
            ),
        ).toHaveLength(1)
        expect(
            collections.statements.filter((query) =>
                /from "loan_collection_assignment"/i.test(query),
            ),
        ).toHaveLength(1)
        expect(Math.max(...collections.boundParameters)).toBeLessThanOrEqual(
            100,
        )
    })

    it('generates Cash references and requires entered electronic references', async () => {
        const referenceLoanPublicId = await createActiveLoan(100_000)
        const base = {
            amountReceivedMinor: 60_000,
            loanPublicId: referenceLoanPublicId,
            paymentDate: '2026-10-10',
        }
        for (const paymentMethod of [
            'GCASH',
            'BANK',
        ]) {
            const missingReference = await postTestingRequest(
                '/api/payments/quote',
                {
                    body: { ...base, paymentMethod },
                    cookie: ownerCookie,
                },
            )
            expect(missingReference.status).toBe(400)
        }

        const cash = await postTestingRequest('/api/payments/create', {
            body: {
                ...base,
                idempotencyKey: uuidv7(),
                paymentMethod: 'CASH',
                referenceNumber: '__TEST-ignored-cash-reference',
            },
            cookie: ownerCookie,
        })
        const cashJson = await cash.json<
            TApiResponseOk<{
                paymentNumber: string
                referenceNumber: string
            }>
        >()
        expect(cash.status).toBe(201)
        expect(cashJson.data.referenceNumber).toBe(cashJson.data.paymentNumber)

        const bank = await postTestingRequest('/api/payments/create', {
            body: {
                ...base,
                idempotencyKey: uuidv7(),
                paymentDate: '2026-10-11',
                paymentMethod: 'BANK',
                referenceNumber: '__TEST-BANK-TRANSFER-1',
            },
            cookie: ownerCookie,
        })
        const bankJson =
            await bank.json<TApiResponseOk<{ referenceNumber: string }>>()
        expect(bank.status).toBe(201)
        expect(bankJson.data.referenceNumber).toBe('__TEST-BANK-TRANSFER-1')
    })
    it('records 500 pesos oldest-first regardless of chosen dates and reverses without losing paid counts', async () => {
        const db = dbClient(env.LOANMSBOFC_D1)
        const [profile] = await db
            .insert(dbSchema.loanFormulaProfile)
            .values({
                allowRenewalPrincipalChange: false,
                effectiveAt: new Date(0),
                finalInstallmentResiduePolicy:
                    'LAST_INSTALLMENT_ABSORBS_RESIDUE',
                fixedInterestAmountMinor: null,
                installmentCount: 7,
                interestMethod: 'FLAT_PERCENTAGE',
                interestRateBasisPoints: 0,
                isActive: true,
                isDefault: false,
                minCompletedInstallments: 0,
                name: '__TEST-Covered Dates Formula',
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                partialCreditPolicy: 'CARRY_FORWARD',
                paymentFrequency: 'DAILY',
                publicId: uuidv7(),
                renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
                roundingMode: 'HALF_UP',
                termDays: 7,
                timezone: 'Asia/Manila',
                version: 1,
            })
            .returning({ id: dbSchema.loanFormulaProfile.id })
        const product = await postTestingRequest('/api/loans/product/create', {
            body: {
                formulaProfilePublicId: (
                    await db
                        .select({
                            publicId: dbSchema.loanFormulaProfile.publicId,
                        })
                        .from(dbSchema.loanFormulaProfile)
                        .where(eq(dbSchema.loanFormulaProfile.id, profile!.id))
                )[0]!.publicId,
                idempotencyKey: uuidv7(),
                maximumPrincipalMinor: 100_000_00,
                minimumPrincipalMinor: 100_00,
                name: '__TEST-Covered Dates Product',
            },
            cookie: ownerCookie,
        })
        expect(product.status).toBe(201)
        const productJson =
            await product.json<TApiResponseOk<{ publicId: string }>>()
        const coverageLoanId = await createActiveLoan(
            70_000,
            productJson.data.publicId,
        )
        const selectedDates = [
            '2026-10-11',
            '2026-10-12',
            '2026-10-14',
            '2026-10-15',
            '2026-10-16',
        ]
        const allocatedDates = [
            '2026-10-10',
            '2026-10-11',
            '2026-10-12',
            '2026-10-13',
            '2026-10-14',
        ]
        const draft = {
            amountReceivedMinor: 50_000,
            coveredDates: selectedDates,
            loanPublicId: coverageLoanId,
            paymentDate: '2026-10-16',
            paymentMethod: 'CASH',
        }

        for (const coveredDates of [
            [],
            [
                '2026-10-11',
                '2026-10-11',
            ],
            ['2026-02-30'],
            Array.from({ length: 1001 }, () => '2026-10-11'),
        ]) {
            const response = await postTestingRequest('/api/payments/quote', {
                body: { ...draft, coveredDates },
                cookie: ownerCookie,
            })
            expect(response.status).toBe(400)
            expect((await response.json<TApiResponseError>()).error.code).toBe(
                'DATA_VALIDATION',
            )
        }
        for (const [
            changes,
            message,
        ] of [
            [
                { coveredDates: ['2026-11-01'] },
                'Paid, waived, and unavailable installment dates cannot be selected. Refresh the schedule and select unpaid dates.',
            ],
        ] as const) {
            for (const action of [
                'quote',
                'create',
            ]) {
                const response = await postTestingRequest(
                    `/api/payments/${action}`,
                    {
                        body: {
                            ...draft,
                            ...changes,
                            ...(action === 'create'
                                ? { idempotencyKey: uuidv7() }
                                : {}),
                        },
                        cookie: ownerCookie,
                    },
                )
                expect(response.status).toBe(409)
                const error = (await response.json<TApiResponseError>()).error
                expect(error.code).toBe('CONFLICT')
                expect(error.message).toBe(message)
            }
        }
        const [loanBefore] = await db
            .select({
                id: dbSchema.loan.id,
                total: dbSchema.loan.totalAmountPaidMinor,
            })
            .from(dbSchema.loan)
            .where(eq(dbSchema.loan.publicId, coverageLoanId))
        expect(loanBefore!.total).toBe(0)
        expect(
            await db
                .select({ id: dbSchema.payment.id })
                .from(dbSchema.payment)
                .where(eq(dbSchema.payment.loanId, loanBefore!.id)),
        ).toEqual([])

        const quote = await postTestingRequest('/api/payments/quote', {
            body: draft,
            cookie: ownerCookie,
        })
        const quoteJson = await quote.json<
            TApiResponseOk<{
                allocations: {
                    dueDate: string
                    allocatedAmountMinor: number
                }[]
                completedInstallmentsAfterPayment: number
                remainingInstallmentsAfterPayment: number
                actualOutstandingBalanceAfterPaymentMinor: number
            }>
        >()
        expect(quote.status).toBe(200)
        expect(quoteJson.data.allocations.map((item) => item.dueDate)).toEqual(
            allocatedDates,
        )
        expect(
            quoteJson.data.allocations.map((item) => item.allocatedAmountMinor),
        ).toEqual([
            10_000,
            10_000,
            10_000,
            10_000,
            10_000,
        ])
        expect(quoteJson.data).toMatchObject({
            completedInstallmentsAfterPayment: 5,
            remainingInstallmentsAfterPayment: 2,
            actualOutstandingBalanceAfterPaymentMinor: 20_000,
        })
        const input = { ...draft, idempotencyKey: uuidv7() }
        const posted = await postTestingRequest('/api/payments/create', {
            body: input,
            cookie: ownerCookie,
        })
        const postedJson = await posted.json<
            TApiResponseOk<{
                publicId: string
                allocations: { dueDate: string }[]
            }>
        >()
        expect(posted.status).toBe(201)
        expect(postedJson.data.allocations.map((item) => item.dueDate)).toEqual(
            allocatedDates,
        )
        const replay = await postTestingRequest('/api/payments/create', {
            body: input,
            cookie: ownerCookie,
        })
        expect(replay.status).toBe(200)
        expect(
            (await replay.json<TApiResponseOk<{ publicId: string }>>()).data
                .publicId,
        ).toBe(postedJson.data.publicId)
        const [paymentRow] = await db
            .select({ id: dbSchema.payment.id })
            .from(dbSchema.payment)
            .where(eq(dbSchema.payment.publicId, postedJson.data.publicId))
        expect(
            await db
                .select({ id: dbSchema.paymentAllocation.id })
                .from(dbSchema.paymentAllocation)
                .where(
                    eq(dbSchema.paymentAllocation.paymentId, paymentRow!.id),
                ),
        ).toHaveLength(5)
        expect(
            await db
                .select({ id: dbSchema.cashTransaction.id })
                .from(dbSchema.cashTransaction)
                .where(eq(dbSchema.cashTransaction.paymentId, paymentRow!.id)),
        ).toHaveLength(1)
        const installments = await db
            .select({
                date: dbSchema.loanInstallment.dueDate,
                paid: dbSchema.loanInstallment.amountPaidMinor,
            })
            .from(dbSchema.loanInstallment)
            .where(eq(dbSchema.loanInstallment.loanId, loanBefore!.id))
        expect(
            installments
                .filter((item) => allocatedDates.includes(item.date))
                .map((item) => item.paid),
        ).toEqual([
            10_000,
            10_000,
            10_000,
            10_000,
            10_000,
        ])
        expect(
            installments
                .filter((item) => !allocatedDates.includes(item.date))
                .map((item) => item.paid),
        ).toEqual([
            0,
            0,
        ])
        for (const action of [
            'quote',
            'create',
        ]) {
            const stale = await postTestingRequest(`/api/payments/${action}`, {
                body: {
                    ...draft,
                    ...(action === 'create'
                        ? { idempotencyKey: uuidv7() }
                        : {}),
                },
                cookie: ownerCookie,
            })
            expect(stale.status).toBe(409)
            expect((await stale.json<TApiResponseError>()).error.code).toBe(
                'CONFLICT',
            )
        }
        const second = await postTestingRequest('/api/payments/create', {
            body: {
                ...draft,
                coveredDates: ['2026-10-15'],
                amountReceivedMinor: 10_000,
                idempotencyKey: uuidv7(),
            },
            cookie: ownerCookie,
        })
        expect(second.status).toBe(201)
        const secondJson =
            await second.json<TApiResponseOk<{ publicId: string }>>()
        expect(
            (
                await postTestingRequest(
                    `/api/payments/${secondJson.data.publicId}/reverse`,
                    {
                        body: { reason: '__TEST-Coverage reversal' },
                        cookie: ownerCookie,
                    },
                )
            ).status,
        ).toBe(200)
        const [restored] = await db
            .select({
                completed: dbSchema.loan.completedInstallmentCount,
                outstanding: dbSchema.loan.actualOutstandingBalanceMinor,
                status: dbSchema.loan.status,
            })
            .from(dbSchema.loan)
            .where(eq(dbSchema.loan.id, loanBefore!.id))
        expect(restored).toEqual({
            completed: 5,
            outstanding: 20_000,
            status: 'OVERDUE',
        })
        expect(
            (
                await postTestingRequest(
                    `/api/payments/${postedJson.data.publicId}/reverse`,
                    {
                        body: { reason: '__TEST-Coverage reversal' },
                        cookie: ownerCookie,
                    },
                )
            ).status,
        ).toBe(200)
        const [reset] = await db
            .select({
                completed: dbSchema.loan.completedInstallmentCount,
                outstanding: dbSchema.loan.actualOutstandingBalanceMinor,
            })
            .from(dbSchema.loan)
            .where(eq(dbSchema.loan.id, loanBefore!.id))
        expect(reset).toEqual({ completed: 0, outstanding: 70_000 })
    })

    it('reads a full 100-payment page and allocations within D1 parameter and query limits', async () => {
        const db = dbClient(env.LOANMSBOFC_D1)
        const [original] = await db
            .select()
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
            .limit(1)
        expect(original).toBeDefined()
        const [installment] = await db
            .select()
            .from(dbSchema.loanInstallment)
            .where(
                and(
                    eq(
                        dbSchema.loanInstallment.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loanInstallment.loanId, original!.loanId),
                ),
            )
            .orderBy(asc(dbSchema.loanInstallment.installmentNumber))
            .limit(1)
        // Each fixture is a separate statement to respect D1's 100-bind limit.
        const { id: _id, ...base } = original!
        const ids = Array.from({ length: 100 }, () => uuidv7())
        const inserts = ids.map((publicId, index) =>
            db
                .insert(dbSchema.payment)
                .values({
                    ...base,
                    publicId,
                    paymentNumber: `__TEST-PERF-${publicId}`,
                    idempotencyKey: uuidv7(),
                    amountReceivedMinor: 1,
                    amountAllocatedMinor: 1,
                    unallocatedMinor: 0,
                    status: 'POSTED',
                    reversedAt: null,
                    reversedByUserId: null,
                    reversalReason: null,
                    createdAt: new Date(Date.UTC(2099, 0, 1) + index),
                })
                .returning({
                    id: dbSchema.payment.id,
                    publicId: dbSchema.payment.publicId,
                }),
        )
        const [
            first,
            ...remaining
        ] = inserts
        const created = (
            await db.batch([
                first!,
                ...remaining,
            ])
        ).flat()
        const allocations = created.map((record) =>
            db.insert(dbSchema.paymentAllocation).values({
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                paymentId: record.id,
                loanInstallmentId: installment!.id,
                allocatedAmountMinor: 1,
                amountPaidBeforeMinor: 0,
                statusBefore: 'UPCOMING',
            }),
        )
        const [
            firstAllocation,
            ...remainingAllocations
        ] = allocations
        await db.batch([
            firstAllocation!,
            ...remainingAllocations,
        ])

        const traced = await traceQueryRequest(
            '/api/payments/readMany',
            {
                filters: { loanPublicId, status: 'POSTED' },
                limit: 100,
                offset: 0,
                sortOrder: 'desc',
            },
            ownerCookie,
        )
        expect(traced.response.status).toBe(200)
        const page = await traced.response.json<
            TApiResponsePaginatedOk<
                {
                    publicId: string
                    allocations: {
                        allocatedAmountMinor: number
                        installmentNumber: number
                    }[]
                }[]
            >
        >()
        expect(page.data.map((record) => record.publicId)).toEqual(
            [...ids].reverse(),
        )
        expect(
            page.data.every(
                (record) =>
                    record.allocations.length === 1 &&
                    record.allocations[0]?.allocatedAmountMinor === 1 &&
                    record.allocations[0]?.installmentNumber ===
                        installment!.installmentNumber,
            ),
        ).toBe(true)
        expect(
            page.data.every(
                (record) =>
                    !('id' in record) &&
                    !('organizationId' in record) &&
                    !('paymentId' in record.allocations[0]!),
            ),
        ).toBe(true)
        expect(
            traced.statements.filter((query) => /from "payment"/i.test(query)),
        ).toHaveLength(2)
        expect(
            traced.statements.filter((query) =>
                /from "payment_allocation"/i.test(query),
            ),
        ).toHaveLength(2)
        expect(Math.max(...traced.boundParameters)).toBe(100)
    })
})
