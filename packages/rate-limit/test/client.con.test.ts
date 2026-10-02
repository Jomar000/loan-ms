import { BaseError } from '@loanms/errors'
import { describe, expect, it, vi } from 'vitest'

import {
    createRateLimiter,
    RateLimitConfigurationError,
    RateLimitUnavailableError,
} from '../src/client.js'
import { defineRateLimitPolicy } from '../src/policy.js'
import { deriveRateLimitTarget } from '../src/transport.js'

const secret = 'test-rate-limit-secret-123456789012345678901234'
const policy = defineRateLimitPolicy({
    algorithm: 'sliding-window',
    limit: 5,
    version: 1,
    windowMs: 60_000,
})

describe.concurrent('Rate-limit client', () => {
    it('retains custom error behavior through BaseError', () => {
        const configurationError = new RateLimitConfigurationError(
            'Invalid configuration.',
        )
        const cause = { unavailable: true }
        const unavailableError = new RateLimitUnavailableError(
            'Rate limiting is unavailable.',
            { cause },
        )

        expect(configurationError).toBeInstanceOf(Error)
        expect(configurationError).toBeInstanceOf(BaseError)
        expect(configurationError).toMatchObject({
            name: 'RateLimitConfigurationError',
            id: 'RATE_LIMIT_CONFIGURATION_ERROR',
            category: 'configuration',
            retryable: false,
        })
        expect(unavailableError).toBeInstanceOf(Error)
        expect(unavailableError).toBeInstanceOf(BaseError)
        expect(unavailableError).toMatchObject({
            name: 'RateLimitUnavailableError',
            id: 'RATE_LIMIT_UNAVAILABLE',
            category: 'dependency',
            retryable: true,
            cause,
        })
    })

    it('releases accepted siblings when a multi-key consume blocks.', async () => {
        const accepted = {
            key: { parts: ['accepted'], scope: 'test.multi' },
            policy,
        }
        const blocked = {
            key: { parts: ['blocked'], scope: 'test.multi' },
            policy,
        }
        const acceptedTarget = await deriveRateLimitTarget({
            ...accepted,
            secret,
        })
        const release = vi.fn(async () => ({ ok: true as const }))
        const namespace = {
            getByName: (name: string) => ({
                consume: vi.fn(async () =>
                    name === acceptedTarget.objectName
                        ? {
                              allowed: true as const,
                              remaining: 4,
                              reservationId: 'reservation',
                              retryAfterMs: 0 as const,
                          }
                        : {
                              allowed: false as const,
                              remaining: 0 as const,
                              retryAfterMs: 1_500,
                          },
                ),
                release,
                reset: vi.fn(async () => ({ ok: true as const })),
            }),
        }

        await expect(
            createRateLimiter({ namespace, secret }).consumeMany([
                accepted,
                blocked,
            ]),
        ).resolves.toEqual({ allowed: false, retryAfterMs: 1_500 })
        expect(release).toHaveBeenCalledWith(
            expect.objectContaining({ reservationId: 'reservation' }),
        )
    })

    it('releases accepted siblings when a multi-key dependency fails.', async () => {
        const accepted = {
            key: { parts: ['accepted'], scope: 'test.failure' },
            policy,
        }
        const failed = {
            key: { parts: ['failed'], scope: 'test.failure' },
            policy,
        }
        const acceptedTarget = await deriveRateLimitTarget({
            ...accepted,
            secret,
        })
        const release = vi.fn(async () => ({ ok: true as const }))
        const namespace = {
            getByName: (name: string) => ({
                consume: vi.fn(async () => {
                    if (name !== acceptedTarget.objectName) {
                        throw new Error('simulated dependency failure')
                    }

                    return {
                        allowed: true as const,
                        remaining: 4,
                        reservationId: 'reservation',
                        retryAfterMs: 0 as const,
                    }
                }),
                release,
                reset: vi.fn(async () => ({ ok: true as const })),
            }),
        }

        await expect(
            createRateLimiter({ namespace, secret }).consumeMany([
                accepted,
                failed,
            ]),
        ).rejects.toThrow('Rate limiting is unavailable.')
        expect(release).toHaveBeenCalledWith(
            expect.objectContaining({ reservationId: 'reservation' }),
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
