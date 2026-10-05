import { AppError, catalog } from '@loanms/errors'
import * as paymentValidator from '@loanms/validator/backoffice/payment'
import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { THonoInstance } from '../../types.js'
import {
    apiResponseOkWrapper,
    getActiveOrganizationId,
    parseAuthRoles,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'

const tenantGuard = isTenantAuthenticated()

const collectionReadRoles = new Set([
    'admin',
    'auditor',
    'collector',
    'owner',
    'viewer',
])

async function collectorLoanScope(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
): Promise<number[] | null> {
    const roles = parseAuthRoles(ctx.get('role') ?? '')
    if (!roles.some((role) => collectionReadRoles.has(role))) {
        throw new AppError(catalog.authenticationForbidden)
    }
    if (roles.some((role) => role === 'owner' || role === 'admin')) return null
    if (!roles.includes('collector')) return null

    const { loanCollectionAssignment } = ctx.get('dbSchema')
    const assignments = await ctx
        .get('dbClient')
        .select({ loanId: loanCollectionAssignment.loanId })
        .from(loanCollectionAssignment)
        .where(
            and(
                eq(
                    loanCollectionAssignment.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(
                    loanCollectionAssignment.collectorUserId,
                    ctx.get('user')!.id,
                ),
                isNull(loanCollectionAssignment.unassignedAt),
            ),
        )
    return assignments.map((assignment) => assignment.loanId)
}

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

async function collectionItems(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    whereExtra: ReturnType<typeof eq>[],
    limit?: number,
) {
    const { borrower, loan, loanInstallment } = ctx.get('dbSchema')
    const assignedLoanIds = await collectorLoanScope(ctx)
    if (assignedLoanIds?.length === 0) return []
    const query = ctx
        .get('dbClient')
        .select({
            amountDueMinor: loanInstallment.amountDueMinor,
            amountPaidMinor: loanInstallment.amountPaidMinor,
            borrowerName: borrower.normalizedFullName,
            borrowerPublicId: borrower.publicId,
            dueDate: loanInstallment.dueDate,
            installmentNumber: loanInstallment.installmentNumber,
            loanNumber: loan.loanNumber,
            loanPublicId: loan.publicId,
            loanStatus: loan.status,
            paymentFrequency: loanInstallment.paymentFrequency,
            status: loanInstallment.status,
        })
        .from(loanInstallment)
        .innerJoin(
            loan,
            and(
                eq(loan.organizationId, loanInstallment.organizationId),
                eq(loan.id, loanInstallment.loanId),
            ),
        )
        .innerJoin(
            borrower,
            and(
                eq(borrower.organizationId, loan.organizationId),
                eq(borrower.id, loan.borrowerId),
            ),
        )
        .where(
            and(
                eq(
                    loanInstallment.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                ...(assignedLoanIds
                    ? [inArray(loanInstallment.loanId, assignedLoanIds)]
                    : []),
                ...whereExtra,
            ),
        )
        .orderBy(
            asc(loanInstallment.dueDate),
            asc(loanInstallment.installmentNumber),
        )
    const records = limit ? await query.limit(limit) : await query
    return records.map((record) => ({
        ...record,
        remainingAmountMinor: record.amountDueMinor - record.amountPaidMinor,
    }))
}

export const collectionsRoute = new Hono<THonoInstance>()
    .get('/today', tenantGuard, async (ctx) =>
        apiResponseOkWrapper(ctx, {
            data: await collectionItems(ctx, [
                eq(
                    ctx.get('dbSchema').loanInstallment.dueDate,
                    currentManilaDate(),
                ),
            ]),
        }),
    )
    .get(
        '/date/:date',
        tenantGuard,
        validateRequest('param', paymentValidator.collectionDateInputSchema),
        async (ctx) => {
            const { date } = ctx.req.valid('param')
            return apiResponseOkWrapper(ctx, {
                data: await collectionItems(ctx, [
                    eq(ctx.get('dbSchema').loanInstallment.dueDate, date),
                ]),
            })
        },
    )
    .get(
        '/overdue',
        tenantGuard,
        validateRequest('query', paymentValidator.collectionOverdueInputSchema),
        async (ctx) => {
            const { limit } = ctx.req.valid('query')
            return apiResponseOkWrapper(ctx, {
                data: await collectionItems(
                    ctx,
                    [
                        lt(
                            ctx.get('dbSchema').loanInstallment.dueDate,
                            currentManilaDate(),
                        ),
                        eq(
                            ctx.get('dbSchema').loanInstallment.status,
                            'OVERDUE',
                        ),
                    ],
                    limit,
                ),
            })
        },
    )
    .get(
        '/borrower/:borrowerPublicId',
        tenantGuard,
        validateRequest(
            'param',
            paymentValidator.collectionBorrowerInputSchema,
        ),
        async (ctx) => {
            const { borrowerPublicId } = ctx.req.valid('param')
            return apiResponseOkWrapper(ctx, {
                data: await collectionItems(ctx, [
                    eq(ctx.get('dbSchema').borrower.publicId, borrowerPublicId),
                ]),
            })
        },
    )

export default collectionsRoute
export type CollectionRouteType = ApplyGlobalResponse<
    typeof collectionsRoute,
    import('../../types.js').TGlobalApiResponses
>
