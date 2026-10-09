import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseOk } from '@loanms/types/shared'
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
let memberCookie: string
let ownerCookie: string

const formulaProfilePublicId = '019936e2-b837-7000-8000-000000000501'

beforeAll(async () => {
    ;[
        ownerCookie,
        memberCookie,
    ] = await seedTestingCookies()
    await postTestingRequest('/api/companyFund/setup', {
        body: {
            fundName: '__TEST Renewal Primary Fund',
            idempotencyKey: uuidv7(),
            openingCapitalMinor: 100_000_00,
            transactionDate: '2026-10-01',
        },
        cookie: ownerCookie,
    })
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
        isDefault: false,
        minCompletedInstallments: 28,
        name: '__TEST-Renewal Formula',
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
            addressLine: '1 __TEST-Renewal Street',
            barangay: '__TEST Barangay',
            birthDate: '1990-01-01',
            cityMunicipality: '__TEST City',
            contactNumber: '+639179876541',
            emergencyContactName: '__TEST Emergency',
            emergencyContactNumber: '+639178765431',
            emergencyContactRelationship: 'SIBLING',
            firstName: '__TEST RENEWAL',
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

    const product = await postTestingRequest('/api/loans/product/create', {
        body: {
            formulaProfilePublicId,
            idempotencyKey: uuidv7(),
            maximumPrincipalMinor: 20_000_00,
            minimumPrincipalMinor: 1_000_00,
            name: '__TEST Renewal 60-Day',
        },
        cookie: ownerCookie,
    })
    const productJson =
        await product.json<TApiResponseOk<{ publicId: string }>>()
    loanProductPublicId = productJson.data.publicId
})

async function createActiveLoan(productPublicId = loanProductPublicId) {
    const create = await postTestingRequest('/api/loans/create', {
        body: {
            borrowerPublicId,
            firstPaymentDate: '2026-10-10',
            idempotencyKey: uuidv7(),
            loanProductPublicId: productPublicId,
            principalMinor: 7_000_00,
            releaseDate: '2026-10-09',
        },
        cookie: ownerCookie,
    })
    const createJson = await create.json<TApiResponseOk<{ publicId: string }>>()
    const publicId = createJson.data.publicId
    await postTestingRequest(`/api/loans/${publicId}/approve`, {
        body: {},
        cookie: ownerCookie,
    })
    await postTestingRequest(`/api/loans/${publicId}/release`, {
        body: {},
        cookie: ownerCookie,
    })
    return publicId
}

