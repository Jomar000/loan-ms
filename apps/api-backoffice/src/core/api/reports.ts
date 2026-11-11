import * as reportValidator from '@loanms/validator/backoffice/report'
import { and, count, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
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
function ledgerPeriodFilter(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    filters: { dateFrom?: string; dateTo?: string },
) {
    const from = startOfManilaDate(filters.dateFrom)
    const to = endOfManilaDate(filters.dateTo)
    const conditions = ['organization_id = ?']
    const parameters: (number | string)[] = [getActiveOrganizationId(ctx)]
    if (from !== null) {
        conditions.push('transaction_at >= ?')
        parameters.push(from)
    }
    if (to !== null) {
        conditions.push('transaction_at <= ?')
        parameters.push(to)
    }
    return { conditions, parameters }
}
async function readLedgerSeries(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: { filters: { dateFrom?: string; dateTo?: string } },
    groupBy: 'day' | 'month',
) {
    const { conditions, parameters } = ledgerPeriodFilter(ctx, input.filters)
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
              WHERE ${conditions.join(' AND ')}
              GROUP BY period
              ORDER BY period DESC`,
        )
        .bind(...parameters)
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
            const { capitalTransaction, loan, loanInstallment } =
                ctx.get('dbSchema')
            const [
                [ledger],
                [portfolio],
                [overdue],
            ] = await ctx.get('dbClient').batch([
                ctx
                    .get('dbClient')
                    .select({
                        cash_in_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.direction} = 'IN' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        cash_out_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.direction} = 'OUT' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        expenses_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} = 'EXPENSE' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        write_offs_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} = 'WRITE_OFF' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        loan_released_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} = 'LOAN_PRINCIPAL_RELEASE' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        refunded_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} = 'REFUND' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        principal_collected_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} IN ('PRINCIPAL_COLLECTION', 'RENEWAL_SETTLEMENT_PRINCIPAL') THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        interest_collected_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} IN ('INTEREST_COLLECTION', 'RENEWAL_SETTLEMENT_INTEREST') THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                        renewal_released_minor: sql<number>`COALESCE(SUM(CASE WHEN ${capitalTransaction.transactionType} = 'RENEWAL_RELEASE' THEN ${capitalTransaction.amountMinor} ELSE 0 END), 0)`,
                    })
                    .from(capitalTransaction)
                    .where(
                        and(
                            eq(
                                capitalTransaction.organizationId,
                                organizationId,
                            ),
                            ...(from === null
                                ? []
                                : [
                                      gte(
                                          capitalTransaction.transactionAt,
                                          new Date(from),
                                      ),
                                  ]),
                            ...(to === null
                                ? []
                                : [
                                      lte(
                                          capitalTransaction.transactionAt,
                                          new Date(to),
                                      ),
                                  ]),
                        ),
                    ),
                ctx
                    .get('dbClient')
                    .select({
                        active_loan_count: count(),
                        active_principal_minor: sql<number>`COALESCE(SUM(${loan.principalAmountMinor}), 0)`,
                        outstanding_receivable_minor: sql<number>`COALESCE(SUM(${loan.actualOutstandingBalanceMinor}), 0)`,
                    })
                    .from(loan)
                    .where(
                        and(
                            eq(loan.organizationId, organizationId),
                            inArray(loan.status, [
                                'ACTIVE',
                                'OVERDUE',
                            ]),
                        ),
                    ),
                ctx
                    .get('dbClient')
                    .select({
                        overdue_amount_minor: sql<number>`COALESCE(SUM(${loanInstallment.amountDueMinor} - ${loanInstallment.amountPaidMinor}), 0)`,
                        overdue_loan_count: sql<number>`COUNT(DISTINCT ${loanInstallment.loanId})`,
                    })
                    .from(loanInstallment)
                    .where(
                        and(
                            eq(loanInstallment.organizationId, organizationId),
                            lt(loanInstallment.dueDate, currentManilaDate()),
                            lt(
                                loanInstallment.amountPaidMinor,
                                loanInstallment.amountDueMinor,
                            ),
                        ),
                    ),
            ])
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
                        ledger?.interest_collected_minor ?? 0,
                    netEarningsMinor:
                        (ledger?.interest_collected_minor ?? 0) -
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
                        ledger?.interest_collected_minor ?? 0,
                    periodExpensesMinor: ledger?.expenses_minor ?? 0,
                    periodLoanReleasedMinor: ledger?.loan_released_minor ?? 0,
                    periodNetEarningsMinor:
                        (ledger?.interest_collected_minor ?? 0) -
                        (ledger?.expenses_minor ?? 0) -
                        (ledger?.write_offs_minor ?? 0),
                    periodPrincipalCollectedMinor:
                        ledger?.principal_collected_minor ?? 0,
                    periodRefundedMinor: ledger?.refunded_minor ?? 0,
                    periodRenewalReleasedMinor:
                        ledger?.renewal_released_minor ?? 0,
                    periodWriteOffsMinor: ledger?.write_offs_minor ?? 0,
                    principalCollectedMinor:
                        ledger?.principal_collected_minor ?? 0,
                    renewalReleasedMinor: ledger?.renewal_released_minor ?? 0,
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
            const { conditions, parameters } = ledgerPeriodFilter(
                ctx,
                input.filters,
            )
            const row = await ctx
                .get('dbClient')
                .$client.prepare(
                    `SELECT COUNT(DISTINCT payment_id) AS payment_count,
                            COALESCE(SUM(CASE WHEN transaction_type = 'PRINCIPAL_COLLECTION' THEN amount_minor ELSE 0 END), 0) AS principal_collected_minor,
                            COALESCE(SUM(CASE WHEN transaction_type = 'INTEREST_COLLECTION' THEN amount_minor ELSE 0 END), 0) AS interest_collected_minor
                       FROM capital_transaction
                      WHERE ${conditions.join(' AND ')}
                        AND transaction_type IN ('PRINCIPAL_COLLECTION', 'INTEREST_COLLECTION')`,
                )
                .bind(...parameters)
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
            const { conditions, parameters } = ledgerPeriodFilter(
                ctx,
                input.filters,
            )
            const row = await ctx
                .get('dbClient')
                .$client.prepare(
                    `SELECT COUNT(DISTINCT loan_renewal_id) AS renewal_count,
                            COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_RELEASE' THEN amount_minor ELSE 0 END), 0) AS released_minor,
                            COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_SETTLEMENT_PRINCIPAL' THEN amount_minor ELSE 0 END), 0) AS principal_settled_minor,
                            COALESCE(SUM(CASE WHEN transaction_type = 'RENEWAL_SETTLEMENT_INTEREST' THEN amount_minor ELSE 0 END), 0) AS interest_settled_minor
                       FROM capital_transaction
                      WHERE ${conditions.join(' AND ')}
                        AND loan_renewal_id IS NOT NULL`,
                )
                .bind(...parameters)
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
