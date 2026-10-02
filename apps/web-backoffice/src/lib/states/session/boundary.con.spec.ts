import { describe, expect, it, vi } from 'vitest'

import { executeSessionBoundary } from '$lib/states/session/boundary.js'

describe('executeSessionBoundary', () => {
    it.each([
        'clearLocalSession',
        'closeWebSockets',
        'clearTenantCaches',
        'broadcast',
    ] as const)('navigates when %s throws', async (failingOperation) => {
        const navigate = vi.fn()
        const operation = () => {
            throw new Error('cleanup failed')
        }

        await executeSessionBoundary({
            broadcast: failingOperation === 'broadcast' ? operation : vi.fn(),
            cancelTenantQueries: vi.fn().mockResolvedValue(undefined),
            clearLocalSession:
                failingOperation === 'clearLocalSession' ? operation : vi.fn(),
            clearTenantCaches:
                failingOperation === 'clearTenantCaches' ? operation : vi.fn(),
            closeWebSockets:
                failingOperation === 'closeWebSockets' ? operation : vi.fn(),
            navigate,
        })

        expect(navigate).toHaveBeenCalledOnce()
    })

    it('navigates when query cancellation rejects', async () => {
        const clearTenantCaches = vi.fn()
        const navigate = vi.fn()

        await executeSessionBoundary({
            broadcast: vi.fn(),
            cancelTenantQueries: vi
                .fn()
                .mockRejectedValue(new Error('cancellation failed')),
            clearLocalSession: vi.fn(),
            clearTenantCaches,
            closeWebSockets: vi.fn(),
            navigate,
        })

        expect(clearTenantCaches).toHaveBeenCalledOnce()
        expect(navigate).toHaveBeenCalledOnce()
    })

    it('clears immediate tenant state before awaiting query cancellation', async () => {
        const operations: string[] = []
        let finishCancellation: (() => void) | undefined
        const cancellation = new Promise<void>((resolve) => {
            finishCancellation = resolve
        })

        const boundary = executeSessionBoundary({
            broadcast: () => operations.push('broadcast'),
            cancelTenantQueries: () => cancellation,
            clearLocalSession: () => operations.push('session'),
            clearTenantCaches: () => operations.push('cache'),
            closeWebSockets: () => operations.push('websocket'),
            navigate: () => operations.push('navigate'),
        })

        expect(operations).toEqual([
            'session',
            'websocket',
        ])

        finishCancellation?.()
        await boundary

        expect(operations).toEqual([
            'session',
            'websocket',
            'cache',
            'broadcast',
            'navigate',
        ])
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
