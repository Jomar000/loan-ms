import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'

const AUDIT_EVENT_RECORDED_HEADER = 'Audit-Event-Recorded'

export const corsHandler = (mode: 'default' | 'reflect' = 'default') => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        // Skip CORS on WebSockets Route
        // https://github.com/honojs/hono/issues/3206#issuecomment-2410593981
        if (ctx.req.path.startsWith('/api/ws')) {
            await next()
            return
        }

        const allowedOrigins =
            mode === 'reflect'
                ? ctx.req.header('origin')
                    ? [ctx.req.header('origin')!]
                    : []
                : [ctx.env.URL_FRONTEND]

        // Credentials must never be allowed in reflect mode — doing so would
        // permit any origin to make credentialed requests, bypassing CORS entirely.
        // In default mode, only emit credential support for the configured
        // frontend origin.
        const allowCredentials =
            mode !== 'reflect' &&
            !!ctx.env.CORS_ALLOW_CREDENTIALS &&
            allowedOrigins.includes(ctx.req.header('origin') ?? '')

        const corsMiddlewareHandler = cors({
            origin: allowedOrigins,
            ...(ctx.env.CORS_ALLOW_METHODS
                ? {
                      allowMethods: ctx.env.CORS_ALLOW_METHODS.split(',').map(
                          (s) => s.trim(),
                      ),
                  }
                : {}),
            ...(ctx.env.CORS_ALLOW_HEADERS
                ? {
                      allowHeaders: ctx.env.CORS_ALLOW_HEADERS.split(',').map(
                          (s) => s.trim(),
                      ),
                  }
                : {}),
            maxAge: Number(ctx.env.CORS_MAX_AGE) || 7200,
            ...(allowCredentials ? { credentials: true } : {}),
            exposeHeaders: [
                ...(ctx.env.CORS_EXPOSE_HEADERS
                    ? ctx.env.CORS_EXPOSE_HEADERS.split(',').map((s) =>
                          s.trim(),
                      )
                    : []),
                AUDIT_EVENT_RECORDED_HEADER,
            ],
        })

        return corsMiddlewareHandler(ctx, next)
    })
}
