import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    createPayment,
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

export function createPaymentCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'payment',
            'create',
        ),
        mutationFn: (input: PaymentCreateInput) => createPayment(input),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'payment',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'collection',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(scope.organizationSlug, 'loan'),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'overdue',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'borrower',
                    ),
                }),
            ])
        },
    }))
}

export function createPaymentReverseMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'payment',
            'reverse',
        ),
        mutationFn: reversePayment,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'payment',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'collection',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(scope.organizationSlug, 'loan'),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'overdue',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'borrower',
                    ),
                }),
            ])
        },
    }))
}
