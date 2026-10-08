import type { TAuditEntityType } from '@loanms/validator/backoffice/auditTrail'

import type { TAuditSnapshotPolicy } from './snapshotPolicy.js'

export type TExtensionAuditRecordContext = never

export const extensionSnapshotPolicy = {
    contextPolicies: {},
    labelFields: {
        borrower: [
            'borrowerNumber',
            'fullName',
        ],
        borrower_document: ['documentType'],
        loan: ['loanNumber'],
        loan_formula_profile: [
            'name',
            'version',
        ],
        loan_product: ['name'],
        loan_renewal: ['previousLoanNumber'],
        membership: [
            'role',
            'isLocked',
        ],
        payment: ['paymentNumber'],
        system_settings: ['version'],
    },
    snapshotFields: {
        borrower: [
            'borrowerNumber',
            'fullName',
            'paymentTag',
            'paymentTagOverrideReason',
            'paymentTagSource',
            'status',
            'systemPaymentTag',
        ],
        borrower_document: [
            'documentType',
            'issuedDate',
            'expirationDate',
        ],
        borrower_payment_tag_history: [
            'paymentTag',
            'paymentTagOverrideReason',
            'paymentTagSource',
            'systemPaymentTag',
        ],
        capital_transaction: [
            'amountMinor',
            'transactionType',
        ],
        cash_transaction: [
            'amountMinor',
            'transactionType',
        ],
        company_fund: [
            'currency',
            'fundName',
            'openingCapitalMinor',
        ],
        loan: [
            'loanNumber',
            'principalAmountMinor',
            'interestAmountMinor',
            'totalPayableAmountMinor',
            'releaseDate',
            'firstPaymentDate',
            'expectedCompletionDate',
            'status',
        ],
        loan_installment: [
            'installmentNumber',
            'dueDate',
            'amountDueMinor',
            'status',
        ],
        loan_formula_profile: [
            'name',
            'version',
            'isActive',
            'isDefault',
            'interestMethod',
            'termDays',
            'paymentFrequency',
            'installmentCount',
        ],
        loan_product: [
            'name',
            'isActive',
            'minimumPrincipalAmountMinor',
            'maximumPrincipalAmountMinor',
        ],
        loan_renewal: [
            'cashReleaseAmountMinor',
            'partialCreditHandling',
            'previousLoanNumber',
            'previousCompletedInstallmentCount',
            'previousPartialCreditMinor',
            'previousRemainingInstallmentCount',
            'renewalPrincipalAmountMinor',
            'renewalSettlementBalanceMinor',
            'status',
        ],
        membership: [
            'role',
            'isLocked',
        ],
        payment: [
            'amountAllocatedMinor',
            'amountReceivedMinor',
            'amountUnallocatedMinor',
            'paymentDate',
            'paymentMethod',
            'paymentNumber',
            'status',
        ],
        payment_allocation: [
            'allocatedAmountMinor',
        ],
        system_settings: [
            'allowAdvancePayments',
            'allowPartialPayments',
            'borrowerTagPolicy',
            'defaultLoanProductPublicId',
            'defaultPaymentFrequency',
            'enabledPaymentFrequencies',
            'requireRenewalApproval',
            'version',
        ],
    },
    snapshotValueProjectors: {},
} as const satisfies TAuditSnapshotPolicy<TAuditEntityType>
