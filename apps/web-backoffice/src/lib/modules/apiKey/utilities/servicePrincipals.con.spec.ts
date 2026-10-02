import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const principal = {
        activeCredentialCount: 1,
        audience: 'public-v1' as const,
        description: null,
        enabled: true,
        lastVerifiedAt: null,
        name: 'automation',
        permissions: { 'api.public': ['access'] },
        publicId: '019936e2-b837-7000-8000-000000000001',
    }
    const credential = {
        createdAt: '2026-08-25T00:00:00.000Z',
        expiresAt: '2026-11-23T00:00:00.000Z',
        id: 'credential-id',
        lastVerifiedAt: null,
        name: 'rotation-a',
        start: 'pub_AAAAAAAA',
    }
    const rawKey = `pub_${'A'.repeat(64)}`
    type TCredentialResponseData = typeof credential &
        ({ key: string; outcome: 'issued' } | { outcome: 'alreadyIssued' })

    return {
        createCredential: vi.fn<
            () => Promise<{
                json: () => Promise<{
                    data: TCredentialResponseData
                    success: true
                }>
            }>
        >(async () => ({
            json: async () => ({
                data: { ...credential, key: rawKey, outcome: 'issued' },
                success: true,
            }),
        })),
        createPrincipal: vi.fn(async () => ({
            json: async () => ({
                data: principal,
                success: true as const,
            }),
        })),
        credential,
        credentialReadMany: vi.fn(async () => ({
            json: async () => ({
                count: 1,
                data: [credential],
                limit: 10,
                offset: 0,
                success: true as const,
            }),
        })),
        principal,
        principalReadMany: vi.fn(async () => ({
            json: async () => ({
                count: 1,
                data: [principal],
                limit: 10,
                offset: 0,
                success: true as const,
            }),
        })),
        rawKey,
        revokeCredential: vi.fn(async () => ({
            json: async () => ({ data: null, success: true as const }),
        })),
        updatePrincipal: vi.fn(async () => ({
            json: async () => ({ data: principal, success: true as const }),
        })),
    }
})

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (factory: () => unknown) => factory(),
    createQuery: (factory: () => unknown) => factory(),
}))

vi.mock('$lib/clients', () => ({
    adminClient: {
        servicePrincipal: {
            create: { $post: mocks.createPrincipal },
            credential: {
                create: { $post: mocks.createCredential },
                readMany: { $query: mocks.credentialReadMany },
                revoke: { $post: mocks.revokeCredential },
            },
            readMany: { $query: mocks.principalReadMany },
            update: { $post: mocks.updatePrincipal },
        },
    },
}))

import {
    createServiceCredentialCreateMutation,
    createServiceCredentialListQuery,
    createServiceCredentialRevokeMutation,
    createServicePrincipalCreateMutation,
    createServicePrincipalListQuery,
    createServicePrincipalPermissions,
    createServicePrincipalUpdateMutation,
} from './servicePrincipals'

