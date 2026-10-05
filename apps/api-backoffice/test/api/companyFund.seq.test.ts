import type { TApiResponseOk } from '@loanms/types/shared'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import {
    getTestingRequest,
    postTestingRequest,
    queryTestingRequest,
    seedTestingCookies,
} from '../utilities.js'

let memberCookie: string
let ownerCookie: string

describe('Company fund API', () => {
    beforeAll(async () => {
        ;[
            ownerCookie,
            memberCookie,
        ] = await seedTestingCookies()
    })

    it('records opening capital and reconciles idempotent capital movements without counting returned principal as earnings', async () => {
        const setupKey = uuidv7()
        const setup = await postTestingRequest('/api/companyFund/setup', {
            body: {
                fundName: '__TEST Primary Fund',
                idempotencyKey: setupKey,
                openingCapitalMinor: 50_000_00,
                transactionDate: '2026-10-04',
            },
            cookie: ownerCookie,
        })
        expect(setup.status).toBe(201)
        const setupJson =
            await setup.json<
                TApiResponseOk<{ openingTransaction: { publicId: string } }>
            >()
        expect(setupJson.data.openingTransaction.publicId).toMatch(
            /^[0-9a-f-]{36}$/,
        )

        const replay = await postTestingRequest('/api/companyFund/setup', {
            body: {
                fundName: '__TEST Primary Fund',
                idempotencyKey: setupKey,
                openingCapitalMinor: 50_000_00,
                transactionDate: '2026-10-04',
            },
            cookie: ownerCookie,
        })
        expect(replay.status).toBe(200)

        const injection = await postTestingRequest(
            '/api/companyFund/capitalInjection',
            {
                body: {
                    amountMinor: 5_000_00,
                    idempotencyKey: uuidv7(),
                    reason: '__TEST capital injection',
                    transactionDate: '2026-10-04',
                },
                cookie: ownerCookie,
            },
        )
        expect(injection.status).toBe(201)

        const forbidden = await postTestingRequest(
            '/api/companyFund/capitalWithdrawal',
            {
                body: {
                    amountMinor: 1_000_00,
                    idempotencyKey: uuidv7(),
                    reason: '__TEST withdrawal',
                    transactionDate: '2026-10-04',
                },
                cookie: memberCookie,
            },
        )
        expect(forbidden.status).toBe(403)

        const withdrawal = await postTestingRequest(
            '/api/companyFund/capitalWithdrawal',
            {
                body: {
                    amountMinor: 1_000_00,
                    idempotencyKey: uuidv7(),
                    reason: '__TEST withdrawal',
                    transactionDate: '2026-10-04',
                },
                cookie: ownerCookie,
            },
        )
        expect(withdrawal.status).toBe(201)

        const summary = await getTestingRequest('/api/companyFund/summary', {
            cookie: ownerCookie,
        })
        const summaryJson = await summary.json<
            TApiResponseOk<{
                availableCashMinor: number
                interestCollectedMinor: number
            }>
        >()
        expect(summary.status).toBe(200)
        expect(summaryJson.data.availableCashMinor).toBe(54_000_00)
        expect(summaryJson.data.interestCollectedMinor).toBe(0)

        const expenseKey = uuidv7()
        const expenseBody = {
            amountMinor: 1_000_00,
            direction: 'OUT',
            idempotencyKey: expenseKey,
            reason: '__TEST operating expense',
            transactionDate: '2026-10-04',
            transactionType: 'EXPENSE',
        }
        const expense = await postTestingRequest(
            '/api/companyFund/manualTransaction',
            { body: expenseBody, cookie: ownerCookie },
        )
        expect(expense.status).toBe(201)
        const expenseReplay = await postTestingRequest(
            '/api/companyFund/manualTransaction',
            { body: expenseBody, cookie: ownerCookie },
        )
        expect(expenseReplay.status).toBe(201)

        const writeOff = await postTestingRequest(
            '/api/companyFund/manualTransaction',
            {
                body: {
                    amountMinor: 500_00,
                    direction: 'OUT',
                    idempotencyKey: uuidv7(),
                    reason: '__TEST approved write-off',
                    transactionDate: '2026-10-04',
                    transactionType: 'WRITE_OFF',
                },
                cookie: ownerCookie,
            },
        )
        expect(writeOff.status).toBe(201)

        const adjustment = await postTestingRequest(
            '/api/companyFund/manualTransaction',
            {
                body: {
                    amountMinor: 250_00,
                    direction: 'IN',
                    idempotencyKey: uuidv7(),
                    reason: '__TEST audited cash adjustment',
                    transactionDate: '2026-10-04',
                    transactionType: 'ADJUSTMENT',
                },
                cookie: ownerCookie,
            },
        )
        expect(adjustment.status).toBe(201)

        const manualForbidden = await postTestingRequest(
            '/api/companyFund/manualTransaction',
            {
                body: {
                    amountMinor: 100,
                    direction: 'OUT',
                    idempotencyKey: uuidv7(),
                    reason: '__TEST forbidden expense',
                    transactionDate: '2026-10-04',
                    transactionType: 'EXPENSE',
                },
                cookie: memberCookie,
            },
        )
        expect(manualForbidden.status).toBe(403)

        const summaryAfterManualEntries = await getTestingRequest(
            '/api/companyFund/summary',
            { cookie: ownerCookie },
        )
        const manualSummaryJson = await summaryAfterManualEntries.json<
            TApiResponseOk<{
                availableCashMinor: number
                expensesMinor: number
                netEarningsMinor: number
                writeOffsMinor: number
            }>
        >()
        expect(manualSummaryJson.data).toMatchObject({
            availableCashMinor: 52_750_00,
            expensesMinor: 1_000_00,
            netEarningsMinor: -1_500_00,
            writeOffsMinor: 500_00,
        })

        const [
            dailyReport,
            monthlyReport,
            collectionReport,
            renewalReport,
        ] = await Promise.all([
            queryTestingRequest(
                '/api/reports/daily',
                {
                    filters: {
                        dateFrom: '2026-10-04',
                        dateTo: '2026-10-04',
                    },
                },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/reports/monthly',
                { filters: {} },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/reports/collections',
                { filters: {} },
                { cookie: ownerCookie },
            ),
            queryTestingRequest(
                '/api/reports/renewals',
                { filters: {} },
                { cookie: ownerCookie },
            ),
        ])
        expect([
            dailyReport.status,
            monthlyReport.status,
            collectionReport.status,
            renewalReport.status,
        ]).toEqual([
            200,
            200,
            200,
            200,
        ])
        const dailyJson = await dailyReport.json<
            TApiResponseOk<
                {
                    cashInMinor: number
                    cashOutMinor: number
                    netEarningsMinor: number
                    period: string
                }[]
            >
        >()
        expect(dailyJson.data).toContainEqual(
            expect.objectContaining({
                cashInMinor: 55_250_00,
                cashOutMinor: 2_500_00,
                netEarningsMinor: -1_500_00,
                period: '2026-10-04',
            }),
        )

        const concurrentWithdrawals = await Promise.all([
            postTestingRequest('/api/companyFund/capitalWithdrawal', {
                body: {
                    amountMinor: 40_000_00,
                    idempotencyKey: uuidv7(),
                    reason: '__TEST concurrent withdrawal one',
                    transactionDate: '2026-10-04',
                },
                cookie: ownerCookie,
            }),
            postTestingRequest('/api/companyFund/capitalWithdrawal', {
                body: {
                    amountMinor: 40_000_00,
                    idempotencyKey: uuidv7(),
                    reason: '__TEST concurrent withdrawal two',
                    transactionDate: '2026-10-04',
                },
                cookie: ownerCookie,
            }),
        ])
        expect(
            concurrentWithdrawals.map((response) => response.status).sort(),
        ).toEqual([
            201,
            409,
        ])

        const ledger = await queryTestingRequest(
            '/api/companyFund/transactions',
            { filters: {} },
            { cookie: ownerCookie },
        )
        const ledgerJson = await ledger.json<
            TApiResponseOk<
                {
                    amountMinor: number
                    transactionType: string
                }[]
            >
        >()
        expect(ledger.status).toBe(200)
        expect(ledgerJson.data).toHaveLength(7)
        expect(ledgerJson.data.map((entry) => entry.transactionType)).toEqual(
            expect.arrayContaining([
                'OPENING_CAPITAL',
                'CAPITAL_INJECTION',
                'CAPITAL_WITHDRAWAL',
                'EXPENSE',
                'WRITE_OFF',
                'ADJUSTMENT',
            ]),
        )
    })
})
