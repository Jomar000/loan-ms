import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
    vi.doUnmock('$lib/config/objectStorage')
    vi.resetModules()
})

describe('Object-storage RPC client feature gating', () => {
    it('blocks object-storage access when disabled', async () => {
        const { objectStorageClient } = await loadClients(false)

        expect(() => objectStorageClient.upload).toThrow(
            'Object storage is disabled.',
        )
    })

    it('allows object-storage access when enabled', async () => {
        const { objectStorageClient } = await loadClients(true)

        expect(() => objectStorageClient.upload).not.toThrow()
    })
})

async function loadClients(objectStorageFeatureEnabled: boolean) {
    vi.resetModules()
    vi.doMock('$lib/config/objectStorage', () => ({
        objectStorageFeatureEnabled,
    }))

    return import('./clients')
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
