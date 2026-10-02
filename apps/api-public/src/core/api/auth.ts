import { AppError, catalog } from '@hyperion/errors'
import {
    organizationReadManyInputSchema,
    organizationSetActiveInputSchema,
    passwordChangeInputSchema,
    passwordResetInputSchema,
    passwordResetRequestInputSchema,
    signInInputSchema,
    verifyEmailInputSchema,
} from '@hyperion/validator/public/auth'
import { isAPIError } from 'better-auth/api'
import { makeSignature } from 'better-auth/crypto'
import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'
import { setCookie } from 'hono/cookie'
import { nanoid } from 'nanoid'
import { v7 as uuidv7 } from 'uuid'
import type { z } from 'zod'

import { getSessionCookieName } from '../../auth/cookies.js'
import { hashPassword, verifyPassword } from '../../auth/password.js'
import { buildSessionPermissions } from '../../auth/sessionPermissions.extension.js'
import { createAndDeliverMembershipRealtimeRevocation } from '../../services/realtime/authorization.js'
import { PUBLIC_REALTIME_TOPOLOGY } from '../../services/realtime/configuration.js'
import type { TGlobalApiResponses, THonoInstance } from '../../types.js'
import { assertUserUnlocked } from '../../utilities/assertUserUnlocked.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    canLoginAuthRole,
    markAuditTrailRecorded,
    parseAuthRoles,
} from '../../utilities/helpers.js'
import {
    authRateLimitGuard,
    normalizeAuthRateLimitClientNetwork,
    normalizeAuthRateLimitIdentity,
    releaseAuthRateLimit,
    resetAuthRateLimit,
} from '../middleware/authRateLimit.js'
import { captchaHandler } from '../middleware/captchaHandler.js'
import {
    initAuthContext,
    initDatabaseContext,
    initRequestContext,
} from '../middleware/initContext.js'
import { isSessionAuthenticated } from '../middleware/isSessionAuthenticated.js'
import { isTenantAuthenticated } from '../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../middleware/validateRequest.js'

// Roles allowed to authenticate on this API surface.
const loginAuthRoles = [] as const

const authContextMiddlewares = [
    initDatabaseContext(),
    initAuthContext(),
] as const

const getClientNetwork = (ctx: Context<THonoInstance>) =>
    normalizeAuthRateLimitClientNetwork(ctx.get('ipAddress'))

const getValidatedJson = <T>(ctx: Context<THonoInstance>) =>
    (
        ctx.req as unknown as {
            valid(target: 'json'): T
        }
    ).valid('json')

const signInRateLimitGuard = (credentialType: 'email' | 'username') =>
    authRateLimitGuard({
        action: `signIn.${credentialType}`,
        keys: (ctx) => {
            const input =
                getValidatedJson<z.output<typeof signInInputSchema>>(ctx)
            const identity = `${credentialType}:${normalizeAuthRateLimitIdentity(input.accountId)}`
            return [
                {
                    action: 'sign-in-identity-network',
                    keyParts: [
                        identity,
                        getClientNetwork(ctx),
                    ],
                },
                { action: 'sign-in-identity', keyParts: [identity] },
            ]
        },
        definition: catalog.signInRateLimited,
    })

const passwordChangeRateLimitGuard = authRateLimitGuard({
    action: 'password.change',
    keys: (ctx) => [
        {
            action: 'password-change-user',
            keyParts: [ctx.get('user')!.id],
        },
    ],
    definition: catalog.passwordChangeRateLimited,
})

const passwordResetRequestRateLimitGuard = authRateLimitGuard({
    action: 'password.resetRequest',
    keys: (ctx) => {
        const input =
            getValidatedJson<z.output<typeof passwordResetRequestInputSchema>>(
                ctx,
            )
        const identity = normalizeAuthRateLimitIdentity(input.email)
        return [
            {
                action: 'password-reset-identity-minute',
                keyParts: [identity],
            },
            {
                action: 'password-reset-identity-hour',
                keyParts: [identity],
            },
            {
                action: 'password-reset-network-hour',
                keyParts: [getClientNetwork(ctx)],
            },
        ]
    },
    definition: catalog.passwordResetRequestSuppressed,
    suppress: true,
})

