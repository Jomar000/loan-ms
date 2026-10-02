import { AppError, catalog } from '@loanms/errors'
import { password } from '@loanms/validator/backoffice/admin/user'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { hashPassword } from '../../../../auth/password.js'
import type { THonoInstance } from '../../../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../../../utilities/helpers.js'
import {
    authRateLimit,
    authRateLimitBlockedResponse,
    releaseAuthRateLimit,
} from '../../../middleware/authRateLimit.js'
import { isAuthorized } from '../../../middleware/isAuthorized.js'
import { validateRequest } from '../../../middleware/validateRequest.js'

const adminGuard = isAuthorized({ SYSADMIN: ['ANY'] })

export const passwordRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .post(
        '/resetRequest',
        adminGuard,
        validateRequest('json', password.resetRequestInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const db = ctx.get('dbClient')
            const { member, user } = ctx.get('dbSchema')

            /**
             * @description
             * Verify target user belongs to admin's organization
             */
            const targetUser = (
                await db
                    .select({
                        email: user.email,
                        id: user.id,
                        publicId: user.publicId,
                    })
                    .from(user)
                    .innerJoin(member, eq(user.id, member.userId))
                    .where(
                        and(
                            eq(user.publicId, input.userPublicId),
                            eq(member.organizationId, organizationId),
                        ),
                    )
            )[0]

            if (!targetUser) {
                return apiResponseErrorWrapper(ctx, catalog.userNotFound)
            }

            const auditData = auditTrailLogger.prepare({
                component: 'admin.user.password',
                action: 'resetRequest',
                description: 'Admin requested password reset for user',
                records: { table: 'user', id: targetUser.publicId },
            })

            const rateLimit = await authRateLimit(ctx, () => [
                {
                    action: 'admin-password-reset-actor-target',
                    keyParts: [
                        ctx.get('user')!.id,
                        targetUser.id,
                    ],
                },
            ])

            if (!rateLimit.allowed) {
                return authRateLimitBlockedResponse(ctx, rateLimit, {
                    action: 'admin.user.password.resetRequest',
                    definition: catalog.passwordResetRequestRateLimited,
                })
            }

            /**
             * @description
             * Trigger password reset email via better-auth
             */
            const auth = ctx.get('auth')
            ctx.set('passwordResetEmailError', null)
            ctx.set('passwordResetEmailSent', false)

            try {
                await auth.api.requestPasswordReset({
                    body: { email: targetUser.email },
                })
            } catch (err) {
                await releaseAuthRateLimit(ctx, rateLimit)
                if (err instanceof AppError) throw err

                throw new AppError(catalog.authenticationUnavailable, {
                    cause: err,
                })
            }

            const passwordResetEmailError = ctx.get('passwordResetEmailError')
            if (passwordResetEmailError) {
                await releaseAuthRateLimit(ctx, rateLimit)
                throw passwordResetEmailError
            }

            if (!ctx.get('passwordResetEmailSent')) {
                await releaseAuthRateLimit(ctx, rateLimit)
            } else {
                await auditTrailLogger(ctx, auditData)
            }

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )
    .post(
        '/reset',
        adminGuard,
        validateRequest('json', password.resetInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const db = ctx.get('dbClient')
            const { account, member, user } = ctx.get('dbSchema')

            /**
             * @description
             * Hash and set the new password with the shared auth helper.
             */
            try {
                const hashedPassword = await hashPassword(input.newPassword)

                const [targetMember] = await db
                    .select({ userId: member.userId })
                    .from(member)
                    .innerJoin(user, eq(user.id, member.userId))
                    .where(
                        and(
                            eq(user.publicId, input.userPublicId),
                            eq(member.organizationId, organizationId),
                        ),
                    )

                if (!targetMember) {
                    return apiResponseErrorWrapper(ctx, catalog.userNotFound)
                }

                const [previousCredential] = await db
                    .select({
                        id: account.id,
                        password: account.password,
                        updatedAt: account.updatedAt,
                    })
                    .from(account)
                    .where(
                        and(
                            eq(account.userId, targetMember.userId),
                            eq(account.accountId, targetMember.userId),
                            eq(account.providerId, 'credential'),
                        ),
                    )

                if (!previousCredential) {
                    throw new AppError(catalog.accountCredentialNotFound)
                }

                const database = db.$client
                const nextUpdatedAt = Math.max(
                    Date.now(),
                    previousCredential.updatedAt.getTime() + 1,
                )
                const [updateResult] = await database.batch([
                    database
                        .prepare(
                            `UPDATE account
                             SET password = ?, updated_at = ?
                             WHERE id = ? AND updated_at = ?
                             RETURNING id`,
                        )
                        .bind(
                            hashedPassword,
                            nextUpdatedAt,
                            previousCredential.id,
                            previousCredential.updatedAt.getTime(),
                        ),
                    auditTrailAfterChangeStatement(
                        ctx,
                        auditTrailLogger.prepare({
                            component: 'admin.user.password',
                            action: 'reset',
                            description: 'Admin reset password for user',
                            records: {
                                table: 'account',
                                id: previousCredential.id,
                            },
                        }),
                        database,
                    ),
                ])

                if (updateResult.results.length !== 1) {
                    throw new AppError(catalog.accountCredentialUpdateConflict)
                }
                markAuditTrailRecorded(ctx)
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.passwordResetFailed, { cause: err })
            }

            return apiResponseOkWrapper(ctx, { data: null })
        },
    )

export default passwordRoute
