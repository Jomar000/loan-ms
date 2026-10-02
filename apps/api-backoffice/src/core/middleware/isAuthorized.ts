import { catalog } from '@hyperion/errors'
import { every } from 'hono/combine'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'
import { isTenantAuthenticated } from './isTenantAuthenticated.js'

export const isAuthorized = (permissions: Record<string, string[]>) => {
    return every(
        isTenantAuthenticated(),
        createMiddleware<THonoInstance>(async (ctx, next) => {
            const { success } = await ctx.get('auth').api.hasPermission({
                headers: ctx.req.raw.headers,
                body: {
                    permissions,
                },
            })

            if (!success) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }

            await next()
        }),
    )
}
