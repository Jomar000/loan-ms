import {
    API_KEY_AUDIENCE_ROOT_PERMISSIONS,
    type TApiKeyAudience,
    type TApiKeyPermissionRecord,
} from '@loanms/types/shared'
import { createMutation, createQuery } from '@tanstack/svelte-query'

import { adminClient } from '$lib/clients'
import { createTenantKey } from '$lib/states/session/tenant'

export type TServicePrincipal = {
    activeCredentialCount: number
    audience: TApiKeyAudience
    description: string | null
    enabled: boolean
    lastVerifiedAt: string | null
    name: string
    permissions: TApiKeyPermissionRecord
    publicId: string
}

export type TServiceCredential = {
    createdAt: string
    expiresAt: string | null
    id: string
    lastVerifiedAt: string | null
    name: string
    start: string | null
}

type TCredentialSecret = {
    credential: TServiceCredential
    key: string
}

export type TCredentialIssueResult = {
    credential: TServiceCredential
    outcome: 'alreadyIssued' | 'issued'
}

export function createServicePrincipalPermissions(
    audience: TApiKeyAudience,
): TApiKeyPermissionRecord {
    return Object.fromEntries(
        Object.entries(API_KEY_AUDIENCE_ROOT_PERMISSIONS[audience]).map(
            ([
                component,
                actions,
            ]) => [
                component,
                [...actions],
            ],
        ),
    )
}

export function createServicePrincipalListQuery(options: {
    readonly audience: TApiKeyAudience
    readonly enabled: boolean
    readonly limit: number
    readonly offset: number
    readonly organizationSlug: string
}) {
    return createQuery(() => {
        const input = {
            filters: { audience: options.audience },
            limit: options.limit,
            offset: options.offset,
            sortOrder: 'desc' as const,
        }

        return {
            enabled: options.enabled,
            queryKey: createTenantKey(
                options.organizationSlug,
                'servicePrincipal',
                'readMany',
                input,
            ),
            queryFn: async () => {
                const responseJson = await (
                    await adminClient.servicePrincipal.readMany.$query({
                        json: input,
                    })
                ).json()
                if (!responseJson.success) {
                    throw new Error(responseJson.error.message)
                }

                return {
                    data: responseJson.data,
                    count: responseJson.count,
                    limit: responseJson.limit,
                    offset: responseJson.offset,
                }
            },
        }
    })
}

export function createServiceCredentialListQuery(options: {
    readonly enabled: boolean
    readonly limit: number
    readonly offset: number
    readonly organizationSlug: string
    readonly principalPublicId: string
}) {
    return createQuery(() => {
        const input = {
            filters: { principalPublicId: options.principalPublicId },
            limit: options.limit,
            offset: options.offset,
            sortOrder: 'desc' as const,
        }

        return {
            enabled: options.enabled && Boolean(options.principalPublicId),
            queryKey: createTenantKey(
                options.organizationSlug,
                'servicePrincipal',
                options.principalPublicId,
                'credential',
                'readMany',
                input,
            ),
            queryFn: async () => {
                const responseJson = await (
                    await adminClient.servicePrincipal.credential.readMany.$query(
                        { json: input },
                    )
                ).json()
                if (!responseJson.success) {
                    throw new Error(responseJson.error.message)
                }

                return {
                    data: responseJson.data,
                    count: responseJson.count,
                    limit: responseJson.limit,
                    offset: responseJson.offset,
                }
            },
        }
    })
}

export function createServicePrincipalCreateMutation(options: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'create',
        ),
        mutationFn: async (input: {
            audience: TApiKeyAudience
            description: string | null
            idempotencyKey: string
            name: string
        }) => {
            const responseJson = await (
                await adminClient.servicePrincipal.create.$post({
                    json: {
                        ...input,
                        permissions: createServicePrincipalPermissions(
                            input.audience,
                        ),
                    },
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
            return responseJson.data
        },
    }))
}

export function createServicePrincipalUpdateMutation(options: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'update',
        ),
        mutationFn: async (input: {
            description: string | null
            name: string
            permissions: TApiKeyPermissionRecord
            publicId: string
        }) => {
            const responseJson = await (
                await adminClient.servicePrincipal.update.$post({
                    json: {
                        description: input.description,
                        name: input.name,
                        permissions: input.permissions,
                        publicId: input.publicId,
                    },
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
            return responseJson.data
        },
    }))
}

export function createServicePrincipalDisableMutation(options: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'disable',
        ),
        mutationFn: async (publicId: string) => {
            const responseJson = await (
                await adminClient.servicePrincipal.disable.$post({
                    json: { publicId },
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
            return responseJson.data
        },
    }))
}

export function createServicePrincipalEnableMutation(options: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'enable',
        ),
        mutationFn: async (publicId: string) => {
            const responseJson = await (
                await adminClient.servicePrincipal.enable.$post({
                    json: { confirmed: true, publicId },
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
            return responseJson.data
        },
    }))
}

export function createServicePrincipalDeleteMutation(options: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'delete',
        ),
        mutationFn: async (publicId: string) => {
            const responseJson = await (
                await adminClient.servicePrincipal.delete.$post({
                    json: { publicId },
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
        },
    }))
}

export function createServiceCredentialCreateMutation(options: {
    readonly onSecret: (secret: TCredentialSecret) => void
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'credential',
            'create',
        ),
        mutationFn: async (input: {
            expiryDays: number | null
            idempotencyKey: string
            name: string
            principalPublicId: string
        }) => {
            const responseJson = await (
                await adminClient.servicePrincipal.credential.create.$post({
                    json: input,
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }

            if (responseJson.data.outcome === 'issued') {
                const { key, outcome, ...credential } = responseJson.data
                options.onSecret({ credential, key })
                return { credential, outcome } satisfies TCredentialIssueResult
            }

            const { outcome, ...credential } = responseJson.data
            return { credential, outcome } satisfies TCredentialIssueResult
        },
        retry: false,
    }))
}

export function createServiceCredentialRevokeMutation(options: {
    readonly organizationSlug: string
}) {
    return createMutation(() => ({
        mutationKey: createTenantKey(
            options.organizationSlug,
            'servicePrincipal',
            'credential',
            'revoke',
        ),
        mutationFn: async (input: {
            credentialId: string
            principalPublicId: string
        }) => {
            const responseJson = await (
                await adminClient.servicePrincipal.credential.revoke.$post({
                    json: input,
                })
            ).json()
            if (!responseJson.success) {
                throw new Error(responseJson.error.message)
            }
        },
        retry: false,
    }))
}
