import type { TApiResponseError } from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { csrfHandler } from '../../../src/core/middleware/csrfHandler.js'
import type { THonoBindings, THonoInstance } from '../../../src/types.js'

const csrfApp = new Hono<THonoInstance>()
    .use('*', csrfHandler())
    .all('*', (ctx) => {
        ctx.header('x-downstream-sentinel', 'reached')
        return ctx.text('OK')
    })

const stagingEnv = {
    ENVIRONMENT: 'staging',
    URL_FRONTEND: env.URL_FRONTEND,
} as unknown as THonoBindings

describe('CSRF middleware', () => {
    it('emits a host-only staging CSRF cookie for safe requests', async () => {
        const response = await csrfApp.request('/', {}, stagingEnv)
        const cookie = response.headers.get('set-cookie')

        expect(response.status).toBe(200)
        expect(cookie).toMatch(/^__Host-staging_csrf_token=/)
        expect(cookie?.toLowerCase()).toContain('secure')
        expect(cookie?.toLowerCase()).toContain('path=/')
        expect(cookie?.toLowerCase()).not.toContain('domain=')
        expect(cookie?.toLowerCase()).not.toContain('httponly')
        expect(cookie).not.toContain('__Secure-__Host-')
    })

    it('treats QUERY as safe and emits a staging CSRF cookie', async () => {
        const response = await csrfApp.request(
            '/',
            { method: 'QUERY' },
            stagingEnv,
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('x-downstream-sentinel')).toBe('reached')
        expect(await response.text()).toBe('OK')
        expect(response.headers.get('set-cookie')).toMatch(
            /^__Host-staging_csrf_token=/,
        )
    })

    it('accepts a matching environment-scoped CSRF cookie and header', async () => {
        const token = 'matching-csrf-token'
        const response = await csrfApp.request(
            '/',
            {
                method: 'POST',
                headers: {
                    origin: env.URL_FRONTEND,
                    cookie: `__Host-staging_csrf_token=${token}`,
                    'x-csrf-token': token,
                },
            },
            stagingEnv,
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('x-downstream-sentinel')).toBe('reached')
        expect(await response.text()).toBe('OK')
    })

    it.each([
        [
            'missing cookie',
            '',
            'matching-csrf-token',
        ],
        [
            'mismatched token',
            'cookie-token',
            'header-token',
        ],
    ])('rejects a %s', async (_case, cookieToken, headerToken) => {
        const response = await csrfApp.request(
            '/',
            {
                method: 'POST',
                headers: {
                    origin: env.URL_FRONTEND,
                    ...(cookieToken
                        ? {
                              cookie: `__Host-staging_csrf_token=${cookieToken}`,
                          }
                        : {}),
                    'x-csrf-token': headerToken,
                },
            },
            stagingEnv,
        )
        const responseData = await response.json<TApiResponseError>()

        expect(response.status).toBe(403)
        expect(responseData.error.code).toBe('FORBIDDEN')
        expect(responseData.error.message).toBe('Invalid CSRF token received.')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
