import { AppError, catalog, defineError } from '@loanms/errors'
import * as paymentValidator from '@loanms/validator/backoffice/payment'
import {
    and,
    asc,
    count as countFn,
    desc,
    eq,
    gt,
    inArray,
    isNull,
} from 'drizzle-orm'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { createMiddleware } from 'hono/factory'
import { v7 as uuidv7 } from 'uuid'

import {
    borrowerTagRecalculationStatements,
    classifyBorrowerPaymentTag,
    countMissedInstallments,
    currentManilaDate,
} from '../../services/borrowerPaymentTag.js'
import { allocatePaymentFifo } from '../../services/loanCalculation/index.js'
import {
    readRuntimeSystemSettings,
    type TRuntimeSystemSettings,
} from '../../services/systemSettings.js'
import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
    parseAuthRoles,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'

const loanNotCollectible = defineError(
    'LOAN_NOT_COLLECTIBLE',
    'CONFLICT',
    'Loan is not available for payment collection.',
)
const paymentNotFound = defineError(
    'PAYMENT_NOT_FOUND',
    'NOT_FOUND',
    'Payment not found.',
)
const paymentReverseConflict = defineError(
    'PAYMENT_REVERSE_CONFLICT',
    'CONFLICT',
    'Payment cannot be reversed from its current state.',
)
const paymentWriteConflict = defineError(
    'PAYMENT_WRITE_CONFLICT',
    'CONFLICT',
    'Payment could not be recorded because the loan changed. Refresh and retry.',
)
const paymentUnallocatedAmount = defineError(
    'PAYMENT_UNALLOCATED_AMOUNT',
    'CONFLICT',
    'Payment amount exceeds the remaining scheduled balance. Record only the amount that can be allocated.',
)
const paymentFrequencyDisabled = defineError(
    'PAYMENT_FREQUENCY_DISABLED',
    'CONFLICT',
    'Payments for this loan frequency are disabled by system settings.',
)
const partialPaymentDisabled = defineError(
    'PARTIAL_PAYMENT_DISABLED',
    'CONFLICT',
    'Partial payments are disabled by system settings.',
)
const advancePaymentDisabled = defineError(
    'ADVANCE_PAYMENT_DISABLED',
    'CONFLICT',
    'Advance payments are disabled by system settings.',
)
const primaryFundRequired = defineError(
    'PRIMARY_COMPANY_FUND_REQUIRED',
    'CONFLICT',
    'A primary company fund with opening capital must be configured before financial postings.',
)

const tenantGuard = isTenantAuthenticated()
const privilegedGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (!ctx.get('isPrivilegedRole')) {
        return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
    }
    await next()
})

const paymentReadRoles = new Set([
    'admin',
    'auditor',
    'cashier',
    'collector',
    'owner',
    'viewer',
])
const paymentWriteRoles = new Set([
    'admin',
    'cashier',
    'collector',
    'owner',
])

function hasPaymentRole(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    allowedRoles: ReadonlySet<string>,
) {
    return parseAuthRoles(ctx.get('role') ?? '').some((role) =>
        allowedRoles.has(role),
    )
}

async function assertPaymentScope(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    loanPublicId: string,
) {
    if (!hasPaymentRole(ctx, paymentWriteRoles)) {
        throw new AppError(catalog.authenticationForbidden)
    }

    const roles = parseAuthRoles(ctx.get('role') ?? '')
    if (roles.some((role) => role === 'owner' || role === 'admin')) return
    if (!roles.includes('collector')) return

    const { loan, loanCollectionAssignment } = ctx.get('dbSchema')
    const [assignment] = await ctx
        .get('dbClient')
        .select({ id: loanCollectionAssignment.id })
        .from(loanCollectionAssignment)
        .innerJoin(
            loan,
            and(
                eq(
                    loan.organizationId,
                    loanCollectionAssignment.organizationId,
                ),
                eq(loan.id, loanCollectionAssignment.loanId),
            ),
        )
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
                eq(loan.publicId, loanPublicId),
            ),
        )
        .limit(1)
    if (!assignment) throw new AppError(catalog.authenticationForbidden)
}

function assertPaymentReadRole(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
) {
    if (!hasPaymentRole(ctx, paymentReadRoles)) {
        throw new AppError(catalog.authenticationForbidden)
    }
}

type TInstallment = {
    amountDueMinor: number
    amountPaidMinor: number
    dueDate: string
    id: number
    installmentNumber: number
    paidAt: Date | null
    publicId: string
    status: 'OVERDUE' | 'PAID' | 'PARTIAL' | 'UPCOMING' | 'WAIVED'
}

type TPaymentLoan = {
    actualOutstandingBalanceMinor: number
    borrowerId: number
    borrowerPublicId: string
    completedInstallmentCount: number
    id: number
    installmentCount: number
    paymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
    principalAmountMinor: number
    publicId: string
    status: 'ACTIVE' | 'FULLY_PAID' | 'OVERDUE' | 'RENEWED' | 'WRITTEN_OFF'
    totalAmountPaidMinor: number
}

