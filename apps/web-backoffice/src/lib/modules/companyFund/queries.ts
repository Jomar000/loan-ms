import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    fetchCapitalTransactions,
    fetchCompanyFundSummary,
    fetchOverdueLoans,
    fetchReportSummary,
    injectCapital,
    recordManualFundTransaction,
    setupCompanyFund,
    withdrawCapital,
    type CapitalInjectionInput,
    type CapitalWithdrawalInput,
    type CompanyFundSetupInput,
    type ManualFundTransactionInput,
} from './api'

export function createCompanyFundSummaryQuery(scope: {
    readonly organizationSlug: string
}) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'companyFund',
            'summary',
        ),
        queryFn: fetchCompanyFundSummary,
    }))
}

export function createCapitalTransactionsQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: unknown },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'companyFund',
            'transactions',
            options.request,
        ),
        queryFn: () => fetchCapitalTransactions(options.request),
    }))
}

export function createReportSummaryQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: unknown },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'report',
            'summary',
            options.request,
        ),
        queryFn: () => fetchReportSummary(options.request),
    }))
}

export function createOverdueLoansQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: unknown },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'overdue',
            'readMany',
            options.request,
        ),
        queryFn: () => fetchOverdueLoans(options.request),
    }))
}

function createCompanyFundInvalidation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return async () => {
        await queryClient.invalidateQueries({
            queryKey: createTenantKey(scope.organizationSlug, 'companyFund'),
        })
    }
}

export function createCompanyFundSetupMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidateCompanyFund = createCompanyFundInvalidation(scope)

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'companyFund',
            'setup',
        ),
        mutationFn: (input: CompanyFundSetupInput) => setupCompanyFund(input),
        onSuccess: invalidateCompanyFund,
    }))
}

export function createCapitalInjectionMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidateCompanyFund = createCompanyFundInvalidation(scope)

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'companyFund',
            'capitalInjection',
        ),
        mutationFn: (input: CapitalInjectionInput) => injectCapital(input),
        onSuccess: invalidateCompanyFund,
    }))
}

export function createCapitalWithdrawalMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidateCompanyFund = createCompanyFundInvalidation(scope)

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'companyFund',
            'capitalWithdrawal',
        ),
        mutationFn: (input: CapitalWithdrawalInput) => withdrawCapital(input),
        onSuccess: invalidateCompanyFund,
    }))
}

export function createManualFundTransactionMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidateCompanyFund = createCompanyFundInvalidation(scope)

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'companyFund',
            'manualTransaction',
        ),
        mutationFn: (input: ManualFundTransactionInput) =>
            recordManualFundTransaction(input),
        onSuccess: invalidateCompanyFund,
    }))
}
