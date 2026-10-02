import { describe, expect, it, vi } from 'vitest'

import {
    createTenantKey,
    hasActiveTenantMutations,
} from '$lib/states/session/tenant.js'

describe('tenant cache keys', () => {
    it('places the organization slug before every tenant key segment', () => {
        const input = { limit: 25, offset: 0 }

        expect(
            createTenantKey('northwind', 'objectStorage', 'download', input),
        ).toEqual([
            'northwind',
            'objectStorage',
            'download',
            input,
        ])
    })

    it('does not inspect mutations without an active organization slug', () => {
        const isMutating = vi.fn(() => 1)

        expect(hasActiveTenantMutations({ isMutating }, '')).toBe(false)
        expect(isMutating).not.toHaveBeenCalled()
    })

    it('detects active mutations using the organization prefix', () => {
        const isMutating = vi.fn(() => 2)

        expect(hasActiveTenantMutations({ isMutating }, 'northwind')).toBe(true)
        expect(isMutating).toHaveBeenCalledWith({
            mutationKey: ['northwind'],
        })
    })

    it('excludes active mutations belonging to another organization', () => {
        const isMutating = vi.fn(({ mutationKey }) =>
            mutationKey[0] === 'northwind' ? 1 : 0,
        )

        expect(hasActiveTenantMutations({ isMutating }, 'contoso')).toBe(false)
        expect(isMutating).toHaveBeenCalledWith({
            mutationKey: ['contoso'],
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
