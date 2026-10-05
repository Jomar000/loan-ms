import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    approveLoan,
    createLoan,
    createLoanProduct,
    fetchLoan,
    fetchLoanProducts,
    fetchLoans,
    quoteLoan,
    releaseLoan,
    type LoanListRequest,
} from './api'
import type {
    LoanCreateInput,
    LoanProductCreateInput,
    LoanQuoteInput,
} from './types'

export function createLoanProductsQuery(scope: {
    readonly organizationSlug: string
}) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'loanProduct',
            'readMany',
        ),
        queryFn: fetchLoanProducts,
    }))
}

export function createLoanListQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: LoanListRequest },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'loan',
            'readMany',
            options.request,
        ),
        queryFn: () => fetchLoans(options.request),
    }))
}

export function createLoanDetailQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly publicId: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.publicId),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'loan',
            'read',
            options.publicId,
        ),
        queryFn: () => fetchLoan(options.publicId),
    }))
}

export function createLoanProductCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'loanProduct',
            'create',
        ),
        mutationFn: (input: LoanProductCreateInput) => createLoanProduct(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(
                    scope.organizationSlug,
                    'loanProduct',
                ),
            })
        },
    }))
}

export function createLoanQuoteMutation(scope: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(scope.organizationSlug, 'loan', 'quote'),
        mutationFn: (input: LoanQuoteInput) => quoteLoan(input),
    }))
}

export function createLoanCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(scope.organizationSlug, 'loan', 'create'),
        mutationFn: (input: LoanCreateInput) => createLoan(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'loan'),
            })
        },
    }))
}

export function createLoanApproveMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(scope.organizationSlug, 'loan', 'approve'),
        mutationFn: approveLoan,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'loan'),
            })
        },
    }))
}

export function createLoanReleaseMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(scope.organizationSlug, 'loan', 'release'),
        mutationFn: releaseLoan,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'loan'),
            })
        },
    }))
}
