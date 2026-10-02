import type { TApiResponseError } from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'

const TEST_ORIGIN = 'https://public-api-client.test'
const VALID_API_KEY = `pub_${'A'.repeat(64)}`

const guardedBindings = new Set<PropertyKey>([
    'BETTER_AUTH_SECRET',
    'CF_DO_RATE_LIMIT_SECRET',
    'HYPERIONPUB_DO_RL',
    'HYPERIONPUB_DO_WSS',
    'HYPERIONPUB_D1',
    'HYPERIONPUB_KV',
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

describe('V1 Endpoint', () => {
    it('returns a reflected-CORS 404 before protected context when disabled.', async () => {
        const response = await app.request(
            '/api/v1/unknown',
            { headers: { origin: TEST_ORIGIN } },
            disabledEnvironment,
        )
        const responseData = await response.json<TApiResponseError>()

        expect(response.status).toBe(404)
        expect(response.headers.get('access-control-allow-origin')).toBe(
            TEST_ORIGIN,
        )
        expect(
            response.headers.get('access-control-allow-credentials'),
        ).toBeNull()
        expect(responseData).toEqual({
            success: false,
            error: {
                requestId: expect.any(String),
                code: 'NOT_FOUND',
                message: 'Not Found',
            },
        })
    })

    it('Should reflect origins without allowing credentials.', async () => {
        const response = await app.request(
            '/api/v1/unknown',
            {
                headers: {
                    origin: TEST_ORIGIN,
                },
            },
            env,
        )

        expect(response.status).toBe(401)
        expect(response.headers.get('access-control-allow-origin')).toBe(
            TEST_ORIGIN,
        )
        expect(
            response.headers.get('access-control-allow-credentials'),
        ).toBeNull()
    })

    it('Should handle public API preflight without credentials.', async () => {
        const response = await app.request(
            '/api/v1/unknown',
            {
                method: 'OPTIONS',
                headers: {
                    origin: TEST_ORIGIN,
                    'access-control-request-method': 'GET',
                },
            },
            disabledEnvironment,
        )

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe(
            TEST_ORIGIN,
        )
        expect(
            response.headers.get('access-control-allow-credentials'),
        ).toBeNull()
    })

    it('Should reject malformed public API keys before verification.', async () => {
        const response = await app.request(
            '/api/v1/unknown',
            { headers: { 'x-api-key': 'pub_invalid' } },
            env,
        )

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid API key.',
            },
            success: false,
        })
    })

    it.each([
        [
            'Authorization',
            '/api/v1/unknown',
            { authorization: `Bearer ${VALID_API_KEY}` },
        ],
        [
            'query parameter',
            `/api/v1/unknown?x-api-key=${VALID_API_KEY}`,
            {},
        ],
        [
            'cookie',
            '/api/v1/unknown',
            { cookie: `x-api-key=${VALID_API_KEY}` },
        ],
    ])('Should not accept %s fallback.', async (_source, path, headers) => {
        const response = await app.request(path, { headers }, env)

        expect(response.status).toBe(401)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
