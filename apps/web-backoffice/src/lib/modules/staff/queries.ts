import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import { fetchStaff, updateStaffAccess, updateStaffRole } from './api'
import type { StaffRole } from './types'

export function createStaffQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly request: { limit: number; offset: number } },
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'staff',
            'readMany',
            options.request,
        ),
        queryFn: () => fetchStaff(options.request),
    }))
}

function createStaffInvalidation(scope: { readonly organizationSlug: string }) {
    const queryClient = useQueryClient()

    return async () => {
        await queryClient.invalidateQueries({
            queryKey: createTenantKey(scope.organizationSlug, 'staff'),
        })
    }
}

export function createStaffAccessMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidateStaff = createStaffInvalidation(scope)

    return createMutation(() => ({
        mutationKey: createTenantKey(scope.organizationSlug, 'staff', 'access'),
        mutationFn: (input: { isLocked: boolean; userPublicId: string }) =>
            updateStaffAccess(input),
        onSuccess: invalidateStaff,
    }))
}

export function createStaffRoleMutation(scope: {
    readonly organizationSlug: string
}) {
    const invalidateStaff = createStaffInvalidation(scope)

    return createMutation(() => ({
        mutationKey: createTenantKey(scope.organizationSlug, 'staff', 'role'),
        mutationFn: (input: { role: StaffRole; userPublicId: string }) =>
            updateStaffRole(input),
        onSuccess: invalidateStaff,
    }))
}
