import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    archiveBorrower,
    createBorrower,
    fetchBorrower,
    fetchBorrowerDocuments,
    fetchBorrowerPaymentTag,
    fetchBorrowers,
    overrideBorrowerPaymentTag,
    resetBorrowerPaymentTag,
    updateBorrower,
    type BorrowerListRequest,
} from './api'
import type {
    BorrowerCreateInput,
    BorrowerPaymentTag,
    BorrowerUpdateInput,
} from './types'

export function createBorrowerListQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: BorrowerListRequest },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'readMany',
            options.request,
        ),
        queryFn: () => fetchBorrowers(options.request),
    }))
}

export function createBorrowerDetailQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly publicId: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.publicId),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'read',
            options.publicId,
        ),
        queryFn: () => fetchBorrower(options.publicId),
    }))
}

export function createBorrowerDocumentsQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly publicId: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.publicId),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            options.publicId,
            'document',
            'readMany',
        ),
        queryFn: () => fetchBorrowerDocuments(options.publicId),
    }))
}

export function createBorrowerPaymentTagQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly publicId: string },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug && options.publicId),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            options.publicId,
            'paymentTag',
            'read',
        ),
        queryFn: () => fetchBorrowerPaymentTag(options.publicId),
    }))
}

export function createBorrowerCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'create',
        ),
        mutationFn: (input: BorrowerCreateInput) => createBorrower(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'borrower'),
            })
        },
    }))
}

export function createBorrowerUpdateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'update',
        ),
        mutationFn: (input: BorrowerUpdateInput) => updateBorrower(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'borrower'),
            })
        },
    }))
}

export function createBorrowerArchiveMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'archive',
        ),
        mutationFn: (publicId: string) => archiveBorrower(publicId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'borrower'),
            })
        },
    }))
}

export function createBorrowerPaymentTagOverrideMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'paymentTag',
            'override',
        ),
        mutationFn: (input: {
            paymentTag: BorrowerPaymentTag
            publicId: string
            reason: string
        }) => overrideBorrowerPaymentTag(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'borrower'),
            })
        },
    }))
}

export function createBorrowerPaymentTagResetMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'borrower',
            'paymentTag',
            'reset',
        ),
        mutationFn: (publicId: string) => resetBorrowerPaymentTag(publicId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'borrower'),
            })
        },
    }))
}
