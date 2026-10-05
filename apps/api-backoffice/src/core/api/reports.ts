import * as reportValidator from '@loanms/validator/backoffice/report'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import type { THonoInstance } from '../../types.js'
import {
    apiResponseOkWrapper,
    getActiveOrganizationId,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'
const tenantGuard = isTenantAuthenticated()
const startOfManilaDate = (value: string | undefined) =>
    value ? new Date(`${value}T00:00:00+08:00`).getTime() : null
const endOfManilaDate = (value: string | undefined) =>
    value ? new Date(`${value}T23:59:59.999+08:00`).getTime() : null
const currentManilaDate = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Asia/Manila',
        year: 'numeric',
    }).formatToParts(new Date())
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((entry) => entry.type === type)!.value
    return `${part('year')}-${part('month')}-${part('day')}`
}
async function readLedgerSeries(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: { filters: { dateFrom?: string; dateTo?: string } },
    groupBy: 'day' | 'month',
) {
    const from = startOfManilaDate(input.filters.dateFrom)
    const to = endOfManilaDate(input.filters.dateTo)
    const periodExpression =
        groupBy === 'day'
            ? "strftime('%Y-%m-%d', transaction_at / 1000, 'unixepoch', '+8 hours')"
            : "strftime('%Y-%m', transaction_at / 1000, 'unixepoch', '+8 hours')"
    const rows = await ctx
        .get('dbClient')
        .$client.prepare(
            `SELECT ${periodExpression} AS period,
                    COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_minor ELSE 0 END), 0) AS cash_in_minor,
                    COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount_minor ELSE 0 END), 0) AS cash_out_minor,
                    COALESCE(SUM(CASE WHEN transaction_type IN ('PRINCIPAL_COLLECTION', 'RENEWAL_SETTLEMENT_PRINCIPAL') THEN amount_minor ELSE 0 END), 0) AS principal_collected_minor,
                    COALESCE(SUM(CASE WHEN transaction_type IN ('INTEREST_COLLECTION', 'RENEWAL_SETTLEMENT_INTEREST') THEN amount_minor ELSE 0 END), 0) AS interest_collected_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount_minor ELSE 0 END), 0) AS expenses_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'WRITE_OFF' THEN amount_minor ELSE 0 END), 0) AS write_offs_minor
               FROM capital_transaction
              WHERE organization_id = ?
                AND (? IS NULL OR transaction_at >= ?)
                AND (? IS NULL OR transaction_at <= ?)
              GROUP BY period
              ORDER BY period DESC`,
        )
        .bind(getActiveOrganizationId(ctx), from, from, to, to)
        .all<{
            cash_in_minor: number
            cash_out_minor: number
            expenses_minor: number
            interest_collected_minor: number
            period: string
            principal_collected_minor: number
            write_offs_minor: number
        }>()
    return rows.results.map(
        (row: {
            cash_in_minor: number
            cash_out_minor: number
            expenses_minor: number
            interest_collected_minor: number
            period: string
            principal_collected_minor: number
            write_offs_minor: number
        }) => ({
            cashInMinor: row.cash_in_minor,
            cashOutMinor: row.cash_out_minor,
            expensesMinor: row.expenses_minor,
            interestCollectedMinor: row.interest_collected_minor,
            netEarningsMinor:
                row.interest_collected_minor -
                row.expenses_minor -
                row.write_offs_minor,
            period: row.period,
            principalCollectedMinor: row.principal_collected_minor,
            writeOffsMinor: row.write_offs_minor,
        }),
    )
}
export const reportsRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/summary',
        tenantGuard,
        validateRequest('json', reportValidator.reportReadInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const from = startOfManilaDate(input.filters.dateFrom)
            const to = endOfManilaDate(input.filters.dateTo)
            const database = ctx.get('dbClient').$client
            const ledger = await database
                .prepare(
                    `SELECT
                    COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_minor ELSE 0 END), 0) AS cash_in_minor,
                    COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount_minor ELSE 0 END), 0) AS cash_out_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount_minor ELSE 0 END), 0) AS expenses_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'WRITE_OFF' THEN amount_minor ELSE 0 END), 0) AS write_offs_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'LOAN_PRINCIPAL_RELEASE' THEN amount_minor ELSE 0 END), 0) AS loan_released_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'REFUND' THEN amount_minor ELSE 0 END), 0) AS refunded_minor
                 FROM capital_transaction
                 WHERE organization_id = ?
                   AND (? IS NULL OR transaction_at >= ?)
                   AND (? IS NULL OR transaction_at <= ?)`,
                )
                .bind(organizationId, from, from, to, to)
                .first<{
                    cash_in_minor: number
                    cash_out_minor: number
                    expenses_minor: number
                    loan_released_minor: number
                    refunded_minor: number
                    write_offs_minor: number
                }>()
            const collections = await database
                .prepare(
                    `SELECT
                    COALESCE(SUM(CASE WHEN transaction_type IN ('PRINCIPAL_COLLECTION', 'RENEWAL_SETTLEMENT_PRINCIPAL') THEN amount_minor ELSE 0 END), 0) AS principal_collected_minor,
                    COALESCE(SUM(CASE WHEN transaction_type IN ('INTEREST_COLLECTION', 'RENEWAL_SETTLEMENT_INTEREST') THEN amount_minor ELSE 0 END), 0) AS interest_collected_minor,
                    COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_RELEASE' THEN amount_minor ELSE 0 END), 0) AS renewal_released_minor
                 FROM capital_transaction
                 WHERE organization_id = ?
                   AND (? IS NULL OR transaction_at >= ?)
                   AND (? IS NULL OR transaction_at <= ?)`,
                )
                .bind(organizationId, from, from, to, to)
                .first<{
                    interest_collected_minor: number
                    principal_collected_minor: number
                    renewal_released_minor: number
                }>()
            const portfolio = await database
                .prepare(
                    `SELECT
                    COUNT(*) AS active_loan_count,
                    COALESCE(SUM(principal_amount_minor), 0) AS active_principal_minor,
                    COALESCE(SUM(actual_outstanding_balance_minor), 0) AS outstanding_receivable_minor
                 FROM loan
                 WHERE organization_id = ? AND status IN ('ACTIVE', 'OVERDUE')`,
                )
                .bind(organizationId)
                .first<{
                    active_loan_count: number
                    active_principal_minor: number
                    outstanding_receivable_minor: number
                }>()
            const overdue = await database
                .prepare(
                    `SELECT COALESCE(SUM(amount_due_minor - amount_paid_minor), 0) AS overdue_amount_minor,
                        COUNT(DISTINCT loan_id) AS overdue_loan_count
                 FROM loan_installment
                 WHERE organization_id = ?
                   AND due_date < strftime('%Y-%m-%d', 'now', '+8 hours')
                   AND amount_paid_minor < amount_due_minor`,
                )
                .bind(organizationId)
                .first<{
                    overdue_amount_minor: number
                    overdue_loan_count: number
                }>()
            return apiResponseOkWrapper(ctx, {
                data: {
                    // Current-state portfolio metrics are intentionally not
                    // backdated by period filters. The explicitly named fields
                    // keep them distinct from transaction-period totals.
                    activeLoanCount: portfolio?.active_loan_count ?? 0,
                    activePrincipalMinor:
                        portfolio?.active_principal_minor ?? 0,
                    cashInMinor: ledger?.cash_in_minor ?? 0,
                    cashOutMinor: ledger?.cash_out_minor ?? 0,
                    currentActiveLoanCount: portfolio?.active_loan_count ?? 0,
                    currentActivePrincipalMinor:
                        portfolio?.active_principal_minor ?? 0,
                    currentAsOfDate: currentManilaDate(),
                    currentOverdueAmountMinor:
                        overdue?.overdue_amount_minor ?? 0,
                    currentOverdueLoanCount: overdue?.overdue_loan_count ?? 0,
                    currentOutstandingReceivableMinor:
                        portfolio?.outstanding_receivable_minor ?? 0,
                    interestCollectedMinor:
                        collections?.interest_collected_minor ?? 0,
                    netEarningsMinor:
                        (collections?.interest_collected_minor ?? 0) -
                        (ledger?.expenses_minor ?? 0) -
                        (ledger?.write_offs_minor ?? 0),
                    overdueAmountMinor: overdue?.overdue_amount_minor ?? 0,
                    overdueLoanCount: overdue?.overdue_loan_count ?? 0,
                    outstandingReceivableMinor:
                        portfolio?.outstanding_receivable_minor ?? 0,
                    periodCashInMinor: ledger?.cash_in_minor ?? 0,
                    periodCashOutMinor: ledger?.cash_out_minor ?? 0,
                    periodDateFrom: input.filters.dateFrom ?? null,
                    periodDateTo: input.filters.dateTo ?? null,
                    periodInterestCollectedMinor:
                        collections?.interest_collected_minor ?? 0,
                    periodExpensesMinor: ledger?.expenses_minor ?? 0,
                    periodLoanReleasedMinor: ledger?.loan_released_minor ?? 0,
                    periodNetEarningsMinor:
                        (collections?.interest_collected_minor ?? 0) -
                        (ledger?.expenses_minor ?? 0) -
                        (ledger?.write_offs_minor ?? 0),
                    periodPrincipalCollectedMinor:
                        collections?.principal_collected_minor ?? 0,
                    periodRefundedMinor: ledger?.refunded_minor ?? 0,
                    periodRenewalReleasedMinor:
                        collections?.renewal_released_minor ?? 0,
                    periodWriteOffsMinor: ledger?.write_offs_minor ?? 0,
                    principalCollectedMinor:
                        collections?.principal_collected_minor ?? 0,
                    renewalReleasedMinor:
                        collections?.renewal_released_minor ?? 0,
                },
            })
        },
    )
    .on(
        'QUERY',
        '/daily',
        tenantGuard,
        validateRequest('json', reportValidator.reportReadInputSchema),
        async (ctx) =>
            apiResponseOkWrapper(ctx, {
                data: await readLedgerSeries(ctx, ctx.req.valid('json'), 'day'),
            }),
    )
    .on(
        'QUERY',
        '/monthly',
        tenantGuard,
        validateRequest('json', reportValidator.reportReadInputSchema),
        async (ctx) =>
            apiResponseOkWrapper(ctx, {
                data: await readLedgerSeries(
                    ctx,
                    ctx.req.valid('json'),
                    'month',
                ),
            }),
    )
    .on(
        'QUERY',
        '/portfolio',
        tenantGuard,
        validateRequest('json', reportValidator.reportReadInputSchema),
        async (ctx) => {
            const rows = await ctx
                .get('dbClient')
                .$client.prepare(
                    `SELECT status,
                            COUNT(*) AS loan_count,
                            COALESCE(SUM(principal_amount_minor), 0) AS principal_minor,
                            COALESCE(SUM(actual_outstanding_balance_minor), 0) AS outstanding_minor
                       FROM loan
                      WHERE organization_id = ?
                      GROUP BY status
                      ORDER BY status`,
                )
                .bind(getActiveOrganizationId(ctx))
                .all<{
                    loan_count: number
                    outstanding_minor: number
                    principal_minor: number
                    status: string
                }>()
            return apiResponseOkWrapper(ctx, {
                data: rows.results.map(
                    (row: {
                        loan_count: number
                        outstanding_minor: number
                        principal_minor: number
                        status: string
                    }) => ({
                        loanCount: row.loan_count,
                        outstandingMinor: row.outstanding_minor,
                        principalMinor: row.principal_minor,
                        status: row.status,
                    }),
                ),
            })
        },
    )
    .on(
        'QUERY',
        '/collections',
        tenantGuard,
        validateRequest('json', reportValidator.reportReadInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const from = startOfManilaDate(input.filters.dateFrom)
            const to = endOfManilaDate(input.filters.dateTo)
            const row = await ctx
                .get('dbClient')
                .$client.prepare(
                    `SELECT COUNT(DISTINCT payment_id) AS payment_count,
                            COALESCE(SUM(CASE WHEN transaction_type = 'PRINCIPAL_COLLECTION' THEN amount_minor ELSE 0 END), 0) AS principal_collected_minor,
                            COALESCE(SUM(CASE WHEN transaction_type = 'INTEREST_COLLECTION' THEN amount_minor ELSE 0 END), 0) AS interest_collected_minor
                       FROM capital_transaction
                      WHERE organization_id = ?
                        AND transaction_type IN ('PRINCIPAL_COLLECTION', 'INTEREST_COLLECTION')
                        AND (? IS NULL OR transaction_at >= ?)
                        AND (? IS NULL OR transaction_at <= ?)`,
                )
                .bind(getActiveOrganizationId(ctx), from, from, to, to)
                .first<{
                    interest_collected_minor: number
                    payment_count: number
                    principal_collected_minor: number
                }>()
            return apiResponseOkWrapper(ctx, {
                data: {
                    interestCollectedMinor: row?.interest_collected_minor ?? 0,
                    paymentCount: row?.payment_count ?? 0,
                    principalCollectedMinor:
                        row?.principal_collected_minor ?? 0,
                },
            })
        },
    )
    .on(
        'QUERY',
        '/renewals',
        tenantGuard,
        validateRequest('json', reportValidator.reportReadInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const from = startOfManilaDate(input.filters.dateFrom)
            const to = endOfManilaDate(input.filters.dateTo)
            const row = await ctx
                .get('dbClient')
                .$client.prepare(
                    `SELECT COUNT(DISTINCT loan_renewal_id) AS renewal_count,
                            COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_RELEASE' THEN amount_minor ELSE 0 END), 0) AS released_minor,
                            COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_SETTLEMENT_PRINCIPAL' THEN amount_minor ELSE 0 END), 0) AS principal_settled_minor,
                            COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_SETTLEMENT_INTEREST' THEN amount_minor ELSE 0 END), 0) AS interest_settled_minor
                       FROM capital_transaction
                      WHERE organization_id = ?
                        AND loan_renewal_id IS NOT NULL
                        AND (? IS NULL OR transaction_at >= ?)
                        AND (? IS NULL OR transaction_at <= ?)`,
                )
                .bind(getActiveOrganizationId(ctx), from, from, to, to)
                .first<{
                    interest_settled_minor: number
                    principal_settled_minor: number
                    released_minor: number
                    renewal_count: number
                }>()
            return apiResponseOkWrapper(ctx, {
                data: {
                    interestSettledMinor: row?.interest_settled_minor ?? 0,
                    principalSettledMinor: row?.principal_settled_minor ?? 0,
                    releasedMinor: row?.released_minor ?? 0,
                    renewalCount: row?.renewal_count ?? 0,
                },
            })
        },
    )
export default reportsRoute
export type ReportsRouteType = ApplyGlobalResponse<
    typeof reportsRoute,
    import('../../types.js').TGlobalApiResponses
>
