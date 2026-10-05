export type CompanyFundSummary = {
    additionalCapitalMinor: number
    availableCashMinor: number
    capitalWithdrawnMinor: number
    currency: string | null
    expensesMinor: number
    fundPublicId: string | null
    interestCollectedMinor: number
    netEarningsMinor: number
    openingCapitalMinor: number
    outstandingPrincipalMinor: number
    principalCollectedMinor: number
    principalReleasedMinor: number
    refundedMinor: number
    renewalReleasedMinor: number
    writeOffsMinor: number
}

export type CapitalTransaction = {
    amountMinor: number
    direction: 'IN' | 'OUT'
    fundPublicId: string
    loanPublicId: string | null
    paymentPublicId: string | null
    publicId: string
    referenceNumber: string | null
    renewalPublicId: string | null
    transactionAt: string
    transactionNumber: string
    transactionType: string
}

export type ReportSummary = {
    currentActiveLoanCount: number
    currentActivePrincipalMinor: number
    currentAsOfDate: string
    currentOverdueAmountMinor: number
    currentOverdueLoanCount: number
    currentOutstandingReceivableMinor: number
    periodCashInMinor: number
    periodCashOutMinor: number
    periodDateFrom: string | null
    periodDateTo: string | null
    periodInterestCollectedMinor: number
    periodExpensesMinor: number
    periodLoanReleasedMinor: number
    periodNetEarningsMinor: number
    periodPrincipalCollectedMinor: number
    periodRefundedMinor: number
    periodRenewalReleasedMinor: number
    periodWriteOffsMinor: number
}

export type OverdueLoan = {
    borrowerName: string
    borrowerPublicId: string
    daysLate: number
    loanNumber: string
    loanPublicId: string
    oldestDueDate: string
    overdueAmountMinor: number
}
