/**
 * Pure, deterministic financial calculations for the backoffice API.
 *
 * Amounts are integer centavos and rates are integer basis points. This module
 * deliberately has no persistence or request-layer dependencies so a formula
 * profile snapshot can reproduce a loan quote indefinitely.
 */

export const BASIS_POINTS_PER_WHOLE = 10_000

export type TPaymentFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export type TInterestMethod = 'FLAT_PERCENTAGE' | 'FIXED_AMOUNT'

export type TPartialCreditPolicy =
    'CARRY_FORWARD' | 'APPLY_TO_SETTLEMENT' | 'REFUND' | 'MANUAL_REVIEW'

export type TRoundingMode = 'HALF_UP' | 'DOWN' | 'UP'

export type TRenewalSettlementMethod =
    'COMPLETED_INSTALLMENT_BALANCE' | 'EXACT_OUTSTANDING_BALANCE'

type TLoanCalculationBaseInput = {
    principalAmountCents: number
    termDays: number
    installmentCount: number
    paymentFrequency: TPaymentFrequency
    roundingMode: TRoundingMode
}

export type TLoanCalculationInput =
    | (TLoanCalculationBaseInput & {
          interestMethod: 'FLAT_PERCENTAGE'
          interestRateBasisPoints: number
      })
    | (TLoanCalculationBaseInput & {
          fixedInterestAmountMinor: number
          interestMethod: 'FIXED_AMOUNT'
      })

export type TLoanCalculation = TLoanCalculationInput & {
    interestAmountCents: number
    totalPayableAmountCents: number
    baseInstallmentAmountCents: number
    installmentResidueCents: number
    dailyPaymentAmountCents: number
}

export type TInstallmentScheduleInput = Pick<
    TLoanCalculation,
    'installmentCount' | 'paymentFrequency' | 'totalPayableAmountCents'
> & {
    firstDueDate: string
}

export type TInstallment = {
    installmentNumber: number
    dueDate: string
    amountDueCents: number
}

export type TInstallmentPaymentState = TInstallment & {
    amountPaidCents: number
}

export type TPaymentAllocation = {
    installmentNumber: number
    amountAllocatedCents: number
    amountPaidAfterCents: number
    amountRemainingAfterCents: number
}

export type TPaymentAllocationResult = {
    allocations: TPaymentAllocation[]
    installments: TInstallmentPaymentState[]
    paymentAmountCents: number
    amountAppliedCents: number
    unappliedAmountCents: number
    completedInstallmentCount: number
    partialPaymentCreditCents: number
    actualOutstandingBalanceCents: number
}

export type TRenewalQuoteInput = {
    installments: readonly TInstallmentPaymentState[]
    renewalPrincipalAmountCents: number
    minimumRenewalCompletedInstallments: number
    partialCreditPolicy: TPartialCreditPolicy
    renewalSettlementMethod: TRenewalSettlementMethod
}

export type TRenewalQuote = {
    completedInstallmentCount: number
    remainingInstallmentCount: number
    isEligibleForRenewal: boolean
    partialPaymentCreditCents: number
    totalPayableAmountCents: number
    totalPaidAmountCents: number
    actualOutstandingBalanceCents: number
    renewalSettlementBalanceCents: number
    carriedForwardCreditCents: number
    refundableCreditCents: number
    manualReviewCreditCents: number
    requiresManualReview: boolean
    cashReleaseAmountCents: number
    additionalSettlementDueCents: number
}

function assertSafeNonNegativeInteger(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative safe integer.`)
    }
}

function assertPositiveSafeInteger(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive safe integer.`)
    }
}

