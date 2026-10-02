import { describe, expect, it } from 'vitest'

import { defineRateLimitPolicy } from '../src/policy.js'
import { deriveRateLimitTarget } from '../src/transport.js'

const secret = 'test-rate-limit-secret-123456789012345678901234'
const policy = defineRateLimitPolicy({
    algorithm: 'sliding-window',
    limit: 5,
    version: 1,
    windowMs: 60_000,
})

describe.concurrent('Rate-limit key transport', () => {
    it('derives stable opaque names from structured tuples.', async () => {
        const input = {
            key: {
                parts: [
                    'member',
                    '198.51.100.0/24',
                ],
                scope: 'auth.sign-in',
            },
            policy,
            secret,
        } as const

        expect(await deriveRateLimitTarget(input)).toEqual(
            await deriveRateLimitTarget(input),
        )
        expect((await deriveRateLimitTarget(input)).objectName).toMatch(
            /^[a-f0-9]{64}$/,
        )
    })

    it('isolates scope, tuple boundaries, policy, and secret changes.', async () => {
        const derive = (
            overrides: Parameters<typeof deriveRateLimitTarget>[0],
        ) =>
            deriveRateLimitTarget(overrides).then(
                ({ objectName }) => objectName,
            )
        const base = {
            key: {
                parts: [
                    'ab',
                    'c',
                ],
                scope: 'test.scope',
            },
            policy,
            secret,
        } as const
        const names = await Promise.all([
            derive(base),
            derive({
                ...base,
                key: {
                    parts: [
                        'a',
                        'bc',
                    ],
                    scope: 'test.scope',
                },
            }),
            derive({ ...base, key: { ...base.key, scope: 'test.other' } }),
            derive({ ...base, policy: { ...policy, version: 2 } }),
            derive({ ...base, secret: `${secret}-other` }),
        ])

        expect(new Set(names).size).toBe(names.length)
    })

    it('rejects weak secrets and malformed keys.', async () => {
        await expect(
            deriveRateLimitTarget({
                key: { parts: ['member'], scope: 'test.scope' },
                policy,
                secret: 'short',
            }),
        ).rejects.toThrow('Invalid rate-limit secret.')
        await expect(
            deriveRateLimitTarget({
                key: { parts: [], scope: 'test.scope' },
                policy,
                secret,
            }),
        ).rejects.toThrow('Invalid rate-limit key.')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