const installmentStatusAfterPayment = (
    installment: Pick<TInstallment, 'amountDueMinor' | 'dueDate'>,
    amountPaidMinor: number,
    paymentDate: string,
): TInstallment['status'] => {
    if (amountPaidMinor === installment.amountDueMinor) return 'PAID'
    if (amountPaidMinor > 0) return 'PARTIAL'
    return installment.dueDate < paymentDate ? 'OVERDUE' : 'UPCOMING'
}

async function readPaymentLoan(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
): Promise<TPaymentLoan | null> {
    const { borrower, loan } = ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({
            actualOutstandingBalanceMinor: loan.actualOutstandingBalanceMinor,
            borrowerId: loan.borrowerId,
            borrowerPublicId: borrower.publicId,
            completedInstallmentCount: loan.completedInstallmentCount,
            id: loan.id,
            installmentCount: loan.installmentCount,
            paymentFrequency: loan.paymentFrequency,
            principalAmountMinor: loan.principalAmountMinor,
            publicId: loan.publicId,
            status: loan.status,
            totalAmountPaidMinor: loan.totalAmountPaidMinor,
        })
        .from(loan)
        .innerJoin(
            borrower,
            and(
                eq(borrower.organizationId, loan.organizationId),
                eq(borrower.id, loan.borrowerId),
            ),
        )
        .where(
            and(
                eq(loan.organizationId, getActiveOrganizationId(ctx)),
                eq(loan.publicId, publicId),
            ),
        )
        .limit(1)
    return (record as TPaymentLoan | undefined) ?? null
}