const passwordResetRateLimitGuard = authRateLimitGuard({
    action: 'password.reset',
    keys: (ctx) => {
        const input =
            getValidatedJson<z.output<typeof passwordResetInputSchema>>(ctx)
        return [
            {
                action: 'password-reset-redemption-token',
                keyParts: [input.token],
            },
            {
                action: 'password-reset-redemption-network',
                keyParts: [getClientNetwork(ctx)],
            },
        ]
    },
    definition: catalog.passwordResetRateLimited,
})

const verifyEmailRateLimitGuard = authRateLimitGuard({
    action: 'verifyEmail',
    keys: (ctx) => {
        const input =
            getValidatedJson<z.output<typeof verifyEmailInputSchema>>(ctx)
        return [
            {
                action: 'email-verification-token',
                keyParts: [input.token],
            },
            {
                action: 'email-verification-network',
                keyParts: [getClientNetwork(ctx)],
            },
        ]
    },
    definition: catalog.emailVerificationRateLimited,
})

const buildSessionData = async (ctx: Context<THonoInstance>) => {
    const session = ctx.get('session')!
    const user = ctx.get('user')!
    const sessionAccess = ctx.get('sessionAccess')

    if (!sessionAccess?.organizationName || !sessionAccess.organizationSlug) {
        return null
    }

    const userRoles = parseAuthRoles(ctx.get('role'))
    const expiresAt = Math.floor(session.expiresAt.getTime() / 1000)
    const refreshAt = Math.min(
        expiresAt,
        expiresAt -
            Number(ctx.env.SESSION_EXPIRATION) +
            Number(ctx.env.SESSION_UPDATE_AGE),
    )

    return {
        name: user.name,
        email: user.email,
        avatar: user.image ?? '',
        organizationName: sessionAccess.organizationName,
        organizationSlug: sessionAccess.organizationSlug,
        userRoles,
        permissions: buildSessionPermissions(userRoles, ctx.get('acl').roles),
        expiresAt,
        refreshAt,
    }
}

const signInHandler = async (
    ctx: Context<THonoInstance>,
    input: z.output<typeof signInInputSchema>,
    credentialType: 'email' | 'username',
) => {
    const { organizationId, accountId, password } = input
    const rateLimit = ctx.get('authRateLimitDecision')!

    try {
        const db = ctx.get('dbClient')
        const {
            member,
            organization: organizationTable,
            user,
        } = ctx.get('dbSchema')

        /**
         * @description
         * Verify organization membership
         */
        const orgMemberData =
            (
                await db
                    .select({
                        member,
                        organizationName: organizationTable.name,
                        organizationSlug: organizationTable.slug,
                        user,
                    })
                    .from(user)
                    .innerJoin(member, eq(user.id, member.userId))
                    .innerJoin(
                        organizationTable,
                        eq(member.organizationId, organizationTable.id),
                    )
                    .where(
                        and(
                            credentialType === 'email'
                                ? eq(user.email, accountId)
                                : eq(user.username, accountId),
                            eq(organizationTable.slug, organizationId),
                        ),
                    )
            )[0] ?? null

        if (!orgMemberData) {
            return apiResponseErrorWrapper(
                ctx,
                catalog.signInInvalidCredentials,
            )
        }

        const signInRoles = parseAuthRoles(orgMemberData.member.role)
        const knownRoles = new Set(Object.keys(ctx.get('acl').roles))
        if (
            signInRoles.length === 0 ||
            signInRoles.some((role) => !knownRoles.has(role)) ||
            !canLoginAuthRole(orgMemberData.member.role, loginAuthRoles)
        ) {
            return apiResponseErrorWrapper(
                ctx,
                catalog.signInInvalidCredentials,
            )
        }

        await assertUserUnlocked(ctx, orgMemberData.user.id)

        /**
         * @description
         * Authenticate via better-auth built-in API
         */
        const auth = ctx.get('auth')
        let betterAuthResponse: Response

        if (credentialType === 'email') {
            betterAuthResponse = await auth.api.signInEmail({
                body: { email: accountId, password },
                query: { organizationId },
                headers: ctx.req.raw.headers,
                asResponse: true,
            })
        } else {
            betterAuthResponse = await auth.api.signInUsername({
                body: { username: accountId, password },
                query: { organizationId },
                headers: ctx.req.raw.headers,
                asResponse: true,
            })
        }

        if (!betterAuthResponse.ok) {
            if (betterAuthResponse.status >= 500) {
                throw new AppError(catalog.authenticationUnavailable)
            }

            return apiResponseErrorWrapper(
                ctx,
                catalog.signInInvalidCredentials,
            )
        }

        /**
         * @description
         * Forward session cookies from better-auth response
         */
        for (const cookie of betterAuthResponse.headers.getSetCookie()) {
            ctx.header('set-cookie', cookie, { append: true })
        }

        await auditTrailLogger(ctx, {
            component: 'auth',
            action: `signIn.${credentialType}`,
            attribution: {
                actor: {
                    displayName: orgMemberData.user.name,
                    identifier:
                        orgMemberData.user.username ?? orgMemberData.user.email,
                    role: orgMemberData.member.role,
                    type: 'user',
                    userId: orgMemberData.user.id,
                },
                organizationId: orgMemberData.member.organizationId,
            },
            description: `User signed in via ${credentialType}`,
        })
        await resetAuthRateLimit(ctx, rateLimit)

        return apiResponseOkWrapper(ctx, { data: null })
    } catch (error) {
        if (isAPIError(error) && error.status !== 'INTERNAL_SERVER_ERROR') {
            return apiResponseErrorWrapper(
                ctx,
                catalog.signInInvalidCredentials,
            )
        }

        if (error instanceof AppError && error.status < 500) {
            if (error.code === catalog.accountLocked.code) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.signInInvalidCredentials,
                )
            }
            throw error
        }

        throw new AppError(catalog.authenticationUnavailable, { cause: error })
    }
}

