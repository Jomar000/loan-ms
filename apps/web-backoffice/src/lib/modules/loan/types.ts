export type LoanPaymentFrequency = 'DAILY' | 'MONTHLY' | 'WEEKLY'

export type LoanStatus =
    | 'ACTIVE'
    | 'APPROVED'
    | 'CANCELLED'
    | 'DRAFT'
    | 'FULLY_PAID'
    | 'OVERDUE'
    | 'PENDING_APPROVAL'
    | 'RENEWED'
    | 'WRITTEN_OFF'

export type LoanProduct = {
    formulaProfilePublicId: string
    isActive: boolean
    maximumPrincipalMinor: number
    minimumPrincipalMinor: number
    name: string
    publicId: string
}

export type LoanProductCreateInput = {
    formulaProfilePublicId: string
    idempotencyKey: string
    isActive?: boolean
    maximumPrincipalMinor: number
    minimumPrincipalMinor: number
    name: string
}

export type LoanQuoteInput = {
    borrowerPublicId: string
    firstPaymentDate: string
    loanProductPublicId: string
    principalMinor: number
    releaseDate: string
}

export type LoanQuote = {
    expectedCompletionDate: string
    firstPaymentDate: string
    formulaSnapshot: LoanFormulaSnapshot
    installmentAmountMinor: number
    installmentResidueMinor: number
    interestAmountMinor: number
    installments: LoanQuoteInstallment[]
    principalMinor: number
    releaseDate: string | null
    riskWarning: string | null
    totalPayableMinor: number
}

export type LoanCreateInput = LoanQuoteInput & { idempotencyKey: string }

export type LoanInstallmentStatus =
    'OVERDUE' | 'PAID' | 'PARTIAL' | 'UPCOMING' | 'WAIVED'

export type LoanFormulaSnapshot = {
    fixedInterestAmountMinor: number | null
    formulaProfilePublicId: string
    formulaProfileVersion: number
    installmentCount: number
    interestMethod: 'FIXED_AMOUNT' | 'FLAT_PERCENTAGE'
    interestRateBasisPoints: number | null
    paymentFrequency: LoanPaymentFrequency
    roundingMode: 'DOWN' | 'HALF_UP' | 'UP'
    termDays: number
}

export type LoanQuoteInstallment = {
    amountDueMinor: number
    dueDate: string
    installmentNumber: number
}

export type LoanInstallment = {
    amountDueMinor: number
    amountPaidMinor: number
    dueDate: string
    installmentNumber: number
    status: LoanInstallmentStatus
}

export type LoanListItem = {
    actualOutstandingBalanceMinor: number
    borrowerPublicId: string
    completedInstallmentCount: number
    createdAt: string
    dailyPaymentAmountMinor: number
    expectedCompletionDate: string
    firstPaymentDate: string
    formulaSnapshot: LoanFormulaSnapshot
    installmentAmountMinor: number
    installmentResidueMinor: number
    interestAmountMinor: number
    loanNumber: string
    loanProductPublicId: string
    partialPaymentCreditMinor: number
    principalMinor: number
    publicId: string
    releaseDate: string | null
    releasedAt: string | null
    status: LoanStatus
    totalAmountPaidMinor: number
    totalPayableMinor: number
}

export type LoanTableItem = LoanListItem & { borrowerName: string }

export type Loan = LoanListItem & {
    actualOutstandingBalanceMinor: number
    approvedAt: string | null
    approvedByUserPublicId: string | null
    installments: LoanInstallment[]
}

export type LoanFilters = {
    borrowerPublicId?: string
    status?: LoanStatus
}
