import type { TApiResponseError } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import app from '../../../src/core/index.js'

const guardedBindings = new Set<PropertyKey>([
    'BETTER_AUTH_SECRET',
    'CF_ACCOUNT_ID',
    'CF_R2_ACCESS_KEY_ID',
    'CF_R2_BUCKET_PRIVATE',
    'CF_R2_BUCKET_PUBLIC',
    'CF_R2_BUCKET_PUBLIC_URL',
    'CF_R2_PRESIGN_EXPIRY',
    'CF_R2_SECRET_ACCESS_KEY',
    'LOANMSPUB_DO_WSS',
    'LOANMSPUB_D1',
    'LOANMSPUB_KV',
])

const disabledEnvironment = new Proxy(env, {
    get(target, property, receiver) {
        if (property === 'FEATURE_OBJECT_STORAGE') return 0

        if (guardedBindings.has(property)) {
            throw new Error(`${String(property)} must not be accessed.`)
        }

        return Reflect.get(target, property, receiver)
    },
})

describe.concurrent('Object Storage Feature Guard', () => {
    it.each([
        [
            'GET',
            '/api/objectStorage/download/link/create',
        ],
        [
            'QUERY',
            '/api/objectStorage/download/readMany',
        ],
        [
            'POST',
            '/api/objectStorage/upload/create',
        ],
        [
            'POST',
            '/api/objectStorage/upload/attachment/create',
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
                `${env.CORS_EXPOSE_HEADERS},Audit-Event-Recorded`,
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
