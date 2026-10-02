import { describe, expect, it } from 'vitest'

import { defineRateLimitPolicy } from '../src/policy.js'

const policy = {
    algorithm: 'sliding-window',
    limit: Number.MAX_SAFE_INTEGER,
    version: Number.MAX_SAFE_INTEGER,
    windowMs: Number.MAX_SAFE_INTEGER,
} as const

describe.concurrent('Rate-limit policy', () => {
    it('accepts safe integer bounds and rejects unsafe integer values.', () => {
        expect(defineRateLimitPolicy(policy)).toEqual(policy)

        for (const field of [
            'limit',
            'version',
            'windowMs',
        ] as const) {
            expect(() =>
                defineRateLimitPolicy({
                    ...policy,
                    [field]: Number.MAX_SAFE_INTEGER + 1,
                }),
            ).toThrow('Invalid rate-limit policy.')
        }
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
