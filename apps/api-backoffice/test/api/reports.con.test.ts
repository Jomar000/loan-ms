import type { TApiResponseOk } from '@loanms/types/shared'
import { v7 as uuidv7 } from 'uuid'
import { beforeAll, describe, expect, it } from 'vitest'

import { postTestingRequest, seedTestingCookies } from '../utilities.js'
import { traceQueryRequest } from './queryPerformance.shared.js'

let ownerCookie: string

beforeAll(async () => {
    ;[ownerCookie] = await seedTestingCookies()
    const setup = await postTestingRequest('/api/companyFund/setup', {
        body: {
            fundName: '__TEST Report Fund',
            idempotencyKey: uuidv7(),
            openingCapitalMinor: 100_000,
            transactionDate: '2026-11-01',
        },
        cookie: ownerCookie,
    })
    expect(setup.status).toBe(201)
    const injection = await postTestingRequest(
        '/api/companyFund/capitalInjection',
        {
            body: {
                amountMinor: 20_000,
                idempotencyKey: uuidv7(),
                reason: '__TEST report injection',
                transactionDate: '2026-11-02',
            },
            cookie: ownerCookie,
        },
    )
    expect(injection.status).toBe(201)
    const expense = await postTestingRequest(
        '/api/companyFund/manualTransaction',
        {
            body: {
                amountMinor: 5_000,
                direction: 'OUT',
                idempotencyKey: uuidv7(),
                reason: '__TEST report expense',
                transactionDate: '2026-11-03',
                transactionType: 'EXPENSE',
            },
            cookie: ownerCookie,
        },
    )
    expect(expense.status).toBe(201)
})

describe('Report aggregates', () => {
    it.each([
        {
            filters: {},
            cashIn: 120_000,
            expenses: 5_000,
            days: [
                '2026-11-03',
                '2026-11-02',
                '2026-11-01',
            ],
        },
        {
            filters: { dateFrom: '2026-11-02' },
            cashIn: 20_000,
            expenses: 5_000,
            days: [
                '2026-11-03',
                '2026-11-02',
            ],
        },
        {
            filters: { dateTo: '2026-11-01' },
            cashIn: 100_000,
            expenses: 0,
            days: ['2026-11-01'],
        },
        {
            filters: { dateFrom: '2026-11-02', dateTo: '2026-11-02' },
            cashIn: 20_000,
            expenses: 0,
            days: ['2026-11-02'],
        },
    ])(
        'keeps summary and series consistent for $filters with one ledger scan',
        async ({ filters, cashIn, expenses, days }) => {
            const summary = await traceQueryRequest(
                '/api/reports/summary',
                { filters },
                ownerCookie,
            )
            expect(summary.response.status).toBe(200)
            const result =
                await summary.response.json<
                    TApiResponseOk<Record<string, number>>
                >()
            expect(result.data).toMatchObject({
                periodCashInMinor: cashIn,
                periodCashOutMinor: expenses,
                periodExpensesMinor: expenses,
                periodNetEarningsMinor: 0 - expenses,
                currentActiveLoanCount: 0,
                currentOutstandingReceivableMinor: 0,
            })
            expect(
                summary.statements.filter((query) =>
                    /from "capital_transaction"/i.test(query),
                ),
            ).toHaveLength(1)
            expect(
                summary.statements.filter((query) =>
                    /from "(?:capital_transaction|loan|loan_installment)"/i.test(
                        query,
                    ),
                ),
            ).toHaveLength(3)

            for (const report of [
                'collections',
                'renewals',
            ]) {
                const aggregate = await traceQueryRequest(
                    `/api/reports/${report}`,
                    { filters },
                    ownerCookie,
                )
                expect(aggregate.response.status).toBe(200)
                const values = (
                    await aggregate.response.json<
                        TApiResponseOk<Record<string, number>>
                    >()
                ).data
                expect(
                    Object.values(values).every((value) => value === 0),
                ).toBe(true)
            }

            for (const period of [
                'daily',
                'monthly',
            ]) {
                const series = await traceQueryRequest(
                    `/api/reports/${period}`,
                    { filters },
                    ownerCookie,
                )
                expect(series.response.status).toBe(200)
                const rows = (
                    await series.response.json<
                        TApiResponseOk<
                            {
                                period: string
                                cashInMinor: number
                                expensesMinor: number
                            }[]
                        >
                    >()
                ).data
                expect(rows.map((row) => row.period)).toEqual(
                    period === 'daily' ? days : ['2026-11'],
                )
                expect(
                    rows.reduce((total, row) => total + row.cashInMinor, 0),
                ).toBe(cashIn)
                expect(
                    rows.reduce((total, row) => total + row.expensesMinor, 0),
                ).toBe(expenses)
            }
        },
    )
})
