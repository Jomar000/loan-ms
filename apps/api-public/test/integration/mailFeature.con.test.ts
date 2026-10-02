import type { TApiResponseError } from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import app from '../../src/core/index.js'
import type { THonoBindings } from '../../src/types.js'

const guardedBindings = new Set<PropertyKey>([
    'BETTER_AUTH_SECRET',
    'CF_DO_RATE_LIMIT_SECRET',
    'HYPERIONPUB_D1',
    'HYPERIONPUB_DO_RL',
    'HYPERIONPUB_EMAIL',
    'HYPERIONPUB_KV',
    'MAILER_ACCOUNT',
    'MAILER_PROVIDER',
    'RESEND_API_KEY',
] satisfies (keyof THonoBindings)[])

const disabledEnvironment = new Proxy(env, {
    get(target, property, receiver) {
        if (property === 'FEATURE_MAIL') return 0

        if (guardedBindings.has(property)) {
            throw new Error(`${String(property)} must not be accessed.`)
        }

        return Reflect.get(target, property, receiver)
    },
})

describe.concurrent('Mail Feature Guard', () => {
    it('continues to route validation when enabled.', async () => {
        const response = await app.request(
            '/api/auth/password/resetRequest',
            {
                method: 'POST',
                headers: { origin: env.URL_FRONTEND },
            },
            env,
        )
        const responseData = await response.json<TApiResponseError>()

        expect(response.status).toBe(400)
        expect(responseData.error.code).toBe('DATA_VALIDATION')
    })

    it.each([
        '/api/admin/user/password/resetRequest',
        '/api/auth/password/resetRequest',
    ])(
        'returns a CORS-enabled 404 before protected context for POST %s',
        async (path) => {
            const response = await app.request(
                path,
                {
                    method: 'POST',
                    headers: { origin: env.URL_FRONTEND },
                },
                disabledEnvironment,
            )
            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(404)
            expect(response.headers.get('access-control-allow-origin')).toBe(
                env.URL_FRONTEND,
            )
            expect(
                response.headers.get('access-control-allow-credentials'),
            ).toBe('true')
            expect(responseData).toEqual({
                success: false,
                error: {
                    requestId: expect.any(String),
                    code: 'NOT_FOUND',
                    message: 'Not Found',
                },
            })
        },
    )

    it.each([
        '/api/auth/password/reset',
        '/api/auth/verifyEmail',
    ])(
        'keeps token redemption available for POST %s when disabled',
        async (path) => {
            const response = await app.request(
                path,
                {
                    method: 'POST',
                    headers: { origin: env.URL_FRONTEND },
                },
                { ...env, FEATURE_MAIL: 0 },
            )
            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(400)
            expect(responseData.error.code).toBe('DATA_VALIDATION')
        },
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
