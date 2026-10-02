import { describe, expect, it, vi } from 'vitest'

import { createIdempotencyKeyLifecycle } from './idempotencyKey.js'

describe('Idempotency key lifecycle', () => {
    it('preserves a key across retries and rotates after success', () => {
        const createKey = vi
            .fn<() => string>()
            .mockReturnValueOnce('first-key')
            .mockReturnValueOnce('second-key')
        const lifecycle = createIdempotencyKeyLifecycle(createKey)

        expect(lifecycle.current).toBe('first-key')
        expect(lifecycle.current).toBe('first-key')
        expect(createKey).toHaveBeenCalledTimes(1)

        lifecycle.confirmSuccess()

        expect(lifecycle.current).toBe('second-key')
        expect(lifecycle.current).toBe('second-key')
        expect(createKey).toHaveBeenCalledTimes(2)
    })

    it('claims equivalent payloads and rejects mismatches without mutation', () => {
        const createKey = vi
            .fn<() => string>()
            .mockReturnValueOnce('first-key')
            .mockReturnValueOnce('second-key')
            .mockReturnValueOnce('third-key')
        const lifecycle = createIdempotencyKeyLifecycle(createKey)

        expect(
            lifecycle.claim({
                details: { quantity: 2, publicId: 'item-a' },
                omitted: undefined,
            }),
        ).toEqual({ key: 'first-key', ok: true })
        expect(
            lifecycle.claim({
                details: { publicId: 'item-a', quantity: 2 },
            }),
        ).toEqual({ key: 'first-key', ok: true })
        expect(lifecycle.claim({ details: { quantity: 3 } })).toEqual({
            ok: false,
            reason: 'payload-mismatch',
        })
        expect(lifecycle.current).toBe('first-key')

        lifecycle.abandonAttempt()
        expect(lifecycle.claim({ details: { quantity: 3 } })).toEqual({
            key: 'second-key',
            ok: true,
        })
        lifecycle.confirmSuccess()
        expect(lifecycle.claim({ name: 'Next' })).toEqual({
            key: 'third-key',
            ok: true,
        })
    })

    it('does not mutate a claimed attempt when identity generation fails', () => {
        const createKey = vi.fn<() => string>().mockReturnValue('first-key')
        const lifecycle = createIdempotencyKeyLifecycle(createKey)

        expect(lifecycle.claim({ name: 'Original' })).toEqual({
            key: 'first-key',
            ok: true,
        })
        expect(() => lifecycle.claim({ value: Number.NaN })).toThrow()
        expect(lifecycle.current).toBe('first-key')
        expect(lifecycle.claim({ name: 'Original' })).toEqual({
            key: 'first-key',
            ok: true,
        })
        expect(createKey).toHaveBeenCalledOnce()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
