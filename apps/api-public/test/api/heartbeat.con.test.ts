import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import app from '../../src/core/index.js'

describe('Heartbeat Endpoint', () => {
    it('Should be available without authentication.', async () => {
        const response = await app.request(
            '/api/heartbeat',
            {
                headers: {
                    origin: env.URL_FRONTEND,
                },
            },
            env,
        )

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe(
            env.URL_FRONTEND,
        )
    })

    it('Should not reflect an untrusted origin.', async () => {
        const response = await app.request(
            '/api/heartbeat',
            {
                headers: {
                    origin: 'https://untrusted.test',
                },
            },
            env,
        )

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBeNull()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
