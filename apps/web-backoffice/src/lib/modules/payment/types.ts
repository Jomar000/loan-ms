import type { LoanStatus } from '$lib/modules/loan/types'

export type PaymentFrequency = 'DAILY' | 'MONTHLY' | 'WEEKLY'

export type PaymentStatus = 'POSTED' | 'REVERSED'

export type PaymentAllocation = {
    allocatedAmountMinor: number
    amountDueMinor: number
    amountPaidMinor: number
    dueDate: string
    installmentNumber: number
    loanInstallmentPublicId: string
    status: 'OVERDUE' | 'PAID' | 'PARTIAL' | 'UPCOMING' | 'WAIVED'
}

export type PaymentQuote = {
    allocations: PaymentAllocation[]
    actualOutstandingBalanceAfterPaymentMinor: number
    amountAllocatedMinor: number
    amountReceivedMinor: number
    unallocatedMinor: number
    borrowerPublicId: string
    completedInstallmentsAfterPayment: number
    loanPublicId: string
    partialPaymentCreditAfterPaymentMinor: number
    remainingInstallmentsAfterPayment: number
}

export type Payment = PaymentQuote & {
    paymentDate: string
    paymentMethod: string
    paymentNumber: string
    paymentTypeSnapshot: PaymentFrequency
    publicId: string
    referenceNumber: string | null
    status: PaymentStatus
}

export type PaymentDraft = {
    amountReceivedMinor: number
    loanPublicId: string
    notes?: string
    paymentDate: string
    paymentMethod: string
    referenceNumber?: string
}

export type PaymentCreateInput = PaymentDraft & { idempotencyKey: string }

export type PaymentFilters = {
    borrowerPublicId?: string
    loanPublicId?: string
    status?: PaymentStatus
}

export type PaymentListRequest = {
    filters?: PaymentFilters
    limit?: number
    offset?: number
    sortOrder?: 'asc' | 'desc'
}

export type CollectionItem = {
    amountDueMinor: number
    amountPaidMinor: number
    borrowerName: string
    borrowerPublicId: string
    dueDate: string
    installmentNumber: number
    loanNumber: string
    loanPublicId: string
    loanStatus: LoanStatus
    paymentFrequency: PaymentFrequency
    remainingAmountMinor: number
    status: 'OVERDUE' | 'PAID' | 'PARTIAL' | 'UPCOMING' | 'WAIVED'
}
