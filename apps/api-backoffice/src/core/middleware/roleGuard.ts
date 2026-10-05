import { AppError, catalog } from '@loanms/errors'
import { every } from 'hono/combine'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import { parseAuthRoles } from '../../utilities/helpers.js'
import { isTenantAuthenticated } from './isTenantAuthenticated.js'

export function postRoleGuard(allowedRoles: readonly string[]) {
    const allowed = new Set(allowedRoles)
    return every(
        isTenantAuthenticated(),
        createMiddleware<THonoInstance>(async (ctx, next) => {
            if (ctx.req.method !== 'POST') return next()
            if (
                !parseAuthRoles(ctx.get('role') ?? '').some((role) =>
                    allowed.has(role),
                )
            ) {
                throw new AppError(catalog.authenticationForbidden)
            }
            await next()
        }),
    )
}

export function roleGuard(allowedRoles: readonly string[]) {
    const allowed = new Set(allowedRoles)
    return every(
        isTenantAuthenticated(),
        createMiddleware<THonoInstance>(async (ctx, next) => {
            if (
                !parseAuthRoles(ctx.get('role') ?? '').some((role) =>
                    allowed.has(role),
                )
            ) {
                throw new AppError(catalog.authenticationForbidden)
            }
            await next()
        }),
    )
}