function assertPaymentFrequency(
    value: unknown,
): asserts value is TPaymentFrequency {
    if (value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY') return
    throw new Error('Payment frequency must be DAILY, WEEKLY, or MONTHLY.')
}

function assertInterestMethod(
    value: unknown,
): asserts value is TInterestMethod {
    if (value === 'FLAT_PERCENTAGE' || value === 'FIXED_AMOUNT') return
    throw new Error('Interest method must be FLAT_PERCENTAGE or FIXED_AMOUNT.')
}

function assertPartialCreditPolicy(
    value: unknown,
): asserts value is TPartialCreditPolicy {
    if (
        value === 'CARRY_FORWARD' ||
        value === 'APPLY_TO_SETTLEMENT' ||
        value === 'REFUND' ||
        value === 'MANUAL_REVIEW'
    ) {
        return
    }
    throw new Error(
        'Partial credit policy must be CARRY_FORWARD, APPLY_TO_SETTLEMENT, REFUND, or MANUAL_REVIEW.',
    )
}

function assertRoundingMode(value: unknown): asserts value is TRoundingMode {
    if (value === 'HALF_UP' || value === 'DOWN' || value === 'UP') return
    throw new Error('Rounding mode must be HALF_UP, DOWN, or UP.')
}

function assertRenewalSettlementMethod(
    value: unknown,
): asserts value is TRenewalSettlementMethod {
    if (
        value === 'COMPLETED_INSTALLMENT_BALANCE' ||
        value === 'EXACT_OUTSTANDING_BALANCE'
    ) {
        return
    }
    throw new Error(
        'Renewal settlement method must be COMPLETED_INSTALLMENT_BALANCE or EXACT_OUTSTANDING_BALANCE.',
    )
}

function safeAdd(left: number, right: number, label: string) {
    const result = left + right
    if (!Number.isSafeInteger(result)) {
        throw new Error(`${label} exceeds the supported safe-integer range.`)
    }
    return result
}

function safeMultiply(left: number, right: number, label: string) {
    const result = left * right
    if (!Number.isSafeInteger(result)) {
        throw new Error(`${label} exceeds the supported safe-integer range.`)
    }
    return result
}

function sumAmounts(values: readonly number[], label: string) {
    return values.reduce((total, value) => safeAdd(total, value, label), 0)
}

function parseDateOnly(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) throw new Error('Dates must use YYYY-MM-DD format.')

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error('Dates must be valid calendar dates.')
    }
    return { day, month, year }
}

function formatDateOnly(year: number, month: number, day: number) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addCalendarDays(date: string, days: number) {
    const parsed = parseDateOnly(date)
    const result = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
    result.setUTCDate(result.getUTCDate() + days)
    return formatDateOnly(
        result.getUTCFullYear(),
        result.getUTCMonth() + 1,
        result.getUTCDate(),
    )
}

function addCalendarMonths(date: string, months: number) {
    const parsed = parseDateOnly(date)
    const zeroBasedMonth = parsed.month - 1 + months
    const year = parsed.year + Math.floor(zeroBasedMonth / 12)
    const month = (((zeroBasedMonth % 12) + 12) % 12) + 1
    return formatDateOnly(
        year,
        month,
        Math.min(parsed.day, daysInMonth(year, month)),
    )
}

function installmentAmounts(
    totalPayableAmountCents: number,
    installmentCount: number,
) {
    const baseInstallmentAmountCents = Math.floor(
        totalPayableAmountCents / installmentCount,
    )
    const installmentResidueCents = totalPayableAmountCents % installmentCount
    return {
        baseInstallmentAmountCents,
        installmentResidueCents,
    }
}

function roundDivision(
    numerator: number,
    denominator: number,
    roundingMode: TRoundingMode,
) {
    if (roundingMode === 'DOWN') return Math.floor(numerator / denominator)
    if (roundingMode === 'UP') return Math.ceil(numerator / denominator)
    return Math.floor((numerator + Math.floor(denominator / 2)) / denominator)
}

function assertInstallments(installments: readonly TInstallmentPaymentState[]) {
    if (installments.length === 0) {
        throw new Error('At least one installment is required.')
    }
    let previousNumber = 0
    for (const installment of installments) {
        assertPositiveSafeInteger(
            installment.installmentNumber,
            'Installment number',
        )
        if (installment.installmentNumber <= previousNumber) {
            throw new Error('Installments must be strictly ordered by number.')
        }
        previousNumber = installment.installmentNumber
        parseDateOnly(installment.dueDate)
        assertPositiveSafeInteger(
            installment.amountDueCents,
            'Installment amount due',
        )
        assertSafeNonNegativeInteger(
            installment.amountPaidCents,
            'Installment amount paid',
        )
        if (installment.amountPaidCents > installment.amountDueCents) {
            throw new Error(
                'Installment payments cannot exceed the amount due.',
            )
        }
    }
}

