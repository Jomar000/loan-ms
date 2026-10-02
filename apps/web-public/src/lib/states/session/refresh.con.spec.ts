import { describe, expect, it, vi } from 'vitest'

import {
    getSessionRefreshAction,
    reconcileSessionRefresh,
    shouldRedirectInvalidSession,
} from '$lib/states/session/refresh.js'
import {
    getRouteSessionPolicy,
    requiresSessionResolution,
} from '$lib/states/session/routePolicy.js'

describe('session refresh', () => {
    it('does not reload the sign-in route for an invalid session', () => {
        expect(shouldRedirectInvalidSession('/sign-in')).toBe(false)
        expect(shouldRedirectInvalidSession('/app')).toBe(true)
    })

    it.each([
        200,
        201,
        204,
    ])('applies successful response %i', (status) => {
        expect(getSessionRefreshAction(status)).toBe('apply')
    })

    it.each([
        400,
        404,
        422,
        300,
        500,
        502,
        503,
    ])('retries non-authoritative response %i', (status) => {
        expect(getSessionRefreshAction(status)).toBe('retry')
    })

    it.each([
        401,
        403,
    ])('invalidates authoritative response %i', (status) => {
        expect(getSessionRefreshAction(status)).toBe('invalidate')
    })

    it.each([
        'network',
        'server',
    ] as const)(
        'preserves the current session for a %s failure',
        async (failure) => {
            const session = { expiresAt: 123 }
            const invalidate = vi.fn(() => {
                session.expiresAt = 0
            })
            const retry = vi.fn()

            await reconcileSessionRefresh({
                apply: vi.fn(() => true),
                invalidate,
                request:
                    failure === 'network'
                        ? vi.fn().mockRejectedValue(new Error('offline'))
                        : vi.fn().mockResolvedValue({
                              status: 503,
                              json: async () => ({ success: false }),
                          }),
                retry,
            })

            expect(session.expiresAt).toBe(123)
            expect(invalidate).not.toHaveBeenCalled()
            expect(retry).toHaveBeenCalledOnce()
        },
    )

    it.each([
        [
            'unauthorized',
            401,
        ],
        [
            'forbidden',
            403,
        ],
    ])(
        'invalidates authentication for a %s response',
        async (_name, status) => {
            const invalidate = vi.fn()

            await reconcileSessionRefresh({
                apply: vi.fn(() => true),
                invalidate,
                request: vi.fn().mockResolvedValue({
                    status,
                    json: async () => ({ success: false }),
                }),
                retry: vi.fn(),
            })

            expect(invalidate).toHaveBeenCalledOnce()
        },
    )

    it('preserves the current session after malformed replacement data', async () => {
        const invalidate = vi.fn()
        const retry = vi.fn()

        await reconcileSessionRefresh({
            apply: vi.fn(() => false),
            invalidate,
            request: vi.fn().mockResolvedValue({
                status: 200,
                json: async () => ({ success: true, data: { expiresAt: 0 } }),
            }),
            retry,
        })

        expect(invalidate).not.toHaveBeenCalled()
        expect(retry).toHaveBeenCalledOnce()
    })

    it.each([
        [
            'unreadable JSON',
            async () => {
                throw new SyntaxError('invalid JSON')
            },
        ],
        [
            'malformed envelope',
            async () => ({ success: true }),
        ],
    ])('retries a response with %s', async (_name, readJson) => {
        const invalidate = vi.fn()
        const retry = vi.fn()

        await reconcileSessionRefresh({
            apply: vi.fn(() => true),
            invalidate,
            request: vi.fn().mockResolvedValue({
                status: 200,
                json: readJson,
            }),
            retry,
        })

        expect(invalidate).not.toHaveBeenCalled()
        expect(retry).toHaveBeenCalledOnce()
    })

    it('replaces the complete session from a valid response', async () => {
        const data = { expiresAt: 456, organizationSlug: 'selected' }
        const apply = vi.fn(() => true)
        const invalidate = vi.fn()

        await reconcileSessionRefresh({
            apply,
            invalidate,
            request: vi.fn().mockResolvedValue({
                status: 200,
                json: async () => ({ success: true, data }),
            }),
            retry: vi.fn(),
        })

        expect(apply).toHaveBeenCalledWith(data)
        expect(invalidate).not.toHaveBeenCalled()
    })

    it.each([
        [
            'protected',
            '/app',
            true,
            'protected',
        ],
        [
            'protected child',
            '/app/member/dashboard',
            true,
            'protected',
        ],
        [
            'entry',
            '/',
            true,
            'entry',
        ],
        [
            'sign in',
            '/sign-in',
            true,
            'entry',
        ],
        [
            'verification',
            '/verify-email',
            false,
            'independent',
        ],
        [
            'other public route',
            '/password-reset',
            false,
            'independent',
        ],
    ] as const)(
        'classifies %s routes',
        (_name, pathname, requiresSession, policy) => {
            expect(requiresSessionResolution(pathname)).toBe(requiresSession)
            expect(getRouteSessionPolicy(pathname)).toBe(policy)
        },
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
