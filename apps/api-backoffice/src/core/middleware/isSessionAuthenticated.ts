import { catalog } from '@loanms/errors'
import { and, eq, sql } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

export function forwardSessionCookies(
    ctx: Parameters<ReturnType<typeof createMiddleware<THonoInstance>>>[0],
) {
    for (const cookie of ctx.get('sessionResponseHeaders')?.getSetCookie() ??
        []) {
        ctx.header('set-cookie', cookie, { append: true })
    }
    ctx.set('sessionResponseHeaders', null)
}

export const isSessionAuthenticated = (
    options: { deferCookieForwarding?: boolean } = {},
) =>
    createMiddleware<THonoInstance>(async (ctx, next) => {
        const { headers, response: authData } = await ctx
            .get('auth')
            .api.getSession({
                headers: ctx.req.raw.headers,
                returnHeaders: true,
            })

        if (!authData) {
            return apiResponseErrorWrapper(ctx, catalog.sessionRequired)
        }

        const activeOrganizationId = authData.session.activeOrganizationId
        const { member, organization, userAttribute } = ctx.get('dbSchema')
        const sessionAccess = (
            await ctx
                .get('dbClient')
                .select({
                    isLocked: userAttribute.isLocked,
                    organizationName: organization.name,
                    organizationSlug: organization.slug,
                    role: member.role,
                    websocketAuthorizationVersion:
                        member.websocketAuthorizationVersion,
                })
                .from(userAttribute)
                .leftJoin(
                    member,
                    activeOrganizationId
                        ? and(
                              eq(member.userId, authData.user.id),
                              eq(member.organizationId, activeOrganizationId),
                          )
                        : sql`false`,
                )
                .leftJoin(
                    organization,
                    eq(organization.id, member.organizationId),
                )
                .where(eq(userAttribute.userId, authData.user.id))
        )[0]

        if (!sessionAccess || sessionAccess.isLocked) {
            const auth = ctx.get('auth')
            await auth.api.revokeSessions({ headers: ctx.req.raw.headers })
            const signOutResponse = await auth.api.signOut({
                headers: ctx.req.raw.headers,
                asResponse: true,
            })

            for (const cookie of signOutResponse.headers.getSetCookie()) {
                ctx.header('set-cookie', cookie, { append: true })
            }

            return apiResponseErrorWrapper(ctx, catalog.accountLocked)
        }

        ctx.set('session', authData.session)
        ctx.set('sessionAccess', {
            organizationName: sessionAccess.organizationName,
            organizationSlug: sessionAccess.organizationSlug,
            role: sessionAccess.role,
            websocketAuthorizationVersion:
                sessionAccess.websocketAuthorizationVersion,
        })
        ctx.set('sessionResponseHeaders', headers)
        ctx.set('user', authData.user)

        if (!options.deferCookieForwarding) forwardSessionCookies(ctx)
        await next()
    })