function completedInstallmentCount(
    installments: readonly TInstallmentPaymentState[],
) {
    let completed = 0
    for (const installment of installments) {
        if (installment.amountPaidCents !== installment.amountDueCents) break
        completed += 1
    }
    return completed
}

/** Calculates a profile-snapshotted interest amount in whole centavos. */
export function calculateLoan(input: TLoanCalculationInput): TLoanCalculation {
    assertPositiveSafeInteger(input.principalAmountCents, 'Principal amount')
    assertPositiveSafeInteger(input.termDays, 'Term days')
    assertPositiveSafeInteger(input.installmentCount, 'Installment count')
    assertPaymentFrequency(input.paymentFrequency)
    assertInterestMethod(input.interestMethod)
    assertRoundingMode(input.roundingMode)

    const interestAmountCents =
        input.interestMethod === 'FLAT_PERCENTAGE'
            ? (() => {
                  assertSafeNonNegativeInteger(
                      input.interestRateBasisPoints,
                      'Interest rate basis points',
                  )
                  return roundDivision(
                      safeMultiply(
                          input.principalAmountCents,
                          input.interestRateBasisPoints,
                          'Interest calculation',
                      ),
                      BASIS_POINTS_PER_WHOLE,
                      input.roundingMode,
                  )
              })()
            : (() => {
                  assertPositiveSafeInteger(
                      input.fixedInterestAmountMinor,
                      'Fixed interest amount',
                  )
                  return input.fixedInterestAmountMinor
              })()
    const totalPayableAmountCents = safeAdd(
        input.principalAmountCents,
        interestAmountCents,
        'Total payable amount',
    )
    const { baseInstallmentAmountCents, installmentResidueCents } =
        installmentAmounts(totalPayableAmountCents, input.installmentCount)

    return {
        ...input,
        interestAmountCents,
        totalPayableAmountCents,
        baseInstallmentAmountCents,
        installmentResidueCents,
        dailyPaymentAmountCents: Math.floor(
            totalPayableAmountCents / input.termDays,
        ),
    }
}

/**
 * Generates calendar schedules from a stored first due date. Remainder
 * centavos are assigned to the final installment so the schedule always sums
 * exactly to the contractual total.
 */
export function createInstallmentSchedule(
    input: TInstallmentScheduleInput,
): TInstallment[] {
    assertPositiveSafeInteger(input.installmentCount, 'Installment count')
    assertPositiveSafeInteger(
        input.totalPayableAmountCents,
        'Total payable amount',
    )
    assertPaymentFrequency(input.paymentFrequency)
    parseDateOnly(input.firstDueDate)

    const { baseInstallmentAmountCents, installmentResidueCents } =
        installmentAmounts(
            input.totalPayableAmountCents,
            input.installmentCount,
        )

    return Array.from(
        { length: input.installmentCount },
        (_, index): TInstallment => {
            const offset = index + 1
            const dueDate =
                input.paymentFrequency === 'DAILY'
                    ? addCalendarDays(input.firstDueDate, index)
                    : input.paymentFrequency === 'WEEKLY'
                      ? addCalendarDays(input.firstDueDate, index * 7)
                      : addCalendarMonths(input.firstDueDate, index)
            return {
                installmentNumber: offset,
                dueDate,
                amountDueCents:
                    baseInstallmentAmountCents +
                    (index === input.installmentCount - 1
                        ? installmentResidueCents
                        : 0),
            }
        },
    )
}

