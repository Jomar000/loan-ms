import { describe, expect, it } from 'vitest'

import { getPayloadIdentity } from './payloadIdentity.js'

describe('Payload identity', () => {
    it('ignores object order and omitted undefined properties', () => {
        expect(
            getPayloadIdentity({
                details: { quantity: 2, publicId: 'item-a' },
                name: 'Original',
                omitted: undefined,
            }),
        ).toBe(
            getPayloadIdentity({
                name: 'Original',
                details: { publicId: 'item-a', quantity: 2 },
            }),
        )
    })

    it('preserves array order and exact strings', () => {
        expect(
            getPayloadIdentity({
                values: [
                    'a',
                    'b',
                ],
            }),
        ).not.toBe(
            getPayloadIdentity({
                values: [
                    'b',
                    'a',
                ],
            }),
        )
        expect(getPayloadIdentity({ value: 'Original' })).not.toBe(
            getPayloadIdentity({ value: 'Original ' }),
        )
        expect(getPayloadIdentity({ value: '\u00e9' })).not.toBe(
            getPayloadIdentity({ value: 'e\u0301' }),
        )
    })

    it('rejects values without a supported JSON identity', () => {
        expect(() => getPayloadIdentity(undefined)).toThrow(TypeError)
        expect(() => getPayloadIdentity({ value: Number.NaN })).toThrow()
        expect(() => getPayloadIdentity({ value: 1n })).toThrow()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
