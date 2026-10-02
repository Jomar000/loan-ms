import type { TApiResponseError } from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'

const guardedBindings = new Set<PropertyKey>([
    'BETTER_AUTH_SECRET',
    'HYPERIONBOFC_DO_WSS',
    'HYPERIONBOFC_D1',
    'HYPERIONBOFC_KV',
])

const disabledEnvironment = new Proxy(env, {
    get(target, property, receiver) {
        if (property === 'FEATURE_API_KEY') return 0

        if (guardedBindings.has(property)) {
            throw new Error(`${String(property)} must not be accessed.`)
        }

        return Reflect.get(target, property, receiver)
    },
})

describe.concurrent('Service-principal feature guard', () => {
    it.each([
        [
            'QUERY',
            '/api/admin/servicePrincipal/readMany',
        ],
        [
            'POST',
            '/api/admin/servicePrincipal/create',
        ],
        [
            'POST',
            '/api/admin/servicePrincipal/credential/create',
        ],
        [
            'POST',
            '/api/admin/servicePrincipal/credential/revoke',
        ],
    ] as const)(
        'returns a CORS-enabled 404 before protected context for %s %s',
        async (method, path) => {
            const response = await app.request(
                path,
                {
                    method,
                    headers: { Origin: env.URL_FRONTEND },
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
            expect(response.headers.get('access-control-expose-headers')).toBe(
                [
                    env.CORS_EXPOSE_HEADERS,
                    'Audit-Event-Recorded',
                ].join(','),
            )
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
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