async function readInstallments(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    loanId: number,
): Promise<TInstallment[]> {
    const { loanInstallment } = ctx.get('dbSchema')
    return ctx
        .get('dbClient')
        .select({
            amountDueMinor: loanInstallment.amountDueMinor,
            amountPaidMinor: loanInstallment.amountPaidMinor,
            dueDate: loanInstallment.dueDate,
            id: loanInstallment.id,
            installmentNumber: loanInstallment.installmentNumber,
            paidAt: loanInstallment.paidAt,
            publicId: loanInstallment.publicId,
            status: loanInstallment.status,
        })
        .from(loanInstallment)
        .where(
            and(
                eq(
                    loanInstallment.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(loanInstallment.loanId, loanId),
            ),
        )
        .orderBy(asc(loanInstallment.installmentNumber)) as Promise<
        TInstallment[]
    >
}

function quotePayment(
    loan: TPaymentLoan,
    installments: TInstallment[],
    amountReceivedMinor: number,
    paymentDate: string,
) {
    const allocation = allocatePaymentFifo(
        installments.map((installment) => ({
            amountDueCents: installment.amountDueMinor,
            amountPaidCents: installment.amountPaidMinor,
            dueDate: installment.dueDate,
            installmentNumber: installment.installmentNumber,
        })),
        amountReceivedMinor,
    )
    const allocationByNumber = new Map(
        allocation.allocations.map((entry) => [
            entry.installmentNumber,
            entry,
        ]),
    )
    const updatedByNumber = new Map(
        allocation.installments.map((entry) => [
            entry.installmentNumber,
            entry,
        ]),
    )
    const allocations = installments.flatMap((installment) => {
        const entry = allocationByNumber.get(installment.installmentNumber)
        const updated = updatedByNumber.get(installment.installmentNumber)!
        return entry
            ? [
                  {
                      allocatedAmountMinor: entry.amountAllocatedCents,
                      amountDueMinor: installment.amountDueMinor,
                      amountPaidMinor: updated.amountPaidCents,
                      dueDate: installment.dueDate,
                      installmentNumber: installment.installmentNumber,
                      loanInstallmentPublicId: installment.publicId,
                      status: installmentStatusAfterPayment(
                          installment,
                          updated.amountPaidCents,
                          paymentDate,
                      ),
                  },
              ]
            : []
    })
    const hasOverdue = allocation.installments.some(
        (installment) =>
            installment.amountPaidCents < installment.amountDueCents &&
            installment.dueDate < paymentDate,
    )
    return {
        allocations,
        amountAllocatedMinor: allocation.amountAppliedCents,
        amountReceivedMinor,
        unallocatedMinor: allocation.unappliedAmountCents,
        borrowerPublicId: loan.borrowerPublicId,
        completedInstallmentsAfterPayment: allocation.completedInstallmentCount,
        actualOutstandingBalanceAfterPaymentMinor:
            allocation.actualOutstandingBalanceCents,
        loanPublicId: loan.publicId,
        partialPaymentCreditAfterPaymentMinor:
            allocation.partialPaymentCreditCents,
        remainingInstallmentsAfterPayment:
            loan.installmentCount - allocation.completedInstallmentCount,
        nextLoanStatus:
            allocation.actualOutstandingBalanceCents === 0
                ? 'FULLY_PAID'
                : hasOverdue
                  ? 'OVERDUE'
                  : 'ACTIVE',
    }
}

function assertPaymentPolicy(
    settings: TRuntimeSystemSettings,
    loan: TPaymentLoan,
    quote: ReturnType<typeof quotePayment>,
    paymentDate: string,
) {
    if (!settings.enabledPaymentFrequencies.includes(loan.paymentFrequency)) {
        throw new AppError(paymentFrequencyDisabled)
    }
    if (
        !settings.allowPartialPayments &&
        quote.partialPaymentCreditAfterPaymentMinor > 0
    ) {
        throw new AppError(partialPaymentDisabled)
    }
    if (
        !settings.allowAdvancePayments &&
        quote.allocations.some((allocation) => allocation.dueDate > paymentDate)
    ) {
        throw new AppError(advancePaymentDisabled)
    }
}

function paymentOutput(
    payment: {
        actualOutstandingBalanceAfterPaymentMinor: number
        amountAllocatedMinor: number
        amountReceivedMinor: number
        unallocatedMinor: number
        borrowerPublicId: string
        completedInstallmentsAfterPayment: number
        loanPublicId: string
        partialPaymentCreditAfterPaymentMinor: number
        paymentDate: string
        paymentMethod: string
        paymentNumber: string
        paymentTypeSnapshot: 'DAILY' | 'MONTHLY' | 'WEEKLY'
        publicId: string
        referenceNumber: string | null
        remainingInstallmentsAfterPayment: number
        status: 'POSTED' | 'REVERSED'
    },
    allocations: {
        allocatedAmountMinor: number
        amountDueMinor: number
        amountPaidMinor: number
        dueDate: string
        installmentNumber: number
        loanInstallmentPublicId: string
        status: TInstallment['status']
    }[],
) {
    return { ...payment, allocations }
}

export const paymentsRoute = new Hono<THonoInstance>()
    .post(
        '/quote',
        tenantGuard,
        validateRequest('json', paymentValidator.paymentQuoteInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            await assertPaymentScope(ctx, input.loanPublicId)
            const loan = await readPaymentLoan(ctx, input.loanPublicId)
            if (
                !loan ||
                ![
                    'ACTIVE',
                    'OVERDUE',
                ].includes(loan.status)
            ) {
                throw new AppError(loanNotCollectible)
            }
            const installments = await readInstallments(ctx, loan.id)
            const settings = await readRuntimeSystemSettings(ctx)
            const quote = quotePayment(
                loan,
                installments,
                input.amountReceivedMinor,
                input.paymentDate,
            )
            assertPaymentPolicy(settings, loan, quote, input.paymentDate)
            return apiResponseOkWrapper(ctx, {
                data: quote,
            })
        },
    )
    .post(
        '/create',
        tenantGuard,
        validateRequest('json', paymentValidator.paymentCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            await assertPaymentScope(ctx, input.loanPublicId)
            const organizationId = getActiveOrganizationId(ctx)
            const actorId = ctx.get('user')!.id
            const db = ctx.get('dbClient')
            const { payment } = ctx.get('dbSchema')
            const [replay] = await db
                .select({ publicId: payment.publicId })
                .from(payment)
                .where(
                    and(
                        eq(payment.organizationId, organizationId),
                        eq(payment.idempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)
            if (replay) {
                const response = await readPayment(ctx, replay.publicId)
                if (response)
                    return apiResponseOkWrapper(ctx, { data: response })
            }

            const loan = await readPaymentLoan(ctx, input.loanPublicId)
            if (
                !loan ||
                ![
                    'ACTIVE',
                    'OVERDUE',
                ].includes(loan.status)
            ) {
                throw new AppError(loanNotCollectible)
            }
            const { companyFund } = ctx.get('dbSchema')
            const [fund] = await db
                .select({ id: companyFund.id })
                .from(companyFund)
                .where(
                    and(
                        eq(companyFund.organizationId, organizationId),
                        eq(companyFund.isPrimary, true),
                    ),
                )
                .limit(1)
            if (!fund) throw new AppError(primaryFundRequired)
            const installments = await readInstallments(ctx, loan.id)
            const settings = await readRuntimeSystemSettings(ctx)
            const quote = quotePayment(
                loan,
                installments,
                input.amountReceivedMinor,
                input.paymentDate,
            )
            assertPaymentPolicy(settings, loan, quote, input.paymentDate)
            if (quote.amountAllocatedMinor === 0) {
                throw new AppError(loanNotCollectible)
            }
            // Cash and capital ledgers are reconciled one-to-one for posted
            // collections. An unallocated balance needs its own durable
            // liability/refund workflow before this API can accept it.
            if (quote.unallocatedMinor > 0) {
                throw new AppError(paymentUnallocatedAmount)
            }
            const principalCollectionMinor = Math.min(
                quote.amountAllocatedMinor,
                Math.max(
                    0,
                    loan.principalAmountMinor - loan.totalAmountPaidMinor,
                ),
            )
            const interestCollectionMinor =
                quote.amountAllocatedMinor - principalCollectionMinor
            const publicId = uuidv7()
            const paymentNumber = `PAY-${publicId}`
            const database = db.$client
            const installmentsAfterPayment = installments.map((installment) => {
                const allocation = quote.allocations.find(
                    (entry) =>
                        entry.loanInstallmentPublicId === installment.publicId,
                )
                return allocation
                    ? {
                          ...installment,
                          amountPaidMinor: allocation.amountPaidMinor,
                          status: allocation.status,
                      }
                    : installment
            })
            const missedInstallmentCount = countMissedInstallments(
                installmentsAfterPayment,
                input.paymentDate,
            )
            const calculatedTag = classifyBorrowerPaymentTag(
                missedInstallmentCount,
                loan.paymentFrequency,
                settings.borrowerTagPolicy,
            )
            const now = Date.now()
            const auditData = auditTrailLogger.prepare({
                action: 'create',
                component: 'payment',
                description: 'Payment received',
                records: [
                    {
                        table: 'payment',
                        id: publicId,
                        newData: {
                            amountAllocatedMinor: quote.amountAllocatedMinor,
                            amountReceivedMinor: quote.amountReceivedMinor,
                            unallocatedMinor: quote.unallocatedMinor,
                            paymentDate: input.paymentDate,
                            paymentMethod: input.paymentMethod,
                            paymentNumber,
                            status: 'POSTED',
                        },
                    },
                    {
                        table: 'loan',
                        id: loan.publicId,
                        oldData: {
                            actualOutstandingBalanceMinor:
                                loan.actualOutstandingBalanceMinor,
                            status: loan.status,
                        },
                        newData: {
                            actualOutstandingBalanceMinor:
                                quote.actualOutstandingBalanceAfterPaymentMinor,
                            status: quote.nextLoanStatus,
                        },
                    },
                ],
            })
            const statements = [
                database
                    .prepare(
                        `UPDATE loan
                         SET total_amount_paid_minor = ?, completed_installment_count = ?,
                             partial_payment_credit_minor = ?, actual_outstanding_balance_minor = ?,
                             status = ?, updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND id = ? AND status IN ('ACTIVE', 'OVERDUE')
                           AND total_amount_paid_minor = ? AND actual_outstanding_balance_minor = ?`,
                    )
                    .bind(
                        loan.totalAmountPaidMinor + quote.amountAllocatedMinor,
                        quote.completedInstallmentsAfterPayment,
                        quote.partialPaymentCreditAfterPaymentMinor,
                        quote.actualOutstandingBalanceAfterPaymentMinor,
                        quote.nextLoanStatus,
                        actorId,
                        now,
                        organizationId,
                        loan.id,
                        loan.totalAmountPaidMinor,
                        loan.actualOutstandingBalanceMinor,
                    ),
                database
                    .prepare(
                        `INSERT INTO payment (
                            public_id, organization_id, payment_number, borrower_id, loan_id,
                            amount_received_minor, amount_allocated_minor, unallocated_minor,
                            payment_date, payment_type_snapshot, payment_method, reference_number,
                            notes, partial_payment_credit_after_payment_minor,
                            completed_installments_after_payment,
                            remaining_installments_after_payment,
                            actual_outstanding_balance_after_payment_minor, status, idempotency_key,
                            created_by_user_id, created_at
                         ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?, ?, ?
                           WHERE changes() = 1`,
                    )
                    .bind(
                        publicId,
                        organizationId,
                        paymentNumber,
                        loan.borrowerId,
                        loan.id,
                        quote.amountReceivedMinor,
                        quote.amountAllocatedMinor,
                        quote.unallocatedMinor,
                        input.paymentDate,
                        loan.paymentFrequency,
                        input.paymentMethod,
                        input.referenceNumber ?? null,
                        input.notes ?? null,
                        quote.partialPaymentCreditAfterPaymentMinor,
                        quote.completedInstallmentsAfterPayment,
                        quote.remainingInstallmentsAfterPayment,
                        quote.actualOutstandingBalanceAfterPaymentMinor,
                        input.idempotencyKey,
                        actorId,
                        now,
                    ),
                ...quote.allocations.flatMap((allocation) => {
                    const installment = installments.find(
                        (entry) =>
                            entry.publicId ===
                            allocation.loanInstallmentPublicId,
                    )!
                    return [
                        database
                            .prepare(
                                `UPDATE loan_installment
                                 SET amount_paid_minor = ?, status = ?, paid_at = ?
                                 WHERE organization_id = ? AND id = ? AND amount_paid_minor = ?`,
                            )
                            .bind(
                                allocation.amountPaidMinor,
                                allocation.status,
                                now,
                                organizationId,
                                installment.id,
                                installment.amountPaidMinor,
                            ),
                        database
                            .prepare(
                                `INSERT INTO payment_allocation (
                                    organization_id, payment_id, loan_installment_id,
                                    allocated_amount_minor, amount_paid_before_minor,
                                    status_before, paid_at_before, created_at
                                 ) SELECT ?, payment.id, ?, ?, ?, ?, ?, ?
                                   FROM payment WHERE payment.organization_id = ? AND payment.public_id = ?`,
                            )
                            .bind(
                                organizationId,
                                installment.id,
                                allocation.allocatedAmountMinor,
                                installment.amountPaidMinor,
                                installment.status,
                                installment.paidAt
                                    ? installment.paidAt.getTime()
                                    : null,
                                now,
                                organizationId,
                                publicId,
                            ),
                    ]
                }),
                ...borrowerTagRecalculationStatements({
                    actorId,
                    borrowerId: loan.borrowerId,
                    calculatedTag,
                    database,
                    enabled: settings.borrowerTagPolicy.automaticTaggingEnabled,
                    historyPublicId: uuidv7(),
                    now,
                    organizationId,
                }),
                database
                    .prepare(
                        `INSERT INTO cash_transaction (
                            public_id, organization_id, transaction_number, transaction_type,
                            direction, borrower_id, loan_id, payment_id, amount_minor, transaction_at,
                            idempotency_key, notes, created_by_user_id, created_at
                         ) SELECT ?, ?, ?, 'PAYMENT_RECEIVED', 'CASH_IN', ?, ?, payment.id, ?, ?, ?, ?, ?, ?
                           FROM payment WHERE payment.organization_id = ? AND payment.public_id = ?`,
                    )
                    .bind(
                        uuidv7(),
                        organizationId,
                        `CASH-${paymentNumber}`,
                        loan.borrowerId,
                        loan.id,
                        quote.amountReceivedMinor,
                        Date.now(),
                        input.idempotencyKey,
                        input.notes ?? null,
                        actorId,
                        Date.now(),
                        organizationId,
                        publicId,
                    ),
                ...(principalCollectionMinor > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO capital_transaction (
                                       public_id, organization_id, company_fund_id, transaction_number,
                                       transaction_type, direction, amount_minor, loan_id, payment_id,
                                       cash_transaction_id, transaction_at, created_by_user_id
                                   ) SELECT ?, ?, fund.id, ?, 'PRINCIPAL_COLLECTION', 'IN', ?, loan.id,
                                            payment.id, cash.id, ?, ?
                                       FROM company_fund AS fund
                                       INNER JOIN payment
                                         ON payment.organization_id = fund.organization_id
                                       INNER JOIN loan
                                         ON loan.organization_id = payment.organization_id
                                        AND loan.id = payment.loan_id
                                       INNER JOIN cash_transaction AS cash
                                         ON cash.organization_id = payment.organization_id
                                        AND cash.payment_id = payment.id
                                        AND cash.transaction_type = 'PAYMENT_RECEIVED'
                                      WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                                        AND payment.public_id = ?`,
                              )
                              .bind(
                                  uuidv7(),
                                  organizationId,
                                  `CAP-PRI-${paymentNumber}`,
                                  principalCollectionMinor,
                                  Date.now(),
                                  actorId,
                                  organizationId,
                                  publicId,
                              ),
                      ]
                    : []),
                ...(interestCollectionMinor > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO capital_transaction (
                                       public_id, organization_id, company_fund_id, transaction_number,
                                       transaction_type, direction, amount_minor, loan_id, payment_id,
                                       cash_transaction_id, transaction_at, created_by_user_id
                                   ) SELECT ?, ?, fund.id, ?, 'INTEREST_COLLECTION', 'IN', ?, loan.id,
                                            payment.id, cash.id, ?, ?
                                       FROM company_fund AS fund
                                       INNER JOIN payment
                                         ON payment.organization_id = fund.organization_id
                                       INNER JOIN loan
                                         ON loan.organization_id = payment.organization_id
                                        AND loan.id = payment.loan_id
                                       INNER JOIN cash_transaction AS cash
                                         ON cash.organization_id = payment.organization_id
                                        AND cash.payment_id = payment.id
                                        AND cash.transaction_type = 'PAYMENT_RECEIVED'
                                      WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                                        AND payment.public_id = ?`,
                              )
                              .bind(
                                  uuidv7(),
                                  organizationId,
                                  `CAP-INT-${paymentNumber}`,
                                  interestCollectionMinor,
                                  Date.now(),
                                  actorId,
                                  organizationId,
                                  publicId,
                              ),
                      ]
                    : []),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ]
            const results = await database.batch(statements)
            if (results[1].meta.changes !== 1) {
                const existing = await readPaymentByIdempotency(
                    ctx,
                    input.idempotencyKey,
                )
                if (existing)
                    return apiResponseOkWrapper(ctx, { data: existing })
                throw new AppError(paymentWriteConflict)
            }
            markAuditTrailRecorded(ctx)
            const response = await readPayment(ctx, publicId)
            if (!response) throw new AppError(paymentWriteConflict)
            return apiResponseOkWrapper(ctx, { data: response, status: 201 })
        },
    )
    .post(
        '/:publicId/reverse',
        tenantGuard,
        privilegedGuard,
        validateRequest('param', paymentValidator.paymentPublicIdInputSchema),
        validateRequest('json', paymentValidator.paymentReverseInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const input = ctx.req.valid('json')
            await reversePayment(ctx, publicId, input.reason)
            const response = await readPayment(ctx, publicId)
            if (!response) throw new AppError(paymentNotFound)
            return apiResponseOkWrapper(ctx, { data: response })
        },
    )
    .on(
        'QUERY',
        '/readMany',
        tenantGuard,
        validateRequest('json', paymentValidator.paymentReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            assertPaymentReadRole(ctx)
            const { borrower, loan, payment } = ctx.get('dbSchema')
            const { borrowerPublicId, loanPublicId, status } = input.filters
            const where = and(
                eq(payment.organizationId, getActiveOrganizationId(ctx)),
                ...(borrowerPublicId
                    ? [eq(borrower.publicId, borrowerPublicId)]
                    : []),
                ...(loanPublicId ? [eq(loan.publicId, loanPublicId)] : []),
                ...(status ? [eq(payment.status, status)] : []),
            )
            const [count] = await ctx
                .get('dbClient')
                .select({ count: countFn(payment.id) })
                .from(payment)
                .innerJoin(
                    borrower,
                    and(
                        eq(borrower.organizationId, payment.organizationId),
                        eq(borrower.id, payment.borrowerId),
                    ),
                )
                .innerJoin(
                    loan,
                    and(
                        eq(loan.organizationId, payment.organizationId),
                        eq(loan.id, payment.loanId),
                    ),
                )
                .where(where)
            const records = await ctx
                .get('dbClient')
                .select({ publicId: payment.publicId })
                .from(payment)
                .innerJoin(
                    borrower,
                    and(
                        eq(borrower.organizationId, payment.organizationId),
                        eq(borrower.id, payment.borrowerId),
                    ),
                )
                .innerJoin(
                    loan,
                    and(
                        eq(loan.organizationId, payment.organizationId),
                        eq(loan.id, payment.loanId),
                    ),
                )
                .where(where)
                .orderBy(
                    input.sortOrder === 'asc'
                        ? asc(payment.createdAt)
                        : desc(payment.createdAt),
                )
                .limit(input.limit)
                .offset(input.offset)
            const data = (
                await Promise.all(
                    records.map((record) => readPayment(ctx, record.publicId)),
                )
            ).filter(
                (record): record is NonNullable<typeof record> =>
                    record !== null,
            )
            return apiResponsePaginatedOkWrapper(ctx, {
                count: count.count,
                data,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )

async function readPaymentByIdempotency(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    idempotencyKey: string,
) {
    const { payment } = ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({ publicId: payment.publicId })
        .from(payment)
        .where(
            and(
                eq(payment.organizationId, getActiveOrganizationId(ctx)),
                eq(payment.idempotencyKey, idempotencyKey),
            ),
        )
        .limit(1)
    return record ? readPayment(ctx, record.publicId) : null
}

async function readPayment(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
) {
    const { borrower, loan, loanInstallment, payment, paymentAllocation } =
        ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({
            actualOutstandingBalanceAfterPaymentMinor:
                payment.actualOutstandingBalanceAfterPaymentMinor,
            amountAllocatedMinor: payment.amountAllocatedMinor,
            amountReceivedMinor: payment.amountReceivedMinor,
            unallocatedMinor: payment.unallocatedMinor,
            borrowerPublicId: borrower.publicId,
            completedInstallmentsAfterPayment:
                payment.completedInstallmentsAfterPayment,
            id: payment.id,
            loanPublicId: loan.publicId,
            partialPaymentCreditAfterPaymentMinor:
                payment.partialPaymentCreditAfterPaymentMinor,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod,
            paymentNumber: payment.paymentNumber,
            paymentTypeSnapshot: payment.paymentTypeSnapshot,
            publicId: payment.publicId,
            referenceNumber: payment.referenceNumber,
            remainingInstallmentsAfterPayment:
                payment.remainingInstallmentsAfterPayment,
            status: payment.status,
        })
        .from(payment)
        .innerJoin(
            borrower,
            and(
                eq(borrower.organizationId, payment.organizationId),
                eq(borrower.id, payment.borrowerId),
            ),
        )
        .innerJoin(
            loan,
            and(
                eq(loan.organizationId, payment.organizationId),
                eq(loan.id, payment.loanId),
            ),
        )
        .where(
            and(
                eq(payment.organizationId, getActiveOrganizationId(ctx)),
                eq(payment.publicId, publicId),
            ),
        )
        .limit(1)
    if (!record) return null
    const allocations = await ctx
        .get('dbClient')
        .select({
            allocatedAmountMinor: paymentAllocation.allocatedAmountMinor,
            amountDueMinor: loanInstallment.amountDueMinor,
            amountPaidMinor: loanInstallment.amountPaidMinor,
            dueDate: loanInstallment.dueDate,
            installmentNumber: loanInstallment.installmentNumber,
            loanInstallmentPublicId: loanInstallment.publicId,
            status: loanInstallment.status,
        })
        .from(paymentAllocation)
        .innerJoin(
            loanInstallment,
            and(
                eq(
                    loanInstallment.organizationId,
                    paymentAllocation.organizationId,
                ),
                eq(loanInstallment.id, paymentAllocation.loanInstallmentId),
            ),
        )
        .where(
            and(
                eq(
                    paymentAllocation.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(paymentAllocation.paymentId, record.id),
            ),
        )
    const { id: _id, ...safeRecord } = record
    return paymentOutput(
        safeRecord as Parameters<typeof paymentOutput>[0],
        allocations as Parameters<typeof paymentOutput>[1],
    )
}

async function reversePayment(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
    reason: string,
) {
    const { payment, paymentAllocation } = ctx.get('dbSchema')
    const organizationId = getActiveOrganizationId(ctx)
    const actorId = ctx.get('user')!.id
    const [record] = await ctx
        .get('dbClient')
        .select()
        .from(payment)
        .where(
            and(
                eq(payment.organizationId, organizationId),
                eq(payment.publicId, publicId),
            ),
        )
        .limit(1)
    if (!record) throw new AppError(paymentNotFound)
    if (record.status !== 'POSTED') throw new AppError(paymentReverseConflict)
    const loan = await readPaymentLoan(
        ctx,
        (
            await ctx
                .get('dbClient')
                .select({ publicId: ctx.get('dbSchema').loan.publicId })
                .from(ctx.get('dbSchema').loan)
                .where(
                    and(
                        eq(
                            ctx.get('dbSchema').loan.organizationId,
                            organizationId,
                        ),
                        eq(ctx.get('dbSchema').loan.id, record.loanId),
                    ),
                )
                .limit(1)
        )[0]?.publicId ?? '',
    )
    if (!loan) throw new AppError(paymentNotFound)
    const { companyFund } = ctx.get('dbSchema')
    const [fund] = await ctx
        .get('dbClient')
        .select({ id: companyFund.id })
        .from(companyFund)
        .where(
            and(
                eq(companyFund.organizationId, organizationId),
                eq(companyFund.isPrimary, true),
            ),
        )
        .limit(1)
    if (!fund) throw new AppError(primaryFundRequired)
    const allocations = await ctx
        .get('dbClient')
        .select({
            allocatedAmountMinor: paymentAllocation.allocatedAmountMinor,
            amountPaidBeforeMinor: paymentAllocation.amountPaidBeforeMinor,
            loanInstallmentId: paymentAllocation.loanInstallmentId,
            paidAtBefore: paymentAllocation.paidAtBefore,
            statusBefore: paymentAllocation.statusBefore,
        })
        .from(paymentAllocation)
        .where(
            and(
                eq(paymentAllocation.organizationId, organizationId),
                eq(paymentAllocation.paymentId, record.id),
            ),
        )
    if (allocations.length > 0) {
        const [laterAllocation] = await ctx
            .get('dbClient')
            .select({ id: paymentAllocation.id })
            .from(paymentAllocation)
            .innerJoin(
                payment,
                and(
                    eq(
                        payment.organizationId,
                        paymentAllocation.organizationId,
                    ),
                    eq(payment.id, paymentAllocation.paymentId),
                ),
            )
            .where(
                and(
                    eq(paymentAllocation.organizationId, organizationId),
                    inArray(
                        paymentAllocation.loanInstallmentId,
                        allocations.map(
                            (allocation) => allocation.loanInstallmentId,
                        ),
                    ),
                    eq(payment.status, 'POSTED'),
                    gt(payment.createdAt, record.createdAt),
                ),
            )
            .limit(1)
        if (laterAllocation) throw new AppError(paymentReverseConflict)
    }
    const currentInstallments = await readInstallments(ctx, loan.id)
    const allocationByInstallmentId = new Map(
        allocations.map((allocation) => [
            allocation.loanInstallmentId,
            allocation,
        ]),
    )
    const restoredInstallments = currentInstallments.map((installment) => {
        const allocation = allocationByInstallmentId.get(installment.id)
        return allocation
            ? {
                  ...installment,
                  amountPaidMinor: allocation.amountPaidBeforeMinor,
                  paidAt: allocation.paidAtBefore,
                  status: allocation.statusBefore,
              }
            : installment
    })
    let restoredCompletedInstallments = 0
    for (const installment of restoredInstallments) {
        if (installment.amountPaidMinor !== installment.amountDueMinor) break
        restoredCompletedInstallments += 1
    }
    const restoredPartialCredit =
        restoredInstallments[restoredCompletedInstallments]?.amountPaidMinor ??
        0
    const database = ctx.get('dbClient').$client
    const now = Date.now()
    const settings = await readRuntimeSystemSettings(ctx)
    const calculatedTag = classifyBorrowerPaymentTag(
        countMissedInstallments(restoredInstallments, currentManilaDate()),
        loan.paymentFrequency,
        settings.borrowerTagPolicy,
    )
    const restoredTotal =
        loan.totalAmountPaidMinor - record.amountAllocatedMinor
    const principalReversalMinor = Math.min(
        record.amountAllocatedMinor,
        Math.max(0, loan.principalAmountMinor - restoredTotal),
    )
    const interestReversalMinor =
        record.amountAllocatedMinor - principalReversalMinor
    const restoredOutstanding =
        loan.actualOutstandingBalanceMinor + record.amountAllocatedMinor
    const restoredLoanStatus =
        restoredOutstanding === 0
            ? 'FULLY_PAID'
            : restoredInstallments.some(
                    (installment) => installment.status === 'OVERDUE',
                )
              ? 'OVERDUE'
              : 'ACTIVE'
    const auditData = auditTrailLogger.prepare({
        action: 'update',
        component: 'payment',
        description: 'Payment reversed',
        records: {
            table: 'payment',
            id: publicId,
            oldData: { status: 'POSTED' },
            newData: { status: 'REVERSED' },
        },
    })
    const reversalCashTransactionPublicId = uuidv7()
    const results = await database.batch([
        database
            .prepare(
                `UPDATE loan SET total_amount_paid_minor = ?, completed_installment_count = ?, partial_payment_credit_minor = ?, actual_outstanding_balance_minor = ?, status = ?, updated_by_user_id = ?, updated_at = ? WHERE organization_id = ? AND id = ? AND total_amount_paid_minor = ? AND actual_outstanding_balance_minor = ?`,
            )
            .bind(
                restoredTotal,
                restoredCompletedInstallments,
                restoredPartialCredit,
                restoredOutstanding,
                restoredLoanStatus,
                actorId,
                now,
                organizationId,
                loan.id,
                loan.totalAmountPaidMinor,
                loan.actualOutstandingBalanceMinor,
            ),
        database
            .prepare(
                `UPDATE payment SET status = 'REVERSED', reversed_by_user_id = ?, reversed_at = ?, reversal_reason = ? WHERE organization_id = ? AND id = ? AND status = 'POSTED' AND changes() = 1`,
            )
            .bind(actorId, now, reason, organizationId, record.id),
        ...allocations.flatMap((allocation) => [
            database
                .prepare(
                    `UPDATE loan_installment SET amount_paid_minor = ?, status = ?, paid_at = ? WHERE organization_id = ? AND id = ?`,
                )
                .bind(
                    allocation.amountPaidBeforeMinor,
                    allocation.statusBefore,
                    allocation.paidAtBefore,
                    organizationId,
                    allocation.loanInstallmentId,
                ),
            database
                .prepare(
                    `UPDATE payment_allocation SET reversed_by_user_id = ?, reversed_at = ? WHERE organization_id = ? AND payment_id = ? AND loan_installment_id = ?`,
                )
                .bind(
                    actorId,
                    now,
                    organizationId,
                    record.id,
                    allocation.loanInstallmentId,
                ),
        ]),
        ...borrowerTagRecalculationStatements({
            actorId,
            borrowerId: loan.borrowerId,
            calculatedTag,
            database,
            enabled: settings.borrowerTagPolicy.automaticTaggingEnabled,
            historyPublicId: uuidv7(),
            now,
            organizationId,
        }),
        database
            .prepare(
                `INSERT INTO cash_transaction (public_id, organization_id, transaction_number, transaction_type, direction, borrower_id, loan_id, payment_id, amount_minor, transaction_at, idempotency_key, notes, created_by_user_id, created_at) VALUES (?, ?, ?, 'PAYMENT_REVERSAL', 'CASH_OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                reversalCashTransactionPublicId,
                organizationId,
                `CASH-REV-${record.paymentNumber}`,
                record.borrowerId,
                record.loanId,
                record.id,
                record.amountReceivedMinor,
                now,
                `REV-${record.publicId}`,
                reason,
                actorId,
                now,
            ),
        ...(principalReversalMinor > 0
            ? [
                  database
                      .prepare(
                          `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, payment_id, cash_transaction_id, transaction_at, created_by_user_id)
                           SELECT ?, ?, fund.id, ?, 'PRINCIPAL_COLLECTION', 'OUT', ?, loan.id, payment.id, cash.id, ?, ?
                             FROM company_fund AS fund
                             INNER JOIN payment ON payment.organization_id = fund.organization_id
                             INNER JOIN loan ON loan.organization_id = payment.organization_id AND loan.id = payment.loan_id
                             INNER JOIN cash_transaction AS cash ON cash.organization_id = payment.organization_id AND cash.public_id = ?
                            WHERE fund.organization_id = ? AND fund.is_primary = TRUE AND payment.id = ?`,
                      )
                      .bind(
                          uuidv7(),
                          organizationId,
                          `CAP-REV-PRI-${record.paymentNumber}`,
                          principalReversalMinor,
                          now,
                          actorId,
                          reversalCashTransactionPublicId,
                          organizationId,
                          record.id,
                      ),
              ]
            : []),
        ...(interestReversalMinor > 0
            ? [
                  database
                      .prepare(
                          `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, payment_id, cash_transaction_id, transaction_at, created_by_user_id)
                           SELECT ?, ?, fund.id, ?, 'INTEREST_COLLECTION', 'OUT', ?, loan.id, payment.id, cash.id, ?, ?
                             FROM company_fund AS fund
                             INNER JOIN payment ON payment.organization_id = fund.organization_id
                             INNER JOIN loan ON loan.organization_id = payment.organization_id AND loan.id = payment.loan_id
                             INNER JOIN cash_transaction AS cash ON cash.organization_id = payment.organization_id AND cash.public_id = ?
                            WHERE fund.organization_id = ? AND fund.is_primary = TRUE AND payment.id = ?`,
                      )
                      .bind(
                          uuidv7(),
                          organizationId,
                          `CAP-REV-INT-${record.paymentNumber}`,
                          interestReversalMinor,
                          now,
                          actorId,
                          reversalCashTransactionPublicId,
                          organizationId,
                          record.id,
                      ),
              ]
            : []),
        auditTrailAfterChangeStatement(ctx, auditData, database),
    ])
    if (results[1].meta.changes !== 1)
        throw new AppError(paymentReverseConflict)
    markAuditTrailRecorded(ctx)
}

export default paymentsRoute
export type PaymentRouteType = ApplyGlobalResponse<
    typeof paymentsRoute,
    import('../../types.js').TGlobalApiResponses
>
