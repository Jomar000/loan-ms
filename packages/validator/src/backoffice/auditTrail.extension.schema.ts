export const extensionAuditTrailActions = [] as const

export const extensionAuditTrailComponents = [
    'admin.user.staff',
    'borrower',
    'borrower.document',
    'borrower.paymentTag',
    'companyFund',
    'loan',
    'loan.formulaProfile',
    'loan.product',
    'payment',
    'renewal',
    'settings',
] as const

export const extensionAuditTrailEntityTypes = [
    'borrower',
    'borrower_document',
    'borrower_payment_tag_history',
    'capital_transaction',
    'cash_transaction',
    'company_fund',
    'loan',
    'loan_formula_profile',
    'loan_installment',
    'loan_product',
    'payment',
    'payment_allocation',
    'loan_renewal',
    'membership',
    'system_settings',
] as const

export const extensionAuditTrailGroupDefinitions = [
    { key: 'all' },
    {
        key: 'borrowerManagement',
        componentPrefixes: ['borrower.'],
        exactComponents: ['borrower'],
    },
    {
        key: 'loanManagement',
        componentPrefixes: ['loan.'],
        exactComponents: [
            'loan',
            'payment',
            'renewal',
            'companyFund',
        ],
    },
    {
        key: 'accessSecurity',
        exactComponents: [
            'admin.servicePrincipal',
            'admin.user.password',
            'admin.user.staff',
            'auth',
        ],
    },
    {
        key: 'accountProfile',
        exactComponents: [
            'admin.user.profile',
            'user.address',
            'user.profile',
        ],
    },
    {
        key: 'storageNotifications',
        exactComponents: ['user.notification'],
        componentPrefixes: ['objectStorage.'],
    },
] as const
