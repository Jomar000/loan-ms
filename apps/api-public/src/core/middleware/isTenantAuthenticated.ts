import { catalog } from '@loanms/errors'
import { every } from 'hono/combine'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    canLoginAuthRole,
    hasPrivilegedAuthRole,
    parseAuthRoles,
} from '../../utilities/helpers.js'
import {
    forwardSessionCookies,
    isSessionAuthenticated,
} from './isSessionAuthenticated.js'

const loginAuthRoles = [] as const

export const isTenantAuthenticated = () =>
    every(
        isSessionAuthenticated({ deferCookieForwarding: true }),
        createMiddleware<THonoInstance>(async (ctx, next) => {
            const activeOrganizationId =
                ctx.get('session')?.activeOrganizationId
            if (!activeOrganizationId) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }

            const membershipRole = ctx.get('sessionAccess')?.role ?? null
            const userRoles = membershipRole
                ? parseAuthRoles(membershipRole)
                : []
            const knownRoles = new Set(Object.keys(ctx.get('acl').roles))

            if (
                !membershipRole ||
                userRoles.length === 0 ||
                userRoles.some((role) => !knownRoles.has(role)) ||
                !canLoginAuthRole(membershipRole, loginAuthRoles)
            ) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }

            ctx.set('isPrivilegedRole', hasPrivilegedAuthRole(membershipRole))
            ctx.set('role', membershipRole)
            forwardSessionCookies(ctx)
            await next()
        }),
    )
