import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTIVITY_LOG_INVALIDATION_EVENT } from '$lib/states/session/constants'

const dispatchEventMock = vi.fn((event: Event) => Boolean(event))
const fetchMock = vi.fn(
    async () =>
        new Response(JSON.stringify({ success: true }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
        }),
)

afterEach(() => {
    vi.doUnmock('$lib/config/apiKey')
    vi.doUnmock('$lib/config/objectStorage')
    vi.resetModules()
    vi.unstubAllGlobals()
})

describe('Admin RPC client feature gating', () => {
    it('blocks only service-principal access when API-key management is disabled', async () => {
        const { adminClient } = await loadClients({
            apiKeyFeatureEnabled: false,
            objectStorageFeatureEnabled: false,
        })

        expect(() => adminClient.servicePrincipal).toThrow(
            'API-key management is disabled.',
        )
        expect(() => adminClient.user).not.toThrow()
    })

    it('allows service-principal access when API-key management is enabled', async () => {
        const { adminClient } = await loadClients({
            apiKeyFeatureEnabled: true,
            objectStorageFeatureEnabled: false,
        })

        expect(() => adminClient.servicePrincipal).not.toThrow()
    })
})

describe('Object-storage RPC client feature gating', () => {
    it('blocks object-storage access when disabled', async () => {
        const { objectStorageClient } = await loadClients({
            apiKeyFeatureEnabled: false,
            objectStorageFeatureEnabled: false,
        })

        expect(() => objectStorageClient.upload).toThrow(
            'Object storage is disabled.',
        )
    })

    it('allows object-storage access when enabled', async () => {
        const { objectStorageClient } = await loadClients({
            apiKeyFeatureEnabled: false,
            objectStorageFeatureEnabled: true,
        })

        expect(() => objectStorageClient.upload).not.toThrow()
    })
})

describe('Activity Logs client invalidation event', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        vi.stubGlobal('dispatchEvent', dispatchEventMock)
        vi.stubGlobal('document', { cookie: '' })
        vi.stubGlobal('fetch', fetchMock)
        vi.doMock('$lib/config/apiKey', () => ({ apiKeyFeatureEnabled: false }))
        vi.doMock('$lib/config/objectStorage', () => ({
            objectStorageFeatureEnabled: false,
        }))
    })

    it('emits after a response confirms that an audit was written', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ success: true }), {
                headers: {
                    'content-type': 'application/json',
                    'Audit-Event-Recorded': 'true',
                },
                status: 200,
            }),
        )
        const { authClient } = await import('./clients')

        await authClient.signOut.$post()

        expect(dispatchedEventTypes()).toEqual([
            ACTIVITY_LOG_INVALIDATION_EVENT,
        ])
    })

    it('does not emit without a successful audit-event marker', async () => {
        const { auditTrailClient, authClient } = await import('./clients')

        await auditTrailClient.readMany.$query({ json: {} })
        await authClient.signOut.$post()
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ success: false }), {
                headers: {
                    'content-type': 'application/json',
                    'Audit-Event-Recorded': 'true',
                },
                status: 500,
            }),
        )
        await authClient.signOut.$post()

        expect(dispatchedEventTypes()).toEqual([])
    })
})

function dispatchedEventTypes() {
    return dispatchEventMock.mock.calls.map(([event]) => event.type)
}

async function loadClients(featureFlags: {
    apiKeyFeatureEnabled: boolean
    objectStorageFeatureEnabled: boolean
}) {
    vi.resetModules()
    vi.doMock('$lib/config/apiKey', () => ({
        apiKeyFeatureEnabled: featureFlags.apiKeyFeatureEnabled,
    }))
    vi.doMock('$lib/config/objectStorage', () => ({
        objectStorageFeatureEnabled: featureFlags.objectStorageFeatureEnabled,
    }))

    return import('./clients')
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