function getEmailVerificationAddress(token: string) {
    const payload = token.split('.')[1]
    if (!payload) return null

    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            '=',
        )
        const decoded = JSON.parse(atob(padded)) as { email?: unknown }
        return typeof decoded.email === 'string'
            ? decoded.email.toLowerCase()
            : null
    } catch {
        return null
    }
}

async function auditAnonymousAuthForUser(
    ctx: Context<THonoInstance>,
    userId: string,
    action: 'password.reset' | 'password.resetRequest' | 'verifyEmail',
    description: string,
) {
    const { member } = ctx.get('dbSchema')
    const memberships = await ctx
        .get('dbClient')
        .select({ organizationId: member.organizationId })
        .from(member)
        .where(eq(member.userId, userId))

    await Promise.all(
        memberships.map(({ organizationId }) =>
            auditTrailLogger(ctx, {
                component: 'auth',
                action,
                attribution: {
                    actor: {
                        displayName: 'Anonymous',
                        type: 'anonymous',
                    },
                    organizationId,
                },
                description,
            }),
        ),
    )
}

async function preparePasswordResetRequestAudits(
    ctx: Context<THonoInstance>,
    email: string,
) {
    const { member, user } = ctx.get('dbSchema')
    const auditUser = (
        await ctx
            .get('dbClient')
            .select({ id: user.id, publicId: user.publicId })
            .from(user)
            .where(eq(user.email, email))
            .limit(1)
    )[0]

    if (!auditUser) return []

    const memberships = await ctx
        .get('dbClient')
        .select({ organizationId: member.organizationId })
        .from(member)
        .where(eq(member.userId, auditUser.id))

    return memberships.map(({ organizationId }) =>
        auditTrailLogger.prepare({
            component: 'auth',
            action: 'password.resetRequest',
            attribution: {
                actor: {
                    displayName: 'Anonymous',
                    type: 'anonymous',
                },
                organizationId,
            },
            description: 'Password reset requested',
            records: { table: 'user', id: auditUser.publicId },
        }),
    )
}

