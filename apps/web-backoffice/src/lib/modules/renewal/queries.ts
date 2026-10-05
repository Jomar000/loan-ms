import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import { createRenewal, fetchRenewals, quoteRenewal } from './api'
import type {
    RenewalCreateInput,
    RenewalListRequest,
    RenewalQuoteInput,
} from './types'

export function createRenewalListQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: RenewalListRequest },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'renewal',
            'readMany',
            options.request,
        ),
        queryFn: () => fetchRenewals(options.request),
    }))
}

export function createRenewalQuoteMutation(scope: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'renewal',
            'quote',
        ),
        mutationFn: (input: RenewalQuoteInput) => quoteRenewal(input),
    }))
}

export function createRenewalCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'renewal',
            'create',
        ),
        mutationFn: (input: RenewalCreateInput) => createRenewal(input),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'renewal',
                    ),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(scope.organizationSlug, 'loan'),
                }),
                queryClient.invalidateQueries({
                    queryKey: createTenantKey(
                        scope.organizationSlug,
                        'collection',
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
