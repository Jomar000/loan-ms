import { catalog } from '@hyperion/errors'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import {
    authRateLimitGuard,
    releaseAuthRateLimit,
    resetAuthRateLimit,
} from '../../../src/core/middleware/authRateLimit.js'
import type { THonoInstance } from '../../../src/types.js'

describe('authRateLimit middleware', () => {
    it('bypasses key resolution and limiter mutations in development.', async () => {
        const keys = vi.fn(() => {
            throw new Error('Rate-limit keys must not resolve in development.')
        })
        let bypassed = false
        const app = new Hono<THonoInstance>()
            .use(
                authRateLimitGuard({
                    action: 'test.developmentBypass',
                    definition: catalog.httpRateLimited,
                    keys,
                }),
            )
            .get('/', async (ctx) => {
                const decision = ctx.get('authRateLimitDecision')!
                bypassed = decision.bypassed
                await releaseAuthRateLimit(ctx, decision)
                await resetAuthRateLimit(ctx, decision)
                return ctx.json({ success: true })
            })

        const response = await app.request('/', {}, {
            ENVIRONMENT: 'development',
        } as never)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ success: true })
        expect(bypassed).toBe(true)
        expect(keys).not.toHaveBeenCalled()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
