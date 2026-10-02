import { describe, expect, it } from 'vitest'

import {
    isApiKeyFeatureEnabled,
    validateApiKeyStartupConfiguration,
} from '../../src/config/apiKey.js'

describe('API-key configuration', () => {
    it.each([
        undefined,
        0,
        '0',
    ])('resolves a feature flag of %s as disabled', (featureFlag) => {
        expect(isApiKeyFeatureEnabled({ FEATURE_API_KEY: featureFlag })).toBe(
            false,
        )
    })

    it.each([
        1,
        '1',
    ])('resolves a feature flag of %s as enabled', (featureFlag) => {
        expect(isApiKeyFeatureEnabled({ FEATURE_API_KEY: featureFlag })).toBe(
            true,
        )
    })

    it('rejects unsupported feature-flag values', () => {
        expect(() =>
            validateApiKeyStartupConfiguration({ FEATURE_API_KEY: 'yes' }),
        ).toThrow('FEATURE_API_KEY must be 0 or 1.')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
