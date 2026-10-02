import { catalog } from '@hyperion/errors'
import { constantTimeEqual } from 'better-auth/crypto'
import { getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { nanoid } from 'nanoid'

import { getCsrfCookieName } from '../../auth/cookies.js'
import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

/**
 * @description
 * Implements CSRF protection via origin checking and naive double-submit cookie pattern
 */
export const csrfHandler = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        if (
            ctx.env.ENVIRONMENT === 'test' ||
            ctx.req.path.startsWith('/api/ws')
        ) {
            await next()
            return
        }

        const safeMethods = [
            'GET',
            'HEAD',
            'OPTIONS',
            'QUERY',
        ]

        const csrfCookieName = getCsrfCookieName(ctx.env.ENVIRONMENT)

        if (safeMethods.includes(ctx.req.method)) {
            setCookie(ctx, csrfCookieName, nanoid(32), {
                httpOnly: false,
                partitioned: true,
                path: '/',
                sameSite: 'strict' as const,
                secure: true,
            })
        } else {
            if (!ctx.req.header('origin')) {
                return apiResponseErrorWrapper(ctx, catalog.originMissing)
            }

            if (ctx.env.URL_FRONTEND !== ctx.req.header('origin')) {
                return apiResponseErrorWrapper(ctx, catalog.originInvalid)
            }

            const tokenFromCookie = getCookie(ctx, csrfCookieName)
            const tokenFromHeader = ctx.req.header('x-csrf-token')

            if (
                !tokenFromCookie ||
                !tokenFromHeader ||
                !constantTimeEqual(
                    new TextEncoder().encode(tokenFromCookie),
                    new TextEncoder().encode(tokenFromHeader),
                )
            ) {
                return apiResponseErrorWrapper(ctx, catalog.csrfInvalid)
            }
        }

        await next()
    })
}
