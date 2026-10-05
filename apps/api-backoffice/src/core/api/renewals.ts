import { AppError, catalog, defineError } from '@loanms/errors'
import * as renewalValidator from '@loanms/validator/backoffice/renewal'
import { and, asc, count as countFn, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { createMiddleware } from 'hono/factory'
import { v7 as uuidv7 } from 'uuid'

import {
    allocatePaymentFifo,
    calculateLoan,
    calculateRenewalQuote,
    createInstallmentSchedule,
    type TLoanCalculationInput,
} from '../../services/loanCalculation/index.js'
import { readRuntimeSystemSettings } from '../../services/systemSettings.js'
import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../utilities/helpers.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'

const renewalLoanNotFound = defineError(
    'RENEWAL_LOAN_NOT_FOUND',
    'NOT_FOUND',
    'Loan is not available for renewal.',
)
const renewalNotFound = defineError(
    'RENEWAL_NOT_FOUND',
    'NOT_FOUND',
    'Renewal not found.',
)
const renewalNotEligible = defineError(
    'RENEWAL_NOT_ELIGIBLE',
    'CONFLICT',
    'Loan is not eligible for renewal.',
)
const renewalPrincipalUnavailable = defineError(
    'RENEWAL_PRINCIPAL_UNAVAILABLE',
    'CONFLICT',
    'Renewal principal is not allowed by the loan policy.',
)
const renewalPaymentFrequencyDisabled = defineError(
    'RENEWAL_PAYMENT_FREQUENCY_DISABLED',
    'CONFLICT',
    'Renewals for this payment frequency are disabled by system settings.',
)
const renewalConflict = defineError(
    'RENEWAL_CONFLICT',
    'CONFLICT',
    'Loan renewal could not be completed.',
)
const renewalManualReviewRequired = defineError(
    'RENEWAL_MANUAL_REVIEW_REQUIRED',
    'CONFLICT',
    'Renewal requires manual review for partial payment credit.',
)
const renewalAdditionalSettlementRequired = defineError(
    'RENEWAL_ADDITIONAL_SETTLEMENT_REQUIRED',
    'CONFLICT',
    'Renewal principal does not cover the settlement balance.',
)
const primaryFundRequired = defineError(
    'PRIMARY_COMPANY_FUND_REQUIRED',
    'CONFLICT',
    'A primary company fund with opening capital must be configured before financial postings.',
)

type TStoredLoan = {
    actualOutstandingBalanceMinor: number
    allowRenewalPrincipalChange: boolean
    borrowerId: number
    borrowerPublicId: string
    completedInstallmentCount: number
    dailyPaymentAmountMinor: number
    finalInstallmentResiduePolicy: 'LAST_INSTALLMENT_ABSORBS_RESIDUE'
    fixedInterestAmountMinor: null | number
    formulaProfileId: number
    formulaProfileNameSnapshot: string
    formulaProfilePublicId: string
    formulaProfileVersionSnapshot: number
    id: number
    installmentCount: number
    interestMethod: 'FIXED_AMOUNT' | 'FLAT_PERCENTAGE'
    interestRateBasisPoints: number
    loanNumber: string
    loanProductId: number
    loanProductNameSnapshot: string
    maximumPrincipalAmountMinorSnapshot: number
    minCompletedInstallments: number
    minimumPrincipalAmountMinorSnapshot: number
    partialCreditPolicy:
        'APPLY_TO_SETTLEMENT' | 'CARRY_FORWARD' | 'MANUAL_REVIEW' | 'REFUND'
    partialPaymentCreditMinor: number
    paymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
    principalAmountMinor: number
    publicId: string
    renewalSettlementMethod:
        'COMPLETED_INSTALLMENT_BALANCE' | 'EXACT_OUTSTANDING_BALANCE'
    roundingMode: 'DOWN' | 'HALF_UP' | 'UP'
    status: 'ACTIVE' | 'OVERDUE'
    termDays: number
    totalAmountPaidMinor: number
    timezone: 'Asia/Manila'
}

type TRenewalQuote = Awaited<ReturnType<typeof quoteRenewal>>

const tenantGuard = isTenantAuthenticated()

const privilegedGuard = createMiddleware<THonoInstance>(async (ctx, next) => {
    if (!ctx.get('isPrivilegedRole')) {
        return apiResponseErrorWrapper(ctx, catalog.authenticationForbidden)
    }
    await next()
})

const isoTime = (value: Date | null) =>
    value === null ? null : value.toISOString()

const riskWarningFor = (tag: string) =>
    tag === 'GOOD_PAYER'
        ? null
        : `Borrower is currently tagged ${tag.replaceAll('_', ' ')}.`

const calculationInputFor = (
    loan: TStoredLoan,
    principalMinor: number,
): TLoanCalculationInput =>
    loan.interestMethod === 'FLAT_PERCENTAGE'
        ? {
              installmentCount: loan.installmentCount,
              interestMethod: loan.interestMethod,
              interestRateBasisPoints: loan.interestRateBasisPoints,
              paymentFrequency: loan.paymentFrequency,
              principalAmountCents: principalMinor,
              roundingMode: loan.roundingMode,
              termDays: loan.termDays,
          }
        : {
              fixedInterestAmountMinor: loan.fixedInterestAmountMinor!,
              installmentCount: loan.installmentCount,
              interestMethod: loan.interestMethod,
              paymentFrequency: loan.paymentFrequency,
              principalAmountCents: principalMinor,
              roundingMode: loan.roundingMode,
              termDays: loan.termDays,
          }

const formulaSnapshot = (loan: TStoredLoan) => ({
    fixedInterestAmountMinor: loan.fixedInterestAmountMinor,
    installmentCount: loan.installmentCount,
    interestMethod: loan.interestMethod,
    interestRateBasisPoints:
        loan.interestMethod === 'FLAT_PERCENTAGE'
            ? loan.interestRateBasisPoints
            : null,
    paymentFrequency: loan.paymentFrequency,
    roundingMode: loan.roundingMode,
    termDays: loan.termDays,
})

async function readRenewalLoan(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
): Promise<(TStoredLoan & { paymentTag: string }) | null> {
    const { borrower, loan, loanFormulaProfile } = ctx.get('dbSchema')
    const [record] = await ctx
        .get('dbClient')
        .select({
            actualOutstandingBalanceMinor: loan.actualOutstandingBalanceMinor,
            allowRenewalPrincipalChange: loan.allowRenewalPrincipalChange,
            borrowerId: loan.borrowerId,
            borrowerPublicId: borrower.publicId,
            completedInstallmentCount: loan.completedInstallmentCount,
            dailyPaymentAmountMinor: loan.dailyPaymentAmountMinor,
            finalInstallmentResiduePolicy: loan.finalInstallmentResiduePolicy,
            fixedInterestAmountMinor: loan.fixedInterestAmountMinor,
            formulaProfileId: loan.formulaProfileId,
            formulaProfileNameSnapshot: loan.formulaProfileNameSnapshot,
            formulaProfilePublicId: loanFormulaProfile.publicId,
            formulaProfileVersionSnapshot: loan.formulaProfileVersionSnapshot,
            id: loan.id,
            installmentCount: loan.installmentCount,
            interestMethod: loan.interestMethod,
            interestRateBasisPoints: loan.interestRateBasisPoints,
            loanNumber: loan.loanNumber,
            loanProductId: loan.loanProductId,
            loanProductNameSnapshot: loan.loanProductNameSnapshot,
            maximumPrincipalAmountMinorSnapshot:
                loan.maximumPrincipalAmountMinorSnapshot,
            minCompletedInstallments: loan.minCompletedInstallments,
            minimumPrincipalAmountMinorSnapshot:
                loan.minimumPrincipalAmountMinorSnapshot,
            partialCreditPolicy: loan.partialCreditPolicy,
            partialPaymentCreditMinor: loan.partialPaymentCreditMinor,
            paymentFrequency: loan.paymentFrequency,
            paymentTag: borrower.paymentTag,
            principalAmountMinor: loan.principalAmountMinor,
            publicId: loan.publicId,
            renewalSettlementMethod: loan.renewalSettlementMethod,
            roundingMode: loan.roundingMode,
            status: loan.status,
            termDays: loan.termDays,
            totalAmountPaidMinor: loan.totalAmountPaidMinor,
            timezone: loan.timezone,
        })
        .from(loan)
        .innerJoin(
            borrower,
            and(
                eq(borrower.organizationId, loan.organizationId),
                eq(borrower.id, loan.borrowerId),
            ),
        )
        .innerJoin(
            loanFormulaProfile,
            and(
                eq(loanFormulaProfile.organizationId, loan.organizationId),
                eq(loanFormulaProfile.id, loan.formulaProfileId),
            ),
        )
        .where(
            and(
                eq(loan.organizationId, getActiveOrganizationId(ctx)),
                eq(loan.publicId, publicId),
            ),
        )
        .limit(1)
    return record &&
        [
            'ACTIVE',
            'OVERDUE',
        ].includes(record.status)
        ? (record as TStoredLoan & { paymentTag: string })
        : null
}

async function quoteRenewal(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    input: renewalValidator.TRenewalQuoteInput,
) {
    const loan = await readRenewalLoan(ctx, input.previousLoanPublicId)
    if (!loan) throw new AppError(renewalLoanNotFound)
    const settings = await readRuntimeSystemSettings(ctx)
    if (!settings.enabledPaymentFrequencies.includes(loan.paymentFrequency)) {
        throw new AppError(renewalPaymentFrequencyDisabled)
    }
    if (
        (!loan.allowRenewalPrincipalChange &&
            input.renewalPrincipalMinor !== loan.principalAmountMinor) ||
        input.renewalPrincipalMinor <
            loan.minimumPrincipalAmountMinorSnapshot ||
        input.renewalPrincipalMinor > loan.maximumPrincipalAmountMinorSnapshot
    ) {
        throw new AppError(renewalPrincipalUnavailable)
    }
    const { loanInstallment } = ctx.get('dbSchema')
    const installments = await ctx
        .get('dbClient')
        .select({
            amountDueCents: loanInstallment.amountDueMinor,
            amountPaidCents: loanInstallment.amountPaidMinor,
            dueDate: loanInstallment.dueDate,
            installmentNumber: loanInstallment.installmentNumber,
        })
        .from(loanInstallment)
        .where(
            and(
                eq(
                    loanInstallment.organizationId,
                    getActiveOrganizationId(ctx),
                ),
                eq(loanInstallment.loanId, loan.id),
            ),
        )
        .orderBy(asc(loanInstallment.installmentNumber))
    if (installments.length === 0) throw new AppError(renewalNotEligible)
    const settlement = calculateRenewalQuote({
        installments,
        minimumRenewalCompletedInstallments: loan.minCompletedInstallments,
        partialCreditPolicy: loan.partialCreditPolicy,
        renewalPrincipalAmountCents: input.renewalPrincipalMinor,
        renewalSettlementMethod: loan.renewalSettlementMethod,
    })
    if (!settlement.isEligibleForRenewal) {
        throw new AppError(renewalNotEligible)
    }
    if (settlement.requiresManualReview) {
        throw new AppError(renewalManualReviewRequired)
    }
    if (settlement.additionalSettlementDueCents > 0) {
        throw new AppError(renewalAdditionalSettlementRequired)
    }
    const calculation = calculateLoan(
        calculationInputFor(loan, input.renewalPrincipalMinor),
    )
    const newInstallments = createInstallmentSchedule({
        firstDueDate: input.firstPaymentDate,
        installmentCount: loan.installmentCount,
        paymentFrequency: loan.paymentFrequency,
        totalPayableAmountCents: calculation.totalPayableAmountCents,
    })
    const carriedCredit = settlement.carriedForwardCreditCents
    const settlementPrincipalMinor = Math.min(
        settlement.actualOutstandingBalanceCents,
        Math.max(0, loan.principalAmountMinor - loan.totalAmountPaidMinor),
    )
    const settlementInterestMinor =
        settlement.actualOutstandingBalanceCents - settlementPrincipalMinor
    const partialCreditTransferMinor = Math.max(
        0,
        settlement.renewalSettlementBalanceCents -
            settlement.actualOutstandingBalanceCents -
            settlement.refundableCreditCents,
    )
    const initialAllocation =
        carriedCredit > 0
            ? allocatePaymentFifo(
                  newInstallments.map((installment) => ({
                      ...installment,
                      amountPaidCents: 0,
                  })),
                  carriedCredit,
              )
            : null
    return {
        approvalRequired:
            settings.requireRenewalApproval ||
            (loan.paymentTag === 'BAD_PAYER' &&
                settings.borrowerTagPolicy.requireBadPayerRenewalApproval) ||
            (loan.paymentTag === 'SCAMMER' &&
                settings.borrowerTagPolicy.requireScammerRenewalApproval),
        calculation,
        expectedCompletionDate: newInstallments.at(-1)!.dueDate,
        initialAllocation,
        installments: newInstallments,
        loan,
        partialCreditTransferMinor,
        settlementInterestMinor,
        settlementPrincipalMinor,
        settlement,
    }
}

function quoteOutput(
    quote: TRenewalQuote,
    input: renewalValidator.TRenewalQuoteInput,
) {
    return {
        borrowerPublicId: quote.loan.borrowerPublicId,
        cashReleaseAmountMinor: quote.settlement.cashReleaseAmountCents,
        dailyPaymentAmountMinor: quote.calculation.dailyPaymentAmountCents,
        expectedCompletionDate: quote.expectedCompletionDate,
        firstPaymentDate: input.firstPaymentDate,
        installments: quote.installments.map((installment) => ({
            amountDueMinor: installment.amountDueCents,
            dueDate: installment.dueDate,
            installmentNumber: installment.installmentNumber,
        })),
        interestAmountMinor: quote.calculation.interestAmountCents,
        partialCreditHandling: quote.loan.partialCreditPolicy,
        previousLoanNumber: quote.loan.loanNumber,
        previousLoanPublicId: quote.loan.publicId,
        previousCompletedInstallmentCount:
            quote.settlement.completedInstallmentCount,
        previousPartialCreditMinor: quote.settlement.partialPaymentCreditCents,
        previousRemainingInstallmentCount:
            quote.settlement.remainingInstallmentCount,
        renewalFormulaSnapshot: formulaSnapshot(quote.loan),
        renewalPrincipalMinor: input.renewalPrincipalMinor,
        renewalSettlementBalanceMinor:
            quote.settlement.renewalSettlementBalanceCents,
        riskWarning: riskWarningFor(quote.loan.paymentTag),
        totalPayableMinor: quote.calculation.totalPayableAmountCents,
    }
}

async function readRenewal(
    ctx: Parameters<typeof getActiveOrganizationId>[0],
    publicId: string,
) {
    const { borrower, loan, loanRenewal } = ctx.get('dbSchema')
    const oldLoan = alias(loan, 'renewal_old_loan')
    const newLoan = alias(loan, 'renewal_new_loan')
    const [record] = await ctx
        .get('dbClient')
        .select({
            approvedAt: loanRenewal.approvedAt,
            borrowerPublicId: borrower.publicId,
            cashReleaseAmountMinor: loanRenewal.cashReleaseAmountMinor,
            newLoanNumber: newLoan.loanNumber,
            newLoanPublicId: newLoan.publicId,
            partialCreditHandling: loanRenewal.partialCreditHandling,
            previousCompletedInstallmentCount:
                loanRenewal.previousCompletedInstallmentCount,
            previousLoanNumber: oldLoan.loanNumber,
            previousLoanPublicId: oldLoan.publicId,
            previousPartialCreditMinor: loanRenewal.previousPartialCreditMinor,
            previousRemainingInstallmentCount:
                loanRenewal.previousRemainingInstallmentCount,
            processedAt: loanRenewal.processedAt,
            publicId: loanRenewal.publicId,
            renewalPrincipalMinor: loanRenewal.renewalPrincipalAmountMinor,
            renewalSettlementBalanceMinor:
                loanRenewal.renewalSettlementBalanceMinor,
            status: loanRenewal.status,
        })
        .from(loanRenewal)
        .innerJoin(
            oldLoan,
            and(
                eq(oldLoan.organizationId, loanRenewal.organizationId),
                eq(oldLoan.id, loanRenewal.oldLoanId),
            ),
        )
        .innerJoin(
            newLoan,
            and(
                eq(newLoan.organizationId, loanRenewal.organizationId),
                eq(newLoan.id, loanRenewal.newLoanId),
            ),
        )
        .innerJoin(
            borrower,
            and(
                eq(borrower.organizationId, loanRenewal.organizationId),
                eq(borrower.id, oldLoan.borrowerId),
            ),
        )
        .where(
            and(
                eq(loanRenewal.organizationId, getActiveOrganizationId(ctx)),
                eq(loanRenewal.publicId, publicId),
            ),
        )
        .limit(1)
    return record
        ? {
              ...record,
              approvedAt: isoTime(record.approvedAt),
              newLoanNumber: record.newLoanNumber,
              newLoanPublicId: record.newLoanPublicId,
              processedAt: record.processedAt.toISOString(),
          }
        : null
}

export const renewalsRoute = new Hono<THonoInstance>()
    .post(
        '/quote',
        tenantGuard,
        validateRequest('json', renewalValidator.renewalQuoteInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const quote = await quoteRenewal(ctx, input)
            return apiResponseOkWrapper(ctx, {
                data: quoteOutput(quote, input),
            })
        },
    )
    .post(
        '/',
        tenantGuard,
        privilegedGuard,
        validateRequest('json', renewalValidator.renewalCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { loanRenewal } = ctx.get('dbSchema')
            const db = ctx.get('dbClient')
            const [existing] = await db
                .select({ publicId: loanRenewal.publicId })
                .from(loanRenewal)
                .where(
                    and(
                        eq(loanRenewal.organizationId, organizationId),
                        eq(loanRenewal.idempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)
            if (existing) {
                const replay = await readRenewal(ctx, existing.publicId)
                if (!replay) throw new AppError(renewalConflict)
                return apiResponseOkWrapper(ctx, { data: replay })
            }

            const quote = await quoteRenewal(ctx, input)
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
            const renewalPublicId = uuidv7()
            const newLoanPublicId = uuidv7()
            const renewalCashTransactionPublicId = uuidv7()
            const refundCashTransactionPublicId = uuidv7()
            const now = Date.now()
            const actorId = ctx.get('user')!.id
            const carriedCredit = quote.settlement.carriedForwardCreditCents
            const initialAllocation = quote.initialAllocation
            const auditData = auditTrailLogger.prepare({
                action: 'create',
                component: 'renewal',
                description: quote.approvalRequired
                    ? 'Loan renewal approved and released'
                    : 'Loan renewed',
                records: [
                    {
                        table: 'loan',
                        id: quote.loan.publicId,
                        oldData: { status: quote.loan.status },
                        newData: { status: 'RENEWED' },
                    },
                    {
                        table: 'loan',
                        id: newLoanPublicId,
                        newData: {
                            interestAmountMinor:
                                quote.calculation.interestAmountCents,
                            loanNumber: `LN-${newLoanPublicId.toUpperCase()}`,
                            principalAmountMinor: input.renewalPrincipalMinor,
                            status: 'ACTIVE',
                            totalPayableAmountMinor:
                                quote.calculation.totalPayableAmountCents,
                        },
                    },
                    {
                        table: 'loan_renewal',
                        id: renewalPublicId,
                        newData: {
                            cashReleaseAmountMinor:
                                quote.settlement.cashReleaseAmountCents,
                            partialCreditHandling:
                                quote.loan.partialCreditPolicy,
                            previousCompletedInstallmentCount:
                                quote.settlement.completedInstallmentCount,
                            previousLoanNumber: quote.loan.loanNumber,
                            previousPartialCreditMinor:
                                quote.settlement.partialPaymentCreditCents,
                            previousRemainingInstallmentCount:
                                quote.settlement.remainingInstallmentCount,
                            renewalPrincipalAmountMinor:
                                input.renewalPrincipalMinor,
                            renewalSettlementBalanceMinor:
                                quote.settlement.renewalSettlementBalanceCents,
                            status: 'RELEASED',
                        },
                    },
                ],
            })
            const database = db.$client
            const statements = [
                database
                    .prepare(
                        `UPDATE loan
                         SET status = 'RENEWED', updated_by_user_id = ?, updated_at = ?
                         WHERE organization_id = ? AND public_id = ?
                           AND status IN ('ACTIVE', 'OVERDUE')
                           AND NOT EXISTS (
                               SELECT 1 FROM loan_renewal
                               WHERE organization_id = loan.organization_id
                                 AND old_loan_id = loan.id
                           )`,
                    )
                    .bind(actorId, now, organizationId, quote.loan.publicId),
                database
                    .prepare(
                        `INSERT INTO loan (
                             public_id, organization_id, loan_number, borrower_id, loan_product_id,
                             formula_profile_id, loan_product_name_snapshot, formula_profile_name_snapshot,
                             formula_profile_version_snapshot, interest_method, interest_rate_basis_points,
                             fixed_interest_amount_minor, principal_amount_minor,
                             minimum_principal_amount_minor_snapshot,
                             maximum_principal_amount_minor_snapshot, interest_amount_minor,
                             total_payable_amount_minor, term_days, payment_frequency, installment_count,
                             installment_amount_minor, daily_payment_amount_minor, timezone, rounding_mode,
                             final_installment_residue_policy, renewal_settlement_method,
                             partial_credit_policy, min_completed_installments,
                             allow_renewal_principal_change, release_date, first_payment_date,
                             expected_completion_date, total_amount_paid_minor,
                             completed_installment_count, partial_payment_credit_minor,
                             actual_outstanding_balance_minor, status, created_by_user_id,
                             updated_by_user_id, approved_by_user_id, approved_at,
                             released_by_user_id, released_at
                         ) SELECT ?, organization_id, ?, borrower_id, loan_product_id,
                                  formula_profile_id, loan_product_name_snapshot, formula_profile_name_snapshot,
                                  formula_profile_version_snapshot, interest_method, interest_rate_basis_points,
                                  fixed_interest_amount_minor, ?, minimum_principal_amount_minor_snapshot,
                                  maximum_principal_amount_minor_snapshot, ?, ?, term_days, payment_frequency,
                                  installment_count, ?, ?, timezone, rounding_mode,
                                  final_installment_residue_policy, renewal_settlement_method,
                                  partial_credit_policy, min_completed_installments,
                                  allow_renewal_principal_change, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?
                           FROM loan
                          WHERE organization_id = ? AND public_id = ?
                            AND status = 'RENEWED' AND updated_at = ? AND changes() = 1`,
                    )
                    .bind(
                        newLoanPublicId,
                        `LN-${newLoanPublicId.toUpperCase()}`,
                        input.renewalPrincipalMinor,
                        quote.calculation.interestAmountCents,
                        quote.calculation.totalPayableAmountCents,
                        quote.calculation.baseInstallmentAmountCents,
                        quote.calculation.dailyPaymentAmountCents,
                        input.releaseDate,
                        input.firstPaymentDate,
                        quote.expectedCompletionDate,
                        carriedCredit,
                        initialAllocation?.completedInstallmentCount ?? 0,
                        initialAllocation?.partialPaymentCreditCents ?? 0,
                        quote.calculation.totalPayableAmountCents -
                            carriedCredit,
                        actorId,
                        actorId,
                        actorId,
                        now,
                        actorId,
                        now,
                        organizationId,
                        quote.loan.publicId,
                        now,
                    ),
                database
                    .prepare(
                        `INSERT INTO loan_renewal (
                             public_id, organization_id, borrower_id, old_loan_id, new_loan_id,
                             previous_loan_number, renewal_settlement_method,
                             partial_credit_handling, previous_principal_amount_minor,
                             previous_completed_installment_count,
                             previous_remaining_installment_count,
                             previous_partial_credit_minor, renewal_principal_amount_minor,
                             renewal_settlement_balance_minor, cash_release_amount_minor,
                             partial_credit_applied_to_settlement_minor,
                             partial_credit_carried_forward_minor,
                             partial_credit_refunded_minor, manual_review_required,
                             manual_review_reason, status, idempotency_key,
                             processed_by_user_id, processed_at, approved_by_user_id,
                             approved_at, released_by_user_id, released_at
                         ) SELECT ?, old_loan.organization_id, old_loan.borrower_id, old_loan.id, new_loan.id,
                                  ?, old_loan.renewal_settlement_method,
                                  old_loan.partial_credit_policy,
                                  old_loan.principal_amount_minor, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0,
                                  NULL, 'RELEASED', ?, ?, ?, ?, ?, ?, ?
                           FROM loan AS old_loan
                           INNER JOIN loan AS new_loan
                             ON new_loan.organization_id = old_loan.organization_id
                            AND new_loan.public_id = ?
                          WHERE old_loan.organization_id = ?
                            AND old_loan.public_id = ? AND old_loan.status = 'RENEWED'
                            AND old_loan.updated_at = ? AND changes() = 1`,
                    )
                    .bind(
                        renewalPublicId,
                        quote.loan.loanNumber,
                        quote.settlement.completedInstallmentCount,
                        quote.settlement.remainingInstallmentCount,
                        quote.settlement.partialPaymentCreditCents,
                        input.renewalPrincipalMinor,
                        quote.settlement.renewalSettlementBalanceCents,
                        quote.settlement.cashReleaseAmountCents,
                        quote.loan.partialCreditPolicy === 'APPLY_TO_SETTLEMENT'
                            ? quote.settlement.partialPaymentCreditCents
                            : 0,
                        carriedCredit,
                        quote.settlement.refundableCreditCents,
                        input.idempotencyKey,
                        actorId,
                        now,
                        actorId,
                        now,
                        actorId,
                        now,
                        newLoanPublicId,
                        organizationId,
                        quote.loan.publicId,
                        now,
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
                ...quote.installments.map((installment) => {
                    const allocation = initialAllocation?.installments.find(
                        (entry) =>
                            entry.installmentNumber ===
                            installment.installmentNumber,
                    )
                    const amountPaidMinor = allocation?.amountPaidCents ?? 0
                    const status =
                        amountPaidMinor === installment.amountDueCents
                            ? 'PAID'
                            : amountPaidMinor > 0
                              ? 'PARTIAL'
                              : 'UPCOMING'
                    return database
                        .prepare(
                            `INSERT INTO loan_installment (
                                 public_id, organization_id, loan_id, installment_number,
                                 payment_frequency, period_start, period_end, due_date,
                                 amount_due_minor, amount_paid_minor, paid_at, status
                             ) SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?
                               FROM loan
                              WHERE organization_id = ? AND public_id = ?
                                AND status = 'ACTIVE' AND released_at = ?`,
                        )
                        .bind(
                            uuidv7(),
                            organizationId,
                            installment.installmentNumber,
                            quote.loan.paymentFrequency,
                            installment.dueDate,
                            installment.dueDate,
                            installment.dueDate,
                            installment.amountDueCents,
                            amountPaidMinor,
                            amountPaidMinor > 0 ? now : null,
                            status,
                            organizationId,
                            newLoanPublicId,
                            now,
                        )
                }),
                ...(quote.settlement.cashReleaseAmountCents > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO cash_transaction (
                                       public_id, organization_id, transaction_number,
                                       transaction_type, direction, borrower_id, loan_id,
                                       loan_renewal_id, amount_minor, transaction_at,
                                       idempotency_key, created_by_user_id
                                   ) SELECT ?, ?, ?, 'RENEWAL_RELEASE', 'CASH_OUT', ?, loan.id,
                                            renewal.id, ?, ?, ?, ?
                                       FROM loan
                                       INNER JOIN loan_renewal AS renewal
                                         ON renewal.organization_id = loan.organization_id
                                        AND renewal.new_loan_id = loan.id
                                      WHERE loan.organization_id = ? AND loan.public_id = ?
                                        AND loan.status = 'ACTIVE' AND loan.released_at = ?`,
                              )
                              .bind(
                                  renewalCashTransactionPublicId,
                                  organizationId,
                                  `CT-REN-${renewalPublicId.toUpperCase()}`,
                                  quote.loan.borrowerId,
                                  quote.settlement.cashReleaseAmountCents,
                                  now,
                                  `renewal:${renewalPublicId}`,
                                  actorId,
                                  organizationId,
                                  newLoanPublicId,
                                  now,
                              ),
                      ]
                    : []),
                ...(quote.settlement.refundableCreditCents > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO cash_transaction (
                                       public_id, organization_id, transaction_number,
                                       transaction_type, direction, borrower_id, loan_id,
                                       loan_renewal_id, amount_minor, transaction_at,
                                       idempotency_key, created_by_user_id
                                   ) SELECT ?, ?, ?, 'PARTIAL_CREDIT_REFUND', 'CASH_OUT', ?, loan.id,
                                            renewal.id, ?, ?, ?, ?
                                       FROM loan
                                       INNER JOIN loan_renewal AS renewal
                                         ON renewal.organization_id = loan.organization_id
                                        AND renewal.old_loan_id = loan.id
                                      WHERE loan.organization_id = ? AND loan.public_id = ?
                                        AND loan.status = 'RENEWED'`,
                              )
                              .bind(
                                  refundCashTransactionPublicId,
                                  organizationId,
                                  `CT-REF-${renewalPublicId.toUpperCase()}`,
                                  quote.loan.borrowerId,
                                  quote.settlement.refundableCreditCents,
                                  now,
                                  `refund:${renewalPublicId}`,
                                  actorId,
                                  organizationId,
                                  quote.loan.publicId,
                              ),
                      ]
                    : []),
                database
                    .prepare(
                        `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, loan_renewal_id, cash_transaction_id, transaction_at, created_by_user_id)
                         SELECT ?, ?, fund.id, ?, 'RENEWAL_RELEASE', 'OUT', ?, loan.id, renewal.id, cash.id, ?, ?
                           FROM company_fund AS fund
                           INNER JOIN loan ON loan.organization_id = fund.organization_id
                           INNER JOIN loan_renewal AS renewal ON renewal.organization_id = loan.organization_id AND renewal.new_loan_id = loan.id
                           LEFT JOIN cash_transaction AS cash ON cash.organization_id = loan.organization_id AND cash.public_id = ?
                          WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                            AND loan.public_id = ? AND renewal.public_id = ?`,
                    )
                    .bind(
                        uuidv7(),
                        organizationId,
                        `CAP-REN-${renewalPublicId.toUpperCase()}`,
                        input.renewalPrincipalMinor,
                        now,
                        actorId,
                        quote.settlement.cashReleaseAmountCents > 0
                            ? renewalCashTransactionPublicId
                            : null,
                        organizationId,
                        newLoanPublicId,
                        renewalPublicId,
                    ),
                ...(quote.settlementPrincipalMinor > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, loan_renewal_id, transaction_at, created_by_user_id)
                                   SELECT ?, ?, fund.id, ?, 'RENEWAL_SETTLEMENT_PRINCIPAL', 'IN', ?, loan.id, renewal.id, ?, ?
                                     FROM company_fund AS fund
                                     INNER JOIN loan ON loan.organization_id = fund.organization_id
                                     INNER JOIN loan_renewal AS renewal ON renewal.organization_id = loan.organization_id AND renewal.old_loan_id = loan.id
                                    WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                                      AND loan.public_id = ? AND renewal.public_id = ?`,
                              )
                              .bind(
                                  uuidv7(),
                                  organizationId,
                                  `CAP-REN-PRI-${renewalPublicId.toUpperCase()}`,
                                  quote.settlementPrincipalMinor,
                                  now,
                                  actorId,
                                  organizationId,
                                  quote.loan.publicId,
                                  renewalPublicId,
                              ),
                      ]
                    : []),
                ...(quote.settlementInterestMinor > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, loan_renewal_id, transaction_at, created_by_user_id)
                                   SELECT ?, ?, fund.id, ?, 'RENEWAL_SETTLEMENT_INTEREST', 'IN', ?, loan.id, renewal.id, ?, ?
                                     FROM company_fund AS fund
                                     INNER JOIN loan ON loan.organization_id = fund.organization_id
                                     INNER JOIN loan_renewal AS renewal ON renewal.organization_id = loan.organization_id AND renewal.old_loan_id = loan.id
                                    WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                                      AND loan.public_id = ? AND renewal.public_id = ?`,
                              )
                              .bind(
                                  uuidv7(),
                                  organizationId,
                                  `CAP-REN-INT-${renewalPublicId.toUpperCase()}`,
                                  quote.settlementInterestMinor,
                                  now,
                                  actorId,
                                  organizationId,
                                  quote.loan.publicId,
                                  renewalPublicId,
                              ),
                      ]
                    : []),
                ...(quote.partialCreditTransferMinor > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, loan_renewal_id, transaction_at, created_by_user_id)
                                   SELECT ?, ?, fund.id, ?, 'RENEWAL_PARTIAL_CREDIT_TRANSFER', 'IN', ?, loan.id, renewal.id, ?, ?
                                     FROM company_fund AS fund
                                     INNER JOIN loan ON loan.organization_id = fund.organization_id
                                     INNER JOIN loan_renewal AS renewal ON renewal.organization_id = loan.organization_id AND renewal.new_loan_id = loan.id
                                    WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                                      AND loan.public_id = ? AND renewal.public_id = ?`,
                              )
                              .bind(
                                  uuidv7(),
                                  organizationId,
                                  `CAP-REN-CREDIT-${renewalPublicId.toUpperCase()}`,
                                  quote.partialCreditTransferMinor,
                                  now,
                                  actorId,
                                  organizationId,
                                  newLoanPublicId,
                                  renewalPublicId,
                              ),
                      ]
                    : []),
                ...(quote.settlement.refundableCreditCents > 0
                    ? [
                          database
                              .prepare(
                                  `INSERT INTO capital_transaction (public_id, organization_id, company_fund_id, transaction_number, transaction_type, direction, amount_minor, loan_id, loan_renewal_id, cash_transaction_id, transaction_at, created_by_user_id)
                                   SELECT ?, ?, fund.id, ?, 'REFUND', 'OUT', ?, loan.id, renewal.id, cash.id, ?, ?
                                     FROM company_fund AS fund
                                     INNER JOIN loan ON loan.organization_id = fund.organization_id
                                     INNER JOIN loan_renewal AS renewal ON renewal.organization_id = loan.organization_id AND renewal.old_loan_id = loan.id
                                     INNER JOIN cash_transaction AS cash ON cash.organization_id = loan.organization_id AND cash.public_id = ?
                                    WHERE fund.organization_id = ? AND fund.is_primary = TRUE
                                      AND loan.public_id = ? AND renewal.public_id = ?`,
                              )
                              .bind(
                                  uuidv7(),
                                  organizationId,
                                  `CAP-REF-${renewalPublicId.toUpperCase()}`,
                                  quote.settlement.refundableCreditCents,
                                  now,
                                  actorId,
                                  refundCashTransactionPublicId,
                                  organizationId,
                                  quote.loan.publicId,
                                  renewalPublicId,
                              ),
                      ]
                    : []),
            ]
            const results = await database.batch(statements)
            if (results[2].meta.changes !== 1) {
                const replay = await db
                    .select({ publicId: loanRenewal.publicId })
                    .from(loanRenewal)
                    .where(
                        and(
                            eq(loanRenewal.organizationId, organizationId),
                            eq(
                                loanRenewal.idempotencyKey,
                                input.idempotencyKey,
                            ),
                        ),
                    )
                    .limit(1)
                if (replay[0]) {
                    const record = await readRenewal(ctx, replay[0].publicId)
                    if (record)
                        return apiResponseOkWrapper(ctx, { data: record })
                }
                throw new AppError(renewalConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)
            const record = await readRenewal(ctx, renewalPublicId)
            if (!record) throw new AppError(renewalConflict)
            return apiResponseOkWrapper(ctx, { data: record, status: 201 })
        },
    )
    .on(
        'QUERY',
        '/readMany',
        tenantGuard,
        validateRequest('json', renewalValidator.renewalReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { borrower, loan, loanRenewal } = ctx.get('dbSchema')
            const oldLoan = alias(loan, 'renewal_list_old_loan')
            const { borrowerPublicId, previousLoanPublicId, status } =
                input.filters
            const where = and(
                eq(loanRenewal.organizationId, getActiveOrganizationId(ctx)),
                ...(borrowerPublicId
                    ? [eq(borrower.publicId, borrowerPublicId)]
                    : []),
                ...(previousLoanPublicId
                    ? [eq(oldLoan.publicId, previousLoanPublicId)]
                    : []),
                ...(status ? [eq(loanRenewal.status, status)] : []),
            )
            const [countRow] = await ctx
                .get('dbClient')
                .select({ count: countFn(loanRenewal.id) })
                .from(loanRenewal)
                .innerJoin(
                    oldLoan,
                    and(
                        eq(oldLoan.organizationId, loanRenewal.organizationId),
                        eq(oldLoan.id, loanRenewal.oldLoanId),
                    ),
                )
                .innerJoin(
                    borrower,
                    and(
                        eq(borrower.organizationId, loanRenewal.organizationId),
                        eq(borrower.id, oldLoan.borrowerId),
                    ),
                )
                .where(where)
            const rows = await ctx
                .get('dbClient')
                .select({ publicId: loanRenewal.publicId })
                .from(loanRenewal)
                .innerJoin(
                    oldLoan,
                    and(
                        eq(oldLoan.organizationId, loanRenewal.organizationId),
                        eq(oldLoan.id, loanRenewal.oldLoanId),
                    ),
                )
                .innerJoin(
                    borrower,
                    and(
                        eq(borrower.organizationId, loanRenewal.organizationId),
                        eq(borrower.id, oldLoan.borrowerId),
                    ),
                )
                .where(where)
                .orderBy(
                    input.sortOrder === 'asc'
                        ? asc(loanRenewal.processedAt)
                        : desc(loanRenewal.processedAt),
                )
                .limit(input.limit)
                .offset(input.offset)
            const data = (
                await Promise.all(
                    rows.map((row) => readRenewal(ctx, row.publicId)),
                )
            ).filter(
                (record): record is NonNullable<typeof record> =>
                    record !== null,
            )
            return apiResponsePaginatedOkWrapper(ctx, {
                count: countRow.count,
                data,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .get(
        '/read/:publicId',
        tenantGuard,
        validateRequest('param', renewalValidator.renewalReadInputSchema),
        async (ctx) => {
            const { publicId } = ctx.req.valid('param')
            const record = await readRenewal(ctx, publicId)
            if (!record) throw new AppError(renewalNotFound)
            return apiResponseOkWrapper(ctx, { data: record })
        },
    )

export default renewalsRoute
export type RenewalsRouteType = ApplyGlobalResponse<
    typeof renewalsRoute,
    import('../../types.js').TGlobalApiResponses
>
