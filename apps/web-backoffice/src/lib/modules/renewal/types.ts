export type RenewalStatus =
    'APPROVED' | 'CANCELLED' | 'PENDING_APPROVAL' | 'RELEASED'

export type PartialCreditHandling =
    'APPLY_TO_SETTLEMENT' | 'CARRY_FORWARD' | 'MANUAL_REVIEW' | 'REFUND'

export type RenewalFormulaSnapshot = {
    fixedInterestAmountMinor: number | null
    installmentCount: number
    interestMethod: 'FIXED_AMOUNT' | 'FLAT_PERCENTAGE'
    interestRateBasisPoints: number | null
    paymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
    roundingMode: 'DOWN' | 'HALF_UP' | 'UP'
    termDays: number
}

export type RenewalInstallment = {
    amountDueMinor: number
    dueDate: string
    installmentNumber: number
}

export type RenewalQuote = {
    borrowerPublicId: string
    cashReleaseAmountMinor: number
    dailyPaymentAmountMinor: number
    expectedCompletionDate: string
    firstPaymentDate: string
    installments: RenewalInstallment[]
    interestAmountMinor: number
    partialCreditHandling: PartialCreditHandling
    previousLoanNumber: string
    previousLoanPublicId: string
    previousCompletedInstallmentCount: number
    previousPartialCreditMinor: number
    previousRemainingInstallmentCount: number
    renewalFormulaSnapshot: RenewalFormulaSnapshot
    renewalPrincipalMinor: number
    renewalSettlementBalanceMinor: number
    riskWarning: string | null
    totalPayableMinor: number
}

export type Renewal = {
    approvedAt: string | null
    borrowerPublicId: string
    cashReleaseAmountMinor: number
    newLoanNumber: string | null
    newLoanPublicId: string | null
    partialCreditHandling: PartialCreditHandling
    previousLoanNumber: string
    previousLoanPublicId: string
    previousCompletedInstallmentCount: number
    previousPartialCreditMinor: number
    previousRemainingInstallmentCount: number
    processedAt: string
    publicId: string
    renewalPrincipalMinor: number
    renewalSettlementBalanceMinor: number
    status: RenewalStatus
}

export type RenewalQuoteInput = {
    firstPaymentDate: string
    previousLoanPublicId: string
    releaseDate: string
    renewalPrincipalMinor: number
}

export type RenewalCreateInput = RenewalQuoteInput & {
    idempotencyKey: string
}

export type RenewalFilters = {
    borrowerPublicId?: string
    previousLoanPublicId?: string
    status?: RenewalStatus
}

export type RenewalListRequest = {
    filters?: RenewalFilters
    limit?: number
    offset?: number
    sortOrder?: 'asc' | 'desc'
}