describe('Service-principal query utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('scopes principal and credential lists to tenant-safe QUERY keys.', async () => {
        const principalQuery = createServicePrincipalListQuery({
            audience: 'backoffice-v1',
            enabled: true,
            limit: 10,
            offset: 20,
            organizationSlug: 'current-organization',
        }) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }
        const credentialQuery = createServiceCredentialListQuery({
            enabled: true,
            limit: 10,
            offset: 0,
            organizationSlug: 'current-organization',
            principalPublicId: mocks.principal.publicId,
        }) as unknown as {
            queryFn: () => Promise<unknown>
            queryKey: readonly unknown[]
        }

        await expect(principalQuery.queryFn()).resolves.toMatchObject({
            data: [mocks.principal],
        })
        await expect(credentialQuery.queryFn()).resolves.toMatchObject({
            data: [mocks.credential],
        })
        expect(principalQuery.queryKey).toEqual([
            'current-organization',
            'servicePrincipal',
            'readMany',
            {
                filters: { audience: 'backoffice-v1' },
                limit: 10,
                offset: 20,
                sortOrder: 'desc',
            },
        ])
        expect(credentialQuery.queryKey).toEqual([
            'current-organization',
            'servicePrincipal',
            mocks.principal.publicId,
            'credential',
            'readMany',
            {
                filters: {
                    principalPublicId: mocks.principal.publicId,
                },
                limit: 10,
                offset: 0,
                sortOrder: 'desc',
            },
        ])
    })

    it('creates an idempotent principal with only its audience access grant.', async () => {
        const mutation = createServicePrincipalCreateMutation({
            organizationSlug: 'current-organization',
        }) as unknown as {
            mutationFn: (input: {
                audience: 'public-v1'
                description: null
                idempotencyKey: string
                name: string
            }) => Promise<unknown>
        }
        const input = {
            audience: 'public-v1' as const,
            description: null,
            idempotencyKey: '019936e2-b837-7000-8000-000000000002',
            name: 'automation',
        }

        await expect(mutation.mutationFn(input)).resolves.toEqual(
            mocks.principal,
        )
        expect(mocks.createPrincipal).toHaveBeenCalledWith({
            json: {
                ...input,
                permissions: { 'api.public': ['access'] },
            },
        })
    })

    it('keeps a one-time credential secret out of mutation state.', async () => {
        const onSecret = vi.fn()
        const mutation = createServiceCredentialCreateMutation({
            onSecret,
            organizationSlug: 'current-organization',
        }) as unknown as {
            mutationFn: (input: {
                expiryDays: null
                idempotencyKey: string
                name: string
                principalPublicId: string
            }) => Promise<{
                credential: Record<string, unknown>
                outcome: 'alreadyIssued' | 'issued'
            }>
            retry: boolean
        }
        const input = {
            expiryDays: null,
            idempotencyKey: '019936e2-b837-7000-8000-000000000003',
            name: 'rotation-a',
            principalPublicId: mocks.principal.publicId,
        }

        const result = await mutation.mutationFn(input)

        expect(mutation.retry).toBe(false)
        expect(mocks.createCredential).toHaveBeenCalledWith({ json: input })
        expect(result).toEqual({
            credential: mocks.credential,
            outcome: 'issued',
        })
        expect(result.credential).not.toHaveProperty('key')
        expect(onSecret).toHaveBeenCalledWith({
            credential: expect.not.objectContaining({ key: expect.anything() }),
            key: mocks.rawKey,
        })

        onSecret.mockClear()
        mocks.createCredential.mockResolvedValueOnce({
            json: async () => ({
                data: {
                    ...mocks.credential,
                    outcome: 'alreadyIssued' as const,
                },
                success: true as const,
            }),
        })
        await expect(mutation.mutationFn(input)).resolves.toEqual({
            credential: mocks.credential,
            outcome: 'alreadyIssued',
        })
        expect(onSecret).not.toHaveBeenCalled()
    })

    it('preserves the principal permission set during metadata updates.', async () => {
        const mutation = createServicePrincipalUpdateMutation({
            organizationSlug: 'current-organization',
        }) as unknown as {
            mutationFn: (input: {
                description: string
                name: string
                permissions: Record<string, string[]>
                publicId: string
            }) => Promise<unknown>
        }
        const input = {
            description: 'Updated automation identity',
            name: 'automation-updated',
            permissions: {
                'api.public': ['access'],
                'api.public.deployments': ['read'],
            },
            publicId: mocks.principal.publicId,
        }

        await mutation.mutationFn(input)

        expect(mocks.updatePrincipal).toHaveBeenCalledWith({ json: input })
    })

    it('revokes by parent public ID and credential ID without audience input.', async () => {
        const mutation = createServiceCredentialRevokeMutation({
            organizationSlug: 'current-organization',
        }) as unknown as {
            mutationFn: (input: {
                credentialId: string
                principalPublicId: string
            }) => Promise<void>
            retry: boolean
        }
        const input = {
            credentialId: mocks.credential.id,
            principalPublicId: mocks.principal.publicId,
        }

        await expect(mutation.mutationFn(input)).resolves.toBeUndefined()
        expect(mutation.retry).toBe(false)
        expect(mocks.revokeCredential).toHaveBeenCalledWith({ json: input })
    })

    it('maps audiences to normalized dot-notation access permissions.', () => {
        expect(createServicePrincipalPermissions('public-v1')).toEqual({
            'api.public': ['access'],
        })
        expect(createServicePrincipalPermissions('backoffice-v1')).toEqual({
            'api.backoffice': ['access'],
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
