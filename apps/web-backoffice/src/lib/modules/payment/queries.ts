import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    createPayment,
    fetchCollectionsForBorrower,
    fetchCollectionsForDate,
    fetchPayments,
    quotePayment,
    reversePayment,
} from './api'
import type {
    PaymentCreateInput,
    PaymentDraft,
    PaymentListRequest,
} from './types'

export function createPaymentListQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: PaymentListRequest },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'payment',
            'readMany',
            options.request,
        ),
        queryFn: () => fetchPayments(options.request),
    }))
}

export function createCollectionsDateQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly date: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.date),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'collection',
            'date',
            options.date,
        ),
        queryFn: () => fetchCollectionsForDate(options.date),
    }))
}

export function createCollectionsBorrowerQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly borrowerPublicId: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.borrowerPublicId),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'collection',
            'borrower',
            options.borrowerPublicId,
        ),
        queryFn: () => fetchCollectionsForBorrower(options.borrowerPublicId),
    }))
}

export function createPaymentQuoteMutation(scope: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'payment',
            'quote',
        ),
        mutationFn: (input: PaymentDraft) => quotePayment(input),
    }))
}

function createPaymentInvalidation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()
    return async () => {
        await Promise.all(
            [
                'borrower',
                'collection',
                'companyFund',
                'loan',
                'overdue',
                'payment',
                'report',
            ].map((family) =>
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(scope.organizationSlug, family),
                }),
            ),
        )
    }
}

export function createPaymentCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidatePayment = createPaymentInvalidation(scope)
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'payment',
            'create',
        ),
        mutationFn: (input: PaymentCreateInput) => createPayment(input),
        onSuccess: invalidatePayment,
    }))
}

export function createPaymentReverseMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidatePayment = createPaymentInvalidation(scope)
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'payment',
            'reverse',
        ),
        mutationFn: reversePayment,
        onSuccess: invalidatePayment,
    }))
}