describe('Renewal API', () => {
    it('quotes and atomically releases a completed-day renewal while carrying partial credit forward', async () => {
        const oldLoanPublicId = await createActiveLoan()
        const payment = await postTestingRequest('/api/payments/create', {
            body: {
                amountReceivedMinor: 4_000_00,
                idempotencyKey: uuidv7(),
                loanPublicId: oldLoanPublicId,
                paymentDate: '2026-10-10',
                paymentMethod: 'CASH',
            },
            cookie: ownerCookie,
        })
        const quote = await postTestingRequest('/api/renewals/quote', {
            body: {
                firstPaymentDate: '2026-10-20',
                previousLoanPublicId: oldLoanPublicId,
                releaseDate: '2026-10-19',
                renewalPrincipalMinor: 7_000_00,
            },
            cookie: ownerCookie,
        })
        const quoteJson = await quote.json<
            TApiResponseOk<{
                cashReleaseAmountMinor: number
                previousCompletedInstallmentCount: number
                previousPartialCreditMinor: number
                previousRemainingInstallmentCount: number
                renewalSettlementBalanceMinor: number
            }>
        >()
        const idempotencyKey = uuidv7()
        const body = {
            firstPaymentDate: '2026-10-20',
            idempotencyKey,
            previousLoanPublicId: oldLoanPublicId,
            releaseDate: '2026-10-19',
            renewalPrincipalMinor: 7_000_00,
        }
        const denied = await postTestingRequest('/api/renewals', {
            body,
            cookie: memberCookie,
        })
        const competingBody = {
            ...body,
            idempotencyKey: uuidv7(),
        }
        const [
            firstCreate,
            competingCreate,
        ] = await Promise.all([
            postTestingRequest('/api/renewals', {
                body,
                cookie: ownerCookie,
            }),
            postTestingRequest('/api/renewals', {
                body: competingBody,
                cookie: ownerCookie,
            }),
        ])
        const create =
            firstCreate.status === 201 ? firstCreate : competingCreate
        const winningBody = firstCreate.status === 201 ? body : competingBody
        const createJson =
            await create.json<
                TApiResponseOk<{ newLoanPublicId: string; publicId: string }>
            >()
        const replay = await postTestingRequest('/api/renewals', {
            body: winningBody,
            cookie: ownerCookie,
        })
        const detail = await getTestingRequest(
            `/api/renewals/read/${createJson.data.publicId}`,
            { cookie: ownerCookie },
        )
        const list = await queryTestingRequest(
            '/api/renewals/readMany',
            { filters: { previousLoanPublicId: oldLoanPublicId } },
            { cookie: ownerCookie },
        )
        const oldLoan = await getTestingRequest(
            `/api/loans/read/${oldLoanPublicId}`,
            { cookie: ownerCookie },
        )
        const newLoan = await getTestingRequest(
            `/api/loans/read/${createJson.data.newLoanPublicId}`,
            { cookie: ownerCookie },
        )
        const db = dbClient(env.LOANMSBOFC_D1)
        const [renewal] = await db
            .select({
                id: dbSchema.loanRenewal.id,
                partialCreditCarriedForwardMinor:
                    dbSchema.loanRenewal.partialCreditCarriedForwardMinor,
                status: dbSchema.loanRenewal.status,
            })
            .from(dbSchema.loanRenewal)
            .where(
                and(
                    eq(
                        dbSchema.loanRenewal.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loanRenewal.publicId, createJson.data.publicId),
                ),
            )
        const capitalTransactions = await db
            .select({
                amountMinor: dbSchema.capitalTransaction.amountMinor,
                direction: dbSchema.capitalTransaction.direction,
                transactionType: dbSchema.capitalTransaction.transactionType,
            })
            .from(dbSchema.capitalTransaction)
            .where(
                and(
                    eq(
                        dbSchema.capitalTransaction.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.capitalTransaction.loanRenewalId, renewal!.id),
                ),
            )
        const [
            fund,
            report,
            audit,
        ] = await Promise.all([
            getTestingRequest('/api/companyFund/reconciliation', {
                cookie: ownerCookie,
            }),
            queryTestingRequest(
                '/api/reports/summary',
                { filters: {} },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/auditTrail/readMany',
                {},
                {
                    cookie: ownerCookie,
                },
            ),
        ])
        const fundJson = await fund.json<
            TApiResponseOk<{
                availableCashMinor: number
                interestCollectedMinor: number
                netEarningsMinor: number
                outstandingPrincipalMinor: number
                principalCollectedMinor: number
                principalReleasedMinor: number
            }>
        >()
        const reportJson = await report.json<
            TApiResponseOk<{
                currentActivePrincipalMinor: number
                interestCollectedMinor: number
                principalCollectedMinor: number
                renewalReleasedMinor: number
            }>
        >()
        const auditJson = await audit.json<
            TApiResponseOk<
                {
                    component: string
                    records: { id: string }[]
                }[]
            >
        >()
        const cashTransactions = await db
            .select({
                amountMinor: dbSchema.cashTransaction.amountMinor,
                transactionType: dbSchema.cashTransaction.transactionType,
            })
            .from(dbSchema.cashTransaction)
            .where(
                and(
                    eq(
                        dbSchema.cashTransaction.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.cashTransaction.transactionType,
                        'RENEWAL_RELEASE',
                    ),
                    eq(dbSchema.cashTransaction.amountMinor, 2_520_00),
                ),
            )
        const oldLoanJson =
            await oldLoan.json<TApiResponseOk<{ status: string }>>()
        const newLoanJson = await newLoan.json<
            TApiResponseOk<{
                partialPaymentCreditMinor: number
                status: string
            }>
        >()

        expect(payment.status).toBe(201)
        expect(quote.status).toBe(200)
        expect(quoteJson.data).toMatchObject({
            cashReleaseAmountMinor: 2_520_00,
            previousCompletedInstallmentCount: 28,
            previousPartialCreditMinor: 80_00,
            previousRemainingInstallmentCount: 32,
            renewalSettlementBalanceMinor: 4_480_00,
        })
        expect(denied.status).toBe(403)
        expect(
            [
                firstCreate.status,
                competingCreate.status,
            ].sort(),
        ).toEqual([
            201,
            409,
        ])
        expect(create.status).toBe(201)
        expect(create.headers.get('audit-event-recorded')).toBe('true')
        expect(replay.status).toBe(200)
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(detail.status).toBe(200)
        expect(list.status).toBe(200)
        expect(oldLoanJson.data.status).toBe('RENEWED')
        expect(newLoanJson.data).toMatchObject({
            partialPaymentCreditMinor: 80_00,
            status: 'ACTIVE',
        })
        expect(renewal).toEqual({
            id: expect.any(Number),
            partialCreditCarriedForwardMinor: 80_00,
            status: 'RELEASED',
        })
        expect(cashTransactions).toEqual([
            {
                amountMinor: 2_520_00,
                transactionType: 'RENEWAL_RELEASE',
            },
        ])
        expect(capitalTransactions).toEqual([
            {
                amountMinor: 7_000_00,
                direction: 'OUT',
                transactionType: 'RENEWAL_RELEASE',
            },
            {
                amountMinor: 3_000_00,
                direction: 'IN',
                transactionType: 'RENEWAL_SETTLEMENT_PRINCIPAL',
            },
            {
                amountMinor: 1_400_00,
                direction: 'IN',
                transactionType: 'RENEWAL_SETTLEMENT_INTEREST',
            },
            {
                amountMinor: 80_00,
                direction: 'IN',
                transactionType: 'RENEWAL_PARTIAL_CREDIT_TRANSFER',
            },
        ])
        expect(fund.status).toBe(200)
        expect(fundJson.data).toMatchObject({
            availableCashMinor: 94_480_00,
            interestCollectedMinor: 1_400_00,
            netEarningsMinor: 1_400_00,
            outstandingPrincipalMinor: 7_000_00,
            principalCollectedMinor: 7_000_00,
            principalReleasedMinor: 14_000_00,
        })
        expect(report.status).toBe(200)
        expect(reportJson.data).toMatchObject({
            currentActivePrincipalMinor: 7_000_00,
            interestCollectedMinor: 1_400_00,
            principalCollectedMinor: 7_000_00,
            renewalReleasedMinor: 7_000_00,
        })
        expect(audit.status).toBe(200)
        expect(auditJson.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    component: 'renewal',
                    records: expect.arrayContaining([
                        expect.objectContaining({
                            id: createJson.data.publicId,
                        }),
                    ]),
                }),
            ]),
        )
    })
    it('recomputes a collection schedule when renewal changes the principal', async () => {
        const db = dbClient(env.LOANMSBOFC_D1)
        const collectionProfilePublicId = uuidv7()
        await db.insert(dbSchema.loanFormulaProfile).values({
            allowRenewalPrincipalChange: true,
            collectionAmountMinor: 14_000,
            effectiveAt: new Date(0),
            finalInstallmentResiduePolicy: 'LAST_INSTALLMENT_ABSORBS_RESIDUE',
            installmentCount: 60,
            interestMethod: 'FLAT_PERCENTAGE',
            interestRateBasisPoints: 2_000,
            isActive: true,
            minCompletedInstallments: 0,
            name: '__TEST-Renewal Collection Formula',
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            partialCreditPolicy: 'APPLY_TO_SETTLEMENT',
            paymentFrequency: 'DAILY',
            publicId: collectionProfilePublicId,
            renewalSettlementMethod: 'EXACT_OUTSTANDING_BALANCE',
            roundingMode: 'HALF_UP',
            termDays: 60,
            version: 1,
        })
        const product = await postTestingRequest('/api/loans/product/create', {
            body: {
                formulaProfilePublicId: collectionProfilePublicId,
                idempotencyKey: uuidv7(),
                maximumPrincipalMinor: 20_000_00,
                minimumPrincipalMinor: 1_000_00,
                name: '__TEST Renewal Collection',
            },
            cookie: ownerCookie,
        })
        expect(product.status).toBe(201)
        const productJson =
            await product.json<TApiResponseOk<{ publicId: string }>>()
        const oldLoanPublicId = await createActiveLoan(
            productJson.data.publicId,
        )
        const payment = await postTestingRequest('/api/payments/create', {
            body: {
                amountReceivedMinor: 600_000,
                idempotencyKey: uuidv7(),
                loanPublicId: oldLoanPublicId,
                paymentDate: '2026-10-10',
                paymentMethod: 'CASH',
            },
            cookie: ownerCookie,
        })
        expect(payment.status).toBe(201)
        const input = {
            firstPaymentDate: '2026-10-20',
            previousLoanPublicId: oldLoanPublicId,
            releaseDate: '2026-10-19',
            renewalPrincipalMinor: 300_000,
        }
        const quote = await postTestingRequest('/api/renewals/quote', {
            body: input,
            cookie: ownerCookie,
        })
        expect(quote.status).toBe(200)
        const quoted = await quote.json<
            TApiResponseOk<{
                renewalFormulaSnapshot: {
                    installmentCount: number
                    termDays: number
                }
                totalPayableMinor: number
            }>
        >()
        expect(quoted.data).toMatchObject({
            renewalFormulaSnapshot: { installmentCount: 26, termDays: 26 },
            totalPayableMinor: 360_000,
        })
        const create = await postTestingRequest('/api/renewals', {
            body: { ...input, idempotencyKey: uuidv7() },
            cookie: ownerCookie,
        })
        expect(create.status).toBe(201)
        const created =
            await create.json<TApiResponseOk<{ newLoanPublicId: string }>>()
        const [stored] = await db
            .select()
            .from(dbSchema.loan)
            .where(
                and(
                    eq(
                        dbSchema.loan.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loan.publicId, created.data.newLoanPublicId),
                ),
            )
        expect(stored).toMatchObject({
            installmentCount: 26,
            termDays: 26,
            installmentAmountMinor: 14_000,
        })
        const schedule = await db
            .select({ amountDueMinor: dbSchema.loanInstallment.amountDueMinor })
            .from(dbSchema.loanInstallment)
            .where(
                and(
                    eq(
                        dbSchema.loanInstallment.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loanInstallment.loanId, stored.id),
                ),
            )
            .orderBy(dbSchema.loanInstallment.installmentNumber)
        expect(
            schedule.map((installment) => installment.amountDueMinor),
        ).toEqual([
            ...Array<number>(25).fill(14_000),
            10_000,
        ])
    })

    it.each([
        [
            'WEEKLY',
            '2026-02-07',
        ],
        [
            'MONTHLY',
            '2026-02-28',
        ],
    ] as const)(
        'starts %s renewal collection one period after cash release',
        async (paymentFrequency, firstPaymentDate) => {
            const db = dbClient(env.LOANMSBOFC_D1)
            const [profile] = await db
                .select()
                .from(dbSchema.loanFormulaProfile)
                .where(
                    eq(
                        dbSchema.loanFormulaProfile.publicId,
                        formulaProfilePublicId,
                    ),
                )
            const profilePublicId = uuidv7()
            await db.insert(dbSchema.loanFormulaProfile).values({
                ...profile,
                id: undefined,
                isDefault: false,
                minCompletedInstallments: 0,
                name: `__TEST-${paymentFrequency} Renewal Formula`,
                paymentFrequency,
                publicId: profilePublicId,
            })
            const product = await postTestingRequest(
                '/api/loans/product/create',
                {
                    body: {
                        formulaProfilePublicId: profilePublicId,
                        idempotencyKey: uuidv7(),
                        maximumPrincipalMinor: 2_000_000,
                        minimumPrincipalMinor: 100_000,
                        name: `__TEST-${paymentFrequency} Renewal Product`,
                    },
                    cookie: ownerCookie,
                },
            )
            expect(product.status).toBe(201)
            const productJson =
                await product.json<TApiResponseOk<{ publicId: string }>>()
            const previousLoanPublicId = await createActiveLoan(
                productJson.data.publicId,
            )
            const payment = await postTestingRequest('/api/payments/create', {
                body: {
                    amountReceivedMinor: 400_000,
                    idempotencyKey: uuidv7(),
                    loanPublicId: previousLoanPublicId,
                    paymentDate: '2026-10-10',
                    paymentMethod: 'CASH',
                },
                cookie: ownerCookie,
            })
            expect(payment.status).toBe(201)
            const input = {
                previousLoanPublicId,
                firstPaymentDate: '2026-02-01',
                releaseDate: '2026-01-31',
                renewalPrincipalMinor: 700_000,
            }
            const quote = await postTestingRequest('/api/renewals/quote', {
                body: input,
                cookie: ownerCookie,
            })
            expect(quote.status).toBe(200)
            const quoted = await quote.json<
                TApiResponseOk<{
                    firstPaymentDate: string
                    installments: { dueDate: string }[]
                }>
            >()
            expect(quoted.data.firstPaymentDate).toBe(firstPaymentDate)
            expect(quoted.data.installments[0]?.dueDate).toBe(firstPaymentDate)
            const create = await postTestingRequest('/api/renewals', {
                body: { ...input, idempotencyKey: uuidv7() },
                cookie: ownerCookie,
            })
            expect(create.status).toBe(201)
            const created =
                await create.json<TApiResponseOk<{ newLoanPublicId: string }>>()
            const detail = await getTestingRequest(
                `/api/loans/read/${created.data.newLoanPublicId}`,
                { cookie: ownerCookie },
            )
            expect(detail.status).toBe(200)
            const loan = await detail.json<
                TApiResponseOk<{
                    firstPaymentDate: string
                    releaseDate: string
                    installments: { dueDate: string }[]
                }>
            >()
            expect(loan.data.releaseDate).toBe(input.releaseDate)
            expect(loan.data.firstPaymentDate).toBe(firstPaymentDate)
            expect(loan.data.installments[0]?.dueDate).toBe(firstPaymentDate)
        },
    )
})
