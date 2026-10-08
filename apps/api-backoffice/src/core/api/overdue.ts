import * as reportValidator from '@loanms/validator/backoffice/report'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { THonoInstance } from '../../types.js'
import {
    apiResponsePaginatedOkWrapper,
    getActiveOrganizationId,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'

const tenantGuard = isTenantAuthenticated()

export const overdueRoute = new Hono<THonoInstance>().on(
    'QUERY',
    '/readMany',
    tenantGuard,
    validateRequest('json', reportValidator.overdueReadManyInputSchema),
    async (ctx) => {
        const input = ctx.req.valid('json')
        const organizationId = getActiveOrganizationId(ctx)
        const { borrowerPublicId, maxDaysLate, minDaysLate } = input.filters
        const database = ctx.get('dbClient').$client
        const overdueQuery = `
            SELECT borrower.public_id AS borrower_public_id,
                   borrower.normalized_full_name AS borrower_name,
                   loan.public_id AS loan_public_id,
                   loan.loan_number AS loan_number,
                   MIN(loan_installment.due_date) AS oldest_due_date,
                   CAST(julianday(strftime('%Y-%m-%d', 'now', '+8 hours')) - julianday(MIN(loan_installment.due_date)) AS INTEGER) AS days_late,
                   SUM(loan_installment.amount_due_minor - loan_installment.amount_paid_minor) AS overdue_amount_minor
              FROM loan_installment
              INNER JOIN loan ON loan.organization_id = loan_installment.organization_id AND loan.id = loan_installment.loan_id
              INNER JOIN borrower ON borrower.organization_id = loan.organization_id AND borrower.id = loan.borrower_id
             WHERE loan_installment.organization_id = ?
               AND loan.status IN ('ACTIVE', 'OVERDUE')
               AND loan_installment.due_date < strftime('%Y-%m-%d', 'now', '+8 hours')
               AND loan_installment.amount_paid_minor < loan_installment.amount_due_minor
               AND (? IS NULL OR borrower.public_id = ?)
             GROUP BY loan.id
            HAVING (? IS NULL OR days_late >= ?)
               AND (? IS NULL OR days_late <= ?)`
        const bindings = [
            organizationId,
            borrowerPublicId ?? null,
            borrowerPublicId ?? null,
            minDaysLate ?? null,
            minDaysLate ?? null,
            maxDaysLate ?? null,
            maxDaysLate ?? null,
        ]
        const [
            countRow,
            rows,
        ] = await Promise.all([
            database
                .prepare(`SELECT COUNT(*) AS count FROM (${overdueQuery})`)
                .bind(...bindings)
                .first<{ count: number }>(),
            database
                .prepare(
                    `${overdueQuery}
                     ORDER BY oldest_due_date ${input.sortOrder === 'asc' ? 'ASC' : 'DESC'}, loan_public_id ASC
                     LIMIT ? OFFSET ?`,
                )
                .bind(...bindings, input.limit, input.offset)
                .all<{
                    borrower_name: string
                    borrower_public_id: string
                    days_late: number
                    loan_number: string
                    loan_public_id: string
                    oldest_due_date: string
                    overdue_amount_minor: number
                }>(),
        ])
        const data = rows.results.map(
            (row: {
                borrower_name: string
                borrower_public_id: string
                days_late: number
                loan_number: string
                loan_public_id: string
                oldest_due_date: string
                overdue_amount_minor: number
            }) => ({
                borrowerName: row.borrower_name,
                borrowerPublicId: row.borrower_public_id,
                daysLate: row.days_late,
                loanNumber: row.loan_number,
                loanPublicId: row.loan_public_id,
                oldestDueDate: row.oldest_due_date,
                overdueAmountMinor: row.overdue_amount_minor,
            }),
        )
        return apiResponsePaginatedOkWrapper(ctx, {
            data,
            count: countRow?.count ?? 0,
            limit: input.limit,
            offset: input.offset,
        })
    },
)

export default overdueRoute
export type OverdueRouteType = ApplyGlobalResponse<
    typeof overdueRoute,
    import('../../types.js').TGlobalApiResponses
>
