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
        const sameDayQuote = await postTestingRequest('/api/loans/quote', {
            body: {
                borrowerPublicId,
                firstPaymentDate: '2026-10-09',
                loanProductPublicId,
                principalMinor: 7_000_00,
                releaseDate: '2026-10-09',
            },
            cookie: ownerCookie,
        })

        expect(create.status).toBe(201)
        expect(create.headers.get('audit-event-recorded')).toBe('true')
        expect(quote.status).toBe(200)
        expect(sameDayQuote.status).toBe(400)
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
        const sameDayCreate = await postTestingRequest('/api/loans/create', {
            body: {
                ...body,
                firstPaymentDate: body.releaseDate,
                idempotencyKey: uuidv7(),
            },
            cookie: ownerCookie,
        })
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
        const listJson =
            await list.json<
                TApiResponsePaginatedOk<
                    { borrowerName: string; borrowerPublicId: string }[]
                >
            >()
        const db = dbClient(env.LOANMSBOFC_D1)
        const [storedLoan] = await db
            .select({
                expectedCompletionDate: dbSchema.loan.expectedCompletionDate,
                firstPaymentDate: dbSchema.loan.firstPaymentDate,
                id: dbSchema.loan.id,
                releaseDate: dbSchema.loan.releaseDate,
            })
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
            .select({
                dueDate: dbSchema.loanInstallment.dueDate,
                installmentNumber: dbSchema.loanInstallment.installmentNumber,
            })
            .from(dbSchema.loanInstallment)
            .where(eq(dbSchema.loanInstallment.loanId, storedLoan.id))
            .orderBy(dbSchema.loanInstallment.installmentNumber)
        const cashTransactions = await db
            .select({ amountMinor: dbSchema.cashTransaction.amountMinor })
            .from(dbSchema.cashTransaction)
            .where(eq(dbSchema.cashTransaction.loanId, storedLoan.id))
        const deniedJson = await denied.json<TApiResponseError>()
        const releaseJson = await release.json<
            TApiResponseOk<{
                expectedCompletionDate: string
                firstPaymentDate: string
                installments: { dueDate: string }[]
                releaseDate: string
                status: string
            }>
        >()
        const nextDay = new Date(
            `${releaseJson.data.releaseDate}T00:00:00.000Z`,
        )
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)
        const expectedFirstPaymentDate = nextDay.toISOString().slice(0, 10)

        expect(first.status).toBe(201)
        expect(sameDayCreate.status).toBe(400)
        expect(first.headers.get('audit-event-recorded')).toBe('true')
        expect(replay.headers.get('audit-event-recorded')).toBeNull()
        expect(deniedJson.error.code).toBe('FORBIDDEN')
        expect(approve.status).toBe(200)
        expect(noFundRelease.status).toBe(409)
        expect(fundSetup.status).toBe(201)
        expect(release.status).toBe(200)
        expect(release.headers.get('audit-event-recorded')).toBe('true')
        expect(releaseJson.data.status).toBe('ACTIVE')
        expect(releaseJson.data.firstPaymentDate).toBe(expectedFirstPaymentDate)
        expect(releaseJson.data.installments[0]?.dueDate).toBe(
            expectedFirstPaymentDate,
        )
        expect(storedLoan.releaseDate).toBe(releaseJson.data.releaseDate)
        expect(storedLoan.firstPaymentDate).toBe(expectedFirstPaymentDate)
        expect(storedLoan.expectedCompletionDate).toBe(
            installments.at(-1)?.dueDate,
        )
        expect(releaseJson.data.expectedCompletionDate).toBe(
            installments.at(-1)?.dueDate,
        )
        expect(secondRelease.status).toBe(409)
        expect(detail.status).toBe(200)
        expect(list.status).toBe(200)
        expect(listJson.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    borrowerName: '__TEST LOAN BORROWER',
                    borrowerPublicId,
                }),
            ]),
        )
        expect(installments).toHaveLength(60)
        expect(cashTransactions).toEqual([{ amountMinor: 7_000_00 }])
    })

    it.each([
        'WEEKLY',
        'MONTHLY',
    ] as const)(
        'starts %s collection one period after actual cash release',
        async (paymentFrequency) => {
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
                installmentCount: 2,
                isDefault: false,
                name: `__TEST-${paymentFrequency} Collection Formula`,
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
                        name: `__TEST-${paymentFrequency} Collection Product`,
                    },
                    cookie: ownerCookie,
                },
            )
            expect(product.status).toBe(201)
            const productJson = await product.json<
                TApiResponseOk<{
                    publicId: string
                    paymentFrequency: string
                }>
            >()
            expect(productJson.data.paymentFrequency).toBe(paymentFrequency)
            const input = {
                borrowerPublicId,
                firstPaymentDate: '2026-10-10',
                loanProductPublicId: productJson.data.publicId,
                principalMinor: 100_000,
                releaseDate: '2026-10-09',
            }
            const quote = await postTestingRequest('/api/loans/quote', {
                body: input,
                cookie: ownerCookie,
            })
            expect(quote.status).toBe(200)
            const quoteJson = await quote.json<
                TApiResponseOk<{
                    firstPaymentDate: string
                    installments: { dueDate: string }[]
                }>
            >()
            const estimatedFirstDate =
                paymentFrequency === 'WEEKLY' ? '2026-10-16' : '2026-11-09'
            expect(quoteJson.data.firstPaymentDate).toBe(estimatedFirstDate)
            expect(quoteJson.data.installments[0]?.dueDate).toBe(
                estimatedFirstDate,
            )
            const create = await postTestingRequest('/api/loans/create', {
                body: { ...input, idempotencyKey: uuidv7() },
                cookie: ownerCookie,
            })
            expect(create.status).toBe(201)
            const created = await create.json<
                TApiResponseOk<{
                    publicId: string
                    firstPaymentDate: string
                }>
            >()
            expect(created.data.firstPaymentDate).toBe(estimatedFirstDate)
            const approve = await postTestingRequest(
                `/api/loans/${created.data.publicId}/approve`,
                { body: {}, cookie: ownerCookie },
            )
            expect(approve.status).toBe(200)
            const release = await postTestingRequest(
                `/api/loans/${created.data.publicId}/release`,
                { body: {}, cookie: ownerCookie },
            )
            expect(release.status).toBe(200)
            const released = await release.json<
                TApiResponseOk<{
                    releaseDate: string
                    firstPaymentDate: string
                    expectedCompletionDate: string
                    installments: { dueDate: string }[]
                }>
            >()
            const releaseDate = released.data.releaseDate
            const date = new Date(`${releaseDate}T00:00:00.000Z`)
            const collectionDate = new Date(date)
            if (paymentFrequency === 'WEEKLY') {
                collectionDate.setUTCDate(date.getUTCDate() + 7)
            } else {
                collectionDate.setUTCDate(1)
                collectionDate.setUTCMonth(date.getUTCMonth() + 1)
                const lastDay = new Date(
                    Date.UTC(
                        collectionDate.getUTCFullYear(),
                        collectionDate.getUTCMonth() + 1,
                        0,
                    ),
                ).getUTCDate()
                collectionDate.setUTCDate(Math.min(date.getUTCDate(), lastDay))
            }
            const firstPaymentDate = collectionDate.toISOString().slice(0, 10)
            const finalDate = new Date(collectionDate)
            if (paymentFrequency === 'WEEKLY') {
                finalDate.setUTCDate(finalDate.getUTCDate() + 7)
            } else {
                finalDate.setUTCDate(1)
                finalDate.setUTCMonth(collectionDate.getUTCMonth() + 1)
                const lastDay = new Date(
                    Date.UTC(
                        finalDate.getUTCFullYear(),
                        finalDate.getUTCMonth() + 1,
                        0,
                    ),
                ).getUTCDate()
                finalDate.setUTCDate(
                    Math.min(collectionDate.getUTCDate(), lastDay),
                )
            }
            const lastDueDate = finalDate.toISOString().slice(0, 10)
            expect(released.data.firstPaymentDate).toBe(firstPaymentDate)
            expect(
                released.data.installments.map(
                    (installment) => installment.dueDate,
                ),
            ).toEqual([
                firstPaymentDate,
                lastDueDate,
            ])
            expect(released.data.expectedCompletionDate).toBe(lastDueDate)
            const [storedLoan] = await db
                .select({
                    firstPaymentDate: dbSchema.loan.firstPaymentDate,
                    releaseDate: dbSchema.loan.releaseDate,
                    expectedCompletionDate:
                        dbSchema.loan.expectedCompletionDate,
                })
                .from(dbSchema.loan)
                .where(
                    and(
                        eq(
                            dbSchema.loan.organizationId,
                            TEST_PRIMARY_ORGANIZATION_ID,
                        ),
                        eq(dbSchema.loan.publicId, created.data.publicId),
                    ),
                )
            expect(storedLoan).toEqual({
                firstPaymentDate,
                releaseDate,
                expectedCompletionDate: lastDueDate,
            })
        },
    )

    it('uses the new loan principal for a saved collection profile through quote, create, and release', async () => {
        const profile = await postTestingRequest(
            '/api/settings/formulaProfile/create',
            {
                body: {
                    idempotencyKey: uuidv7(),
                    formulaProfile: {
                        allowRenewalPrincipalChange: true,
                        collectionAmountMinor: 14_000,
                        effectiveDate: '2026-10-01',
                        installmentCount: 60,
                        interestMethod: 'FLAT_PERCENTAGE',
                        interestRateBasisPoints: 2_000,
                        minimumRenewalCompletedInstallments: 30,
                        name: '__TEST-Collection Formula',
                        partialCreditPolicy: 'CARRY_FORWARD',
                        paymentFrequency: 'DAILY',
                        renewalSettlementMethod:
                            'COMPLETED_INSTALLMENT_BALANCE',
                        roundingMode: 'HALF_UP',
                        roundingPrecision: 0,
                        termDays: 60,
                        version: 1,
                    },
                },
                cookie: ownerCookie,
            },
        )
        expect(profile.status).toBe(201)
        const profileJson = await profile.json<
            TApiResponseOk<{
                publicId: string
                collectionAmountMinor: number
            }>
        >()
        expect(profileJson.data.collectionAmountMinor).toBe(14_000)
        const activate = await postTestingRequest(
            `/api/settings/formulaProfile/${profileJson.data.publicId}/activate`,
            {
                body: { isDefault: false },
                cookie: ownerCookie,
            },
        )
        expect(activate.status).toBe(200)
        const product = await postTestingRequest('/api/loans/product/create', {
            body: {
                formulaProfilePublicId: profileJson.data.publicId,
                idempotencyKey: uuidv7(),
                maximumPrincipalMinor: 20_000_00,
                minimumPrincipalMinor: 1_000_00,
                name: '__TEST-Collection Product',
            },
            cookie: ownerCookie,
        })
        expect(product.status).toBe(201)
        const productJson =
            await product.json<TApiResponseOk<{ publicId: string }>>()
        const input = {
            borrowerPublicId,
            firstPaymentDate: '2026-10-10',
            loanProductPublicId: productJson.data.publicId,
            principalMinor: 300_000,
            releaseDate: '2026-10-09',
        }
        const quote = await postTestingRequest('/api/loans/quote', {
            body: input,
            cookie: ownerCookie,
        })
        expect(quote.status).toBe(200)
        const quoted = await quote.json<
            TApiResponseOk<{
                formulaSnapshot: { installmentCount: number; termDays: number }
                installments: { amountDueMinor: number }[]
                installmentAmountMinor: number
                interestAmountMinor: number
                principalMinor: number
                totalPayableMinor: number
            }>
        >()
        expect(quoted.data).toMatchObject({
            formulaSnapshot: { installmentCount: 26, termDays: 26 },
            installmentAmountMinor: 14_000,
            interestAmountMinor: 60_000,
            principalMinor: 300_000,
            totalPayableMinor: 360_000,
        })
        const expectedAmounts = [
            ...Array<number>(25).fill(14_000),
            10_000,
        ]
        expect(
            quoted.data.installments.map(
                (installment) => installment.amountDueMinor,
            ),
        ).toEqual(expectedAmounts)
        const create = await postTestingRequest('/api/loans/create', {
            body: { ...input, idempotencyKey: uuidv7() },
            cookie: ownerCookie,
        })
        expect(create.status).toBe(201)
        const created = await create.json<
            TApiResponseOk<{
                publicId: string
                formulaSnapshot: {
                    installmentCount: number
                    termDays: number
                }
            }>
        >()
        expect(created.data.formulaSnapshot).toMatchObject({
            installmentCount: 26,
            termDays: 26,
        })
        const approve = await postTestingRequest(
            `/api/loans/${created.data.publicId}/approve`,
            { body: {}, cookie: ownerCookie },
        )
        expect(approve.status).toBe(200)
        const release = await postTestingRequest(
            `/api/loans/${created.data.publicId}/release`,
            { body: {}, cookie: ownerCookie },
        )
        expect(release.status).toBe(200)
        const released =
            await release.json<
                TApiResponseOk<{ installments: { amountDueMinor: number }[] }>
            >()
        expect(
            released.data.installments.map(
                (installment) => installment.amountDueMinor,
            ),
        ).toEqual(expectedAmounts)
        const db = dbClient(env.LOANMSBOFC_D1)
        const [stored] = await db
            .select()
            .from(dbSchema.loan)
            .where(
                and(
                    eq(
                        dbSchema.loan.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.loan.publicId, created.data.publicId),
                ),
            )
        expect(stored).toMatchObject({
            installmentCount: 26,
            termDays: 26,
            minCompletedInstallments: 26,
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
        ).toEqual(expectedAmounts)
    })

    it('deletes pending loans regardless of product availability', async () => {
        const createPending = async () => {
            const response = await postTestingRequest('/api/loans/create', {
                body: {
                    borrowerPublicId,
                    firstPaymentDate: '2026-10-10',
                    idempotencyKey: uuidv7(),
                    loanProductPublicId,
                    principalMinor: 5_000_00,
                    releaseDate: '2026-10-09',
                },
                cookie: ownerCookie,
            })
            expect(response.status).toBe(201)
            return (await response.json<TApiResponseOk<{ publicId: string }>>())
                .data.publicId
        }
        const activeProductLoanId = await createPending()
        const inactiveProductLoanId = await createPending()
        const activePath = `/api/loans/${activeProductLoanId}/delete`
        const inactivePath = `/api/loans/${inactiveProductLoanId}/delete`
        const denied = await postTestingRequest(activePath, {
            body: {},
            cookie: memberCookie,
        })
        const releasedDenied = await postTestingRequest(
            `/api/loans/${loanPublicId}/delete`,
            { body: {}, cookie: ownerCookie },
        )
        expect(denied.status).toBe(403)
        expect(releasedDenied.status).toBe(409)

        const activeDeleted = await postTestingRequest(activePath, {
            body: {},
            cookie: ownerCookie,
        })
        expect(activeDeleted.status).toBe(200)
        expect(activeDeleted.headers.get('audit-event-recorded')).toBe('true')

        const db = dbClient(env.LOANMSBOFC_D1)
        await db
            .update(dbSchema.loanProduct)
            .set({ isActive: false })
            .where(eq(dbSchema.loanProduct.publicId, loanProductPublicId))
        try {
            const inactiveDeleted = await postTestingRequest(inactivePath, {
                body: {},
                cookie: ownerCookie,
            })
            expect(inactiveDeleted.status).toBe(200)
        } finally {
            await db
                .update(dbSchema.loanProduct)
                .set({ isActive: true })
                .where(eq(dbSchema.loanProduct.publicId, loanProductPublicId))
        }
        const repeated = await postTestingRequest(activePath, {
            body: {},
            cookie: ownerCookie,
        })
        expect(repeated.status).toBe(404)
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
