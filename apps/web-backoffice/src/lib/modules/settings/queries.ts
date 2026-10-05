import {
    createMutation,
    createQuery,
    useQueryClient,
} from '@tanstack/svelte-query'

import { createTenantKey } from '$lib/states/session/tenant'
import {
    activateFormulaProfile,
    createFormulaProfile,
    createFormulaProfileVersion,
    fetchFormulaProfiles,
    fetchSystemSettings,
    previewFormulaProfile,
    retireFormulaProfile,
    updateSystemSettings,
} from './api'
import type {
    FormulaProfileCreateInput,
    FormulaProfilePreviewInput,
    SystemSettingsUpdateInput,
} from './types'

export function createFormulaProfilesQuery(
    scope: { readonly organizationSlug: string },
    options: { readonly isActive?: boolean } = {},
) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'formulaProfile',
            'readMany',
            options,
        ),
        queryFn: () => fetchFormulaProfiles(options),
    }))
}

export function createFormulaProfileCreateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'formulaProfile',
            'create',
        ),
        mutationFn: createFormulaProfile,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(
                    scope.organizationSlug,
                    'formulaProfile',
                ),
            })
        },
    }))
}

export function createFormulaProfileVersionMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'formulaProfile',
            'version',
        ),
        mutationFn: (request: {
            input: FormulaProfileCreateInput
            publicId: string
        }) => createFormulaProfileVersion(request.publicId, request.input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(
                    scope.organizationSlug,
                    'formulaProfile',
                ),
            })
        },
    }))
}

export function createFormulaProfileActivateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'formulaProfile',
            'activate',
        ),
        mutationFn: (request: { isDefault: boolean; publicId: string }) =>
            activateFormulaProfile(request.publicId, request.isDefault),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(
                    scope.organizationSlug,
                    'formulaProfile',
                ),
            })
        },
    }))
}

export function createFormulaProfileRetireMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'formulaProfile',
            'retire',
        ),
        mutationFn: retireFormulaProfile,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(
                    scope.organizationSlug,
                    'formulaProfile',
                ),
            })
        },
    }))
}

export function createFormulaProfilePreviewMutation(scope: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'formulaProfile',
            'preview',
        ),
        mutationFn: (input: FormulaProfilePreviewInput) =>
            previewFormulaProfile(input),
    }))
}

export function createSystemSettingsQuery(scope: {
    readonly organizationSlug: string
}) {
    return createQuery(() => ({
        enabled: Boolean(scope.organizationSlug),
        queryKey: createTenantKey(
            scope.organizationSlug,
            'settings',
            'current',
        ),
        queryFn: fetchSystemSettings,
    }))
}

export function createSystemSettingsUpdateMutation(scope: {
    readonly organizationSlug: string
}) {
    const queryClient = useQueryClient()

    return createMutation(() => ({
        mutationKey: createTenantKey(
            scope.organizationSlug,
            'settings',
            'update',
        ),
        mutationFn: (input: SystemSettingsUpdateInput) =>
            updateSystemSettings(input),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: createTenantKey(scope.organizationSlug, 'settings'),
            })
        },
    }))
}
