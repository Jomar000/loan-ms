import { describe, expect, it } from 'vitest'

import { defineBuildFeatureFlags } from '../../../features.config.js'

const constant = '__FEATURE_OBJECT_STORAGE__'
const name = 'FEATURE_OBJECT_STORAGE'

describe('Object-storage build configuration', () => {
    it('resolves omission and `0` as disabled', () => {
        expect(defineBuildFeatureFlags({})[constant]).toBe('false')
        expect(defineBuildFeatureFlags({ [name]: '0' })[constant]).toBe('false')
    })

    it('resolves `1` as enabled', () => {
        expect(defineBuildFeatureFlags({ [name]: '1' })[constant]).toBe('true')
    })

    it('rejects unsupported values with the feature name', () => {
        expect(() => defineBuildFeatureFlags({ [name]: 'yes' })).toThrow(
            'FEATURE_OBJECT_STORAGE must be 0 or 1.',
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