/** Allocates one posted payment to the earliest unpaid installments first. */
export function allocatePaymentFifo(
    installments: readonly TInstallmentPaymentState[],
    paymentAmountCents: number,
): TPaymentAllocationResult {
    assertInstallments(installments)
    assertPositiveSafeInteger(paymentAmountCents, 'Payment amount')

    let remainingPaymentCents = paymentAmountCents
    const allocations: TPaymentAllocation[] = []
    const updatedInstallments = installments.map((installment) => {
        const amountRemainingCents =
            installment.amountDueCents - installment.amountPaidCents
        const amountAllocatedCents = Math.min(
            remainingPaymentCents,
            amountRemainingCents,
        )
        const amountPaidAfterCents = safeAdd(
            installment.amountPaidCents,
            amountAllocatedCents,
            'Installment payment amount',
        )
        remainingPaymentCents -= amountAllocatedCents
        if (amountAllocatedCents > 0) {
            allocations.push({
                installmentNumber: installment.installmentNumber,
                amountAllocatedCents,
                amountPaidAfterCents,
                amountRemainingAfterCents:
                    installment.amountDueCents - amountPaidAfterCents,
            })
        }
        return {
            ...installment,
            amountPaidCents: amountPaidAfterCents,
        }
    })
    const completed = completedInstallmentCount(updatedInstallments)
    const firstIncomplete = updatedInstallments[completed]
    const totalOutstanding = sumAmounts(
        updatedInstallments.map(
            (installment) =>
                installment.amountDueCents - installment.amountPaidCents,
        ),
        'Outstanding balance',
    )

    return {
        allocations,
        installments: updatedInstallments,
        paymentAmountCents,
        amountAppliedCents: paymentAmountCents - remainingPaymentCents,
        unappliedAmountCents: remainingPaymentCents,
        completedInstallmentCount: completed,
        partialPaymentCreditCents: firstIncomplete?.amountPaidCents ?? 0,
        actualOutstandingBalanceCents: totalOutstanding,
    }
}

/**
 * Quotes a completed-installment renewal. CARRY_FORWARD intentionally leaves
 * a partial installment credit out of settlement, preserving it for the new
 * loan instead of silently consuming it.
 */
export function calculateRenewalQuote(
    input: TRenewalQuoteInput,
): TRenewalQuote {
    assertInstallments(input.installments)
    assertPositiveSafeInteger(
        input.renewalPrincipalAmountCents,
        'Renewal principal amount',
    )
    assertPartialCreditPolicy(input.partialCreditPolicy)
    assertRenewalSettlementMethod(input.renewalSettlementMethod)
    assertSafeNonNegativeInteger(
        input.minimumRenewalCompletedInstallments,
        'Minimum renewal completed installments',
    )

    const completed = completedInstallmentCount(input.installments)
    const firstIncomplete = input.installments[completed]
    const partialPaymentCreditCents = firstIncomplete?.amountPaidCents ?? 0
    const totalPayableAmountCents = sumAmounts(
        input.installments.map((installment) => installment.amountDueCents),
        'Total payable amount',
    )
    const totalPaidAmountCents = sumAmounts(
        input.installments.map((installment) => installment.amountPaidCents),
        'Total paid amount',
    )
    const scheduledRemainingBalanceCents = sumAmounts(
        input.installments
            .slice(completed)
            .map((installment) => installment.amountDueCents),
        'Renewal settlement balance',
    )
    const actualOutstandingBalanceCents =
        totalPayableAmountCents - totalPaidAmountCents
    const renewalSettlementBalanceCents =
        input.renewalSettlementMethod === 'COMPLETED_INSTALLMENT_BALANCE'
            ? input.partialCreditPolicy === 'APPLY_TO_SETTLEMENT'
                ? scheduledRemainingBalanceCents - partialPaymentCreditCents
                : scheduledRemainingBalanceCents
            : actualOutstandingBalanceCents
    const cashDifferenceCents =
        input.renewalPrincipalAmountCents - renewalSettlementBalanceCents

    return {
        completedInstallmentCount: completed,
        remainingInstallmentCount: input.installments.length - completed,
        isEligibleForRenewal:
            completed >= input.minimumRenewalCompletedInstallments,
        partialPaymentCreditCents,
        totalPayableAmountCents,
        totalPaidAmountCents,
        actualOutstandingBalanceCents,
        renewalSettlementBalanceCents,
        carriedForwardCreditCents:
            input.partialCreditPolicy === 'CARRY_FORWARD'
                ? partialPaymentCreditCents
                : 0,
        refundableCreditCents:
            input.partialCreditPolicy === 'REFUND'
                ? partialPaymentCreditCents
                : 0,
        manualReviewCreditCents:
            input.partialCreditPolicy === 'MANUAL_REVIEW'
                ? partialPaymentCreditCents
                : 0,
        requiresManualReview: input.partialCreditPolicy === 'MANUAL_REVIEW',
        cashReleaseAmountCents: Math.max(0, cashDifferenceCents),
        additionalSettlementDueCents: Math.max(0, -cashDifferenceCents),
    }
}