export const authRoute = new Hono<THonoInstance>()
    .use('*', initRequestContext())
    /**
     * @description
     * Routes
     */
    .on(
        'QUERY',
        '/organization/readMany',
        ...authContextMiddlewares,
        isSessionAuthenticated(),
        validateRequest('json', organizationReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const { member, organization } = ctx.get('dbSchema')
            const searchFilter = input.filters.searchFilter?.trim()
            const conditions = [eq(member.userId, ctx.get('user')!.id)]

            if (searchFilter) {
                conditions.push(
                    or(
                        sql<boolean>`instr(lower(${organization.name}), lower(${searchFilter})) > 0`,
                        sql<boolean>`instr(lower(${organization.slug}), lower(${searchFilter})) > 0`,
                    )!,
                )
            }

            const db = ctx.get('dbClient')
            const where = and(...conditions)
            const order = input.sortOrder === 'asc' ? asc : desc
            const [
                data,
                countRows,
            ] = await Promise.all([
                db
                    .select({
                        name: organization.name,
                        slug: organization.slug,
                    })
                    .from(member)
                    .innerJoin(
                        organization,
                        eq(member.organizationId, organization.id),
                    )
                    .where(where)
                    .orderBy(order(organization.name), order(organization.slug))
                    .limit(input.limit)
                    .offset(input.offset),
                db
                    .select({ count: count() })
                    .from(member)
                    .innerJoin(
                        organization,
                        eq(member.organizationId, organization.id),
                    )
                    .where(where),
            ])

            return apiResponsePaginatedOkWrapper(ctx, {
                data,
                count: countRows[0]?.count ?? 0,
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .post(
        '/organization/setActive',
        ...authContextMiddlewares,
        isSessionAuthenticated(),
        validateRequest('json', organizationSetActiveInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const user = ctx.get('user')!
            const { member, organization: organizationTable } =
                ctx.get('dbSchema')

            /**
             * @description
             * Resolve the selected organization and the user's membership in
             * it, so the audit attribution comes from trusted database state
             * rather than the previously active organization's role.
             */
            const selection = (
                await ctx
                    .get('dbClient')
                    .select({
                        organizationId: organizationTable.id,
                        role: member.role,
                    })
                    .from(organizationTable)
                    .innerJoin(
                        member,
                        and(
                            eq(member.organizationId, organizationTable.id),
                            eq(member.userId, user.id),
                        ),
                    )
                    .where(eq(organizationTable.slug, input.organizationSlug))
                    .limit(1)
            )[0]

            if (!selection) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.organizationSelectionRejected,
                )
            }

            const auditData = auditTrailLogger.prepare({
                component: 'auth',
                action: 'organization.setActive',
                attribution: {
                    actor: {
                        displayName: user.name,
                        identifier: user.username ?? user.email,
                        role: selection.role,
                        type: 'user',
                        userId: user.id,
                    },
                    organizationId: selection.organizationId,
                },
                description: `User selected organization ${input.organizationSlug}`,
            })
            let organization: { id: string; slug: string } | null

            try {
                organization = await ctx.get('auth').api.setActiveOrganization({
                    // Bind the switch to the organization the audit attribution
                    // was resolved for, even if its slug is reassigned meanwhile.
                    body: { organizationId: selection.organizationId },
                    headers: ctx.req.raw.headers,
                })
            } catch {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.organizationSelectionRejected,
                )
            }

            if (!organization) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.organizationSelectionRejected,
                )
            }

            ctx.set('session', {
                ...ctx.get('session')!,
                activeOrganizationId: organization.id,
            })

            await auditTrailLogger(ctx, auditData)

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )
    .post(
        '/password/change',
        ...authContextMiddlewares,
        isTenantAuthenticated(),
        validateRequest('json', passwordChangeInputSchema),
        passwordChangeRateLimitGuard,
        async (ctx) => {
            const input = ctx.req.valid('json')
            const rateLimit = ctx.get('authRateLimitDecision')!
            const db = ctx.get('dbClient')
            const { account } = ctx.get('dbSchema')
            const userId = ctx.get('user')!.id
            const [credential] = await db
                .select({
                    id: account.id,
                    password: account.password,
                    updatedAt: account.updatedAt,
                })
                .from(account)
                .where(
                    and(
                        eq(account.userId, userId),
                        eq(account.accountId, userId),
                        eq(account.providerId, 'credential'),
                    ),
                )
                .limit(1)

            if (
                !credential?.password ||
                !(await verifyPassword({
                    hash: credential.password,
                    password: input.currentPassword,
                }))
            ) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.passwordChangeRejected,
                )
            }

            const database = db.$client
            const now = Date.now()
            const nextUpdatedAt = Math.max(
                now,
                credential.updatedAt.getTime() + 1,
            )
            const sessionId = nanoid()
            const sessionToken = nanoid(32)
            const expiresAt = now + Number(ctx.env.SESSION_EXPIRATION) * 1_000
            const hashedPassword = await hashPassword(input.newPassword)

            try {
                await database.batch([
                    database
                        .prepare(
                            `UPDATE account
                             SET password = ?, updated_at = ?
                             WHERE id = ? AND updated_at = ?`,
                        )
                        .bind(
                            hashedPassword,
                            nextUpdatedAt,
                            credential.id,
                            credential.updatedAt.getTime(),
                        ),
                    database.prepare(
                        `SELECT CASE WHEN changes() = 1 THEN 1
                         ELSE json('PASSWORD_CHANGE_CONFLICT') END`,
                    ),
                    database
                        .prepare('DELETE FROM session WHERE user_id = ?')
                        .bind(userId),
                    database
                        .prepare(
                            `INSERT INTO session (
                                 id, user_id, token, expires_at, ip_address,
                                 user_agent, active_organization_id,
                                 created_at, updated_at
                             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        )
                        .bind(
                            sessionId,
                            userId,
                            sessionToken,
                            expiresAt,
                            ctx.get('ipAddress') ?? null,
                            ctx.get('userAgent') ?? null,
                            ctx.get('session')!.activeOrganizationId,
                            now,
                            now,
                        ),
                    auditTrailAfterChangeStatement(
                        ctx,
                        auditTrailLogger.prepare({
                            component: 'auth',
                            action: 'password.change',
                            description: 'User changed their password',
                            records: {
                                table: 'account',
                                id: credential.id,
                                oldData: { password: '[REDACTED]' },
                                newData: { password: '[REDACTED]' },
                            },
                        }),
                        database,
                    ),
                ])
            } catch (error) {
                const [currentCredential] = await db
                    .select({
                        password: account.password,
                        updatedAt: account.updatedAt,
                    })
                    .from(account)
                    .where(eq(account.id, credential.id))
                    .limit(1)

                if (
                    !currentCredential?.password ||
                    currentCredential.updatedAt.getTime() !==
                        credential.updatedAt.getTime() ||
                    !(await verifyPassword({
                        hash: currentCredential.password,
                        password: input.currentPassword,
                    }))
                ) {
                    return apiResponseErrorWrapper(
                        ctx,
                        catalog.passwordChangeRejected,
                    )
                }

                throw new AppError(catalog.authenticationUnavailable, {
                    cause: error,
                })
            }

            markAuditTrailRecorded(ctx)
            const signature = await makeSignature(
                sessionToken,
                ctx.env.BETTER_AUTH_SECRET,
            )
            setCookie(
                ctx,
                getSessionCookieName(ctx.env.ENVIRONMENT),
                `${sessionToken}.${signature}`,
                {
                    httpOnly: true,
                    maxAge: Number(ctx.env.SESSION_EXPIRATION),
                    partitioned: true,
                    path: '/',
                    sameSite: 'strict',
                    secure: true,
                },
            )
            ctx.set('session', {
                ...ctx.get('session')!,
                id: sessionId,
                token: sessionToken,
                expiresAt: new Date(expiresAt),
            })
            await resetAuthRateLimit(ctx, rateLimit)

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )
    .post(
        '/password/resetRequest',
        validateRequest('json', passwordResetRequestInputSchema),
        passwordResetRequestRateLimitGuard,
        ...authContextMiddlewares,
        async (ctx) => {
            const input = ctx.req.valid('json')
            const rateLimit = ctx.get('authRateLimitDecision')!
            const auth = ctx.get('auth')
            let auditData: Awaited<
                ReturnType<typeof preparePasswordResetRequestAudits>
            >
            try {
                auditData = await preparePasswordResetRequestAudits(
                    ctx,
                    input.email,
                )
            } catch (error) {
                await releaseAuthRateLimit(ctx, rateLimit)
                throw error
            }
            ctx.set('passwordResetEmailError', null)
            ctx.set('passwordResetEmailSent', false)
            let reservationReleased = false

            try {
                await auth.api.requestPasswordReset({
                    body: { email: input.email },
                })
            } catch (error) {
                if (error instanceof AppError) throw error
                if (
                    !isAPIError(error) ||
                    error.status === 'INTERNAL_SERVER_ERROR'
                ) {
                    throw new AppError(catalog.authenticationUnavailable, {
                        cause: error,
                    })
                }

                // Mask handled Better Auth failures to prevent enumeration.
                await releaseAuthRateLimit(ctx, rateLimit)
                reservationReleased = true
            }

            const passwordResetEmailError = ctx.get('passwordResetEmailError')
            if (passwordResetEmailError) throw passwordResetEmailError

            const passwordResetEmailSent = ctx.get('passwordResetEmailSent')
            if (!reservationReleased && !passwordResetEmailSent) {
                await releaseAuthRateLimit(ctx, rateLimit)
            }

            if (passwordResetEmailSent) {
                await Promise.all(
                    auditData.map((data) => auditTrailLogger(ctx, data)),
                )
            }

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )
    .post(
        '/password/reset',
        validateRequest('json', passwordResetInputSchema),
        passwordResetRateLimitGuard,
        ...authContextMiddlewares,
        async (ctx) => {
            const input = ctx.req.valid('json')
            const db = ctx.get('dbClient')
            const { member, verification } = ctx.get('dbSchema')
            const now = Date.now()
            const identifier = `reset-password:${input.token}`
            const [resetToken] = await db
                .select({
                    id: verification.id,
                    userId: verification.value,
                    expiresAt: verification.expiresAt,
                    updatedAt: verification.updatedAt,
                })
                .from(verification)
                .where(eq(verification.identifier, identifier))
                .orderBy(desc(verification.createdAt))
                .limit(1)

            if (!resetToken || resetToken.expiresAt.getTime() <= now) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.passwordResetRejected,
                )
            }

            const database = db.$client
            const hashedPassword = await hashPassword(input.newPassword)
            const credentialId = uuidv7()
            const memberships = await db
                .select({ organizationId: member.organizationId })
                .from(member)
                .where(eq(member.userId, resetToken.userId))

            try {
                await database.batch([
                    database
                        .prepare(
                            `DELETE FROM verification
                             WHERE id = ? AND identifier = ? AND updated_at = ?
                               AND expires_at > ?`,
                        )
                        .bind(
                            resetToken.id,
                            identifier,
                            resetToken.updatedAt.getTime(),
                            now,
                        ),
                    database.prepare(
                        `SELECT CASE WHEN changes() = 1 THEN 1
                         ELSE json('PASSWORD_RESET_TOKEN_CONFLICT') END`,
                    ),
                    database
                        .prepare(
                            `INSERT INTO account (
                                 id, user_id, account_id, provider_id,
                                 password, created_at, updated_at
                             ) VALUES (?, ?, ?, 'credential', ?, ?, ?)
                             ON CONFLICT(provider_id, account_id) DO UPDATE SET
                                 password = excluded.password,
                                 updated_at = excluded.updated_at`,
                        )
                        .bind(
                            credentialId,
                            resetToken.userId,
                            resetToken.userId,
                            hashedPassword,
                            now,
                            now,
                        ),
                    ...memberships.map(({ organizationId }) =>
                        auditTrailAfterChangeStatement(
                            ctx,
                            auditTrailLogger.prepare({
                                component: 'auth',
                                action: 'password.reset',
                                attribution: {
                                    actor: {
                                        displayName: 'Anonymous',
                                        type: 'anonymous',
                                    },
                                    organizationId,
                                },
                                description: 'Password was reset via token',
                            }),
                            database,
                        ),
                    ),
                ])
            } catch (error) {
                const [currentToken] = await db
                    .select({ expiresAt: verification.expiresAt })
                    .from(verification)
                    .where(eq(verification.id, resetToken.id))
                    .limit(1)

                if (!currentToken || currentToken.expiresAt.getTime() <= now) {
                    return apiResponseErrorWrapper(
                        ctx,
                        catalog.passwordResetRejected,
                    )
                }

                throw new AppError(catalog.authenticationUnavailable, {
                    cause: error,
                })
            }

            if (memberships.length > 0) markAuditTrailRecorded(ctx)
            return apiResponseOkWrapper(ctx, { data: null })
        },
    )
    .post(
        '/signIn/email',
        validateRequest('json', signInInputSchema),
        captchaHandler('sign-in-email'),
        signInRateLimitGuard('email'),
        ...authContextMiddlewares,
        async (ctx) => {
            const input = ctx.req.valid('json')
            return signInHandler(ctx, input, 'email')
        },
    )
    .post(
        '/signIn/username',
        validateRequest('json', signInInputSchema),
        captchaHandler('sign-in-username'),
        signInRateLimitGuard('username'),
        ...authContextMiddlewares,
        async (ctx) => {
            const input = ctx.req.valid('json')
            return signInHandler(ctx, input, 'username')
        },
    )
    .post('/signOut', ...authContextMiddlewares, async (ctx) => {
        const auth = ctx.get('auth')
        const authData = await auth.api.getSession({
            headers: ctx.req.raw.headers,
        })
        const organizationId = authData?.session.activeOrganizationId
        let membershipRole: string | undefined

        if (authData && organizationId) {
            const { member } = ctx.get('dbSchema')
            const membership = (
                await ctx
                    .get('dbClient')
                    .select({ id: member.id, role: member.role })
                    .from(member)
                    .where(
                        and(
                            eq(member.organizationId, organizationId),
                            eq(member.userId, authData.user.id),
                        ),
                    )
                    .limit(1)
            )[0]

            if (membership) {
                membershipRole = membership.role
                let deliveryWithoutExecutionContext: Promise<unknown> | null =
                    null

                await createAndDeliverMembershipRealtimeRevocation({
                    client: ctx.get('dbClient'),
                    database: ctx.env.HYPERIONPUB_D1,
                    mutation: { kind: 'rotate' },
                    namespace: ctx.env.HYPERIONPUB_DO_WSB,
                    operationId: uuidv7(),
                    organizationId,
                    profile: PUBLIC_REALTIME_TOPOLOGY,
                    reason: 'sign-out',
                    userId: authData.user.id,
                    waitUntil: (promise) => {
                        try {
                            ctx.executionCtx.waitUntil(promise)
                        } catch {
                            deliveryWithoutExecutionContext = promise
                        }
                    },
                })

                if (deliveryWithoutExecutionContext) {
                    await deliveryWithoutExecutionContext
                }
            }
        }

        const betterAuthResponse = await auth.api.signOut({
            headers: ctx.req.raw.headers,
            asResponse: true,
        })

        for (const cookie of betterAuthResponse.headers.getSetCookie()) {
            ctx.header('set-cookie', cookie, { append: true })
        }

        if (authData && organizationId) {
            await auditTrailLogger(ctx, {
                component: 'auth',
                action: 'signOut',
                attribution: {
                    actor: {
                        displayName: authData.user.name,
                        identifier:
                            authData.user.username ?? authData.user.email,
                        role: membershipRole,
                        type: 'user',
                        userId: authData.user.id,
                    },
                    organizationId,
                },
                description: 'User signed out',
            })
        }

        return apiResponseOkWrapper(ctx, { data: null })
    })
    .get(
        '/session',
        ...authContextMiddlewares,
        isTenantAuthenticated(),
        async (ctx) => {
            const data = await buildSessionData(ctx)
            if (!data) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationForbidden,
                )
            }

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .post(
        '/verifyEmail',
        validateRequest('json', verifyEmailInputSchema),
        verifyEmailRateLimitGuard,
        ...authContextMiddlewares,
        async (ctx) => {
            const input = ctx.req.valid('json')
            const auth = ctx.get('auth')
            const verificationEmail = getEmailVerificationAddress(input.token)
            const { user } = ctx.get('dbSchema')
            const auditUser = verificationEmail
                ? (
                      await ctx
                          .get('dbClient')
                          .select({
                              emailVerified: user.emailVerified,
                              id: user.id,
                          })
                          .from(user)
                          .where(eq(user.email, verificationEmail))
                          .limit(1)
                  )[0]
                : undefined
            let betterAuthResponse: Response

            try {
                betterAuthResponse = await auth.api.verifyEmail({
                    query: { token: input.token },
                    asResponse: true,
                })
            } catch (error) {
                if (
                    isAPIError(error) &&
                    error.status !== 'INTERNAL_SERVER_ERROR'
                ) {
                    return apiResponseErrorWrapper(
                        ctx,
                        catalog.emailVerificationRejected,
                    )
                }
                throw new AppError(catalog.authenticationUnavailable, {
                    cause: error,
                })
            }

            if (!betterAuthResponse.ok) {
                if (betterAuthResponse.status >= 500) {
                    throw new AppError(catalog.authenticationUnavailable)
                }
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.emailVerificationRejected,
                )
            }

            if (auditUser && !auditUser.emailVerified) {
                await auditAnonymousAuthForUser(
                    ctx,
                    auditUser.id,
                    'verifyEmail',
                    'User verified their email address',
                )
            }

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )

export default authRoute
export type AuthRouteType = ApplyGlobalResponse<
    typeof authRoute,
    TGlobalApiResponses
>
