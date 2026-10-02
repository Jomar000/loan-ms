import { AppError, catalog, defineError } from '@hyperion/errors'
import { profile } from '@hyperion/validator/public/user'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../../utilities/helpers.js'
import { isTenantAuthenticated } from '../../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../../middleware/validateRequest.js'

const profileUpdateConflict = defineError(
    'USER_PROFILE_UPDATE_CONFLICT',
    'CONFLICT',
    'Profile changed before it could be updated.',
)
const tenantGuard = isTenantAuthenticated()

export const profileRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .get('/read', tenantGuard, async (ctx) => {
        const organizationId = getActiveOrganizationId(ctx)
        const { member, userProfile } = ctx.get('dbSchema')

        try {
            const searchCondition = and(
                eq(member.organizationId, organizationId),
                eq(userProfile.userId, ctx.get('user')!.id),
            )

            const [data] = await ctx
                .get('dbClient')
                .select({
                    backupPhoneNumber: userProfile.backupPhoneNumber,
                    firstName: userProfile.firstName,
                    gender: userProfile.gender,
                    lastName: userProfile.lastName,
                    middleName: userProfile.middleName,
                    nameExtension: userProfile.nameExtension,
                })
                .from(userProfile)
                .innerJoin(member, eq(member.userId, userProfile.userId))
                .where(searchCondition)

            if (!data) throw new AppError(catalog.userNotFound)

            return apiResponseOkWrapper(ctx, { data })
        } catch (err) {
            if (err instanceof AppError) throw err

            throw new AppError(catalog.profileRetrievalFailed, { cause: err })
        }
    })
    .post(
        '/update',
        tenantGuard,
        validateRequest('json', profile.updateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')

            const { user, userProfile } = ctx.get('dbSchema')

            try {
                const db = ctx.get('dbClient')
                const [previous] = await db
                    .select({
                        publicId: user.publicId,
                        firstName: userProfile.firstName,
                        middleName: userProfile.middleName,
                        lastName: userProfile.lastName,
                        nameExtension: userProfile.nameExtension,
                        gender: userProfile.gender,
                        backupPhoneNumber: userProfile.backupPhoneNumber,
                        updatedAt: userProfile.updatedAt,
                    })
                    .from(userProfile)
                    .innerJoin(user, eq(user.id, userProfile.userId))
                    .where(eq(userProfile.userId, ctx.get('user')!.id))

                if (!previous) {
                    throw new AppError(catalog.userUpdateNotFound)
                }

                const { publicId, updatedAt, ...oldData } = previous
                const database = db.$client
                const auditData = auditTrailLogger.prepare({
                    component: 'user.profile',
                    action: 'update',
                    description: 'User updated their profile',
                    records: {
                        table: 'user_profile',
                        id: publicId,
                        oldData,
                        newData: {
                            firstName: input.firstName,
                            middleName: input.middleName ?? null,
                            lastName: input.lastName,
                            nameExtension: input.nameExtension ?? null,
                            gender: input.gender ?? null,
                            backupPhoneNumber: input.backupPhoneNumber ?? null,
                        },
                    },
                })
                const [updateResult] = await database.batch([
                    database
                        .prepare(
                            `UPDATE user_profile
                             SET first_name = ?, middle_name = ?, last_name = ?,
                                 name_extension = ?, gender = ?,
                                 backup_phone_number = ?
                             WHERE user_id = ? AND updated_at = ?
                             RETURNING first_name AS firstName,
                                       middle_name AS middleName,
                                       last_name AS lastName,
                                       name_extension AS nameExtension,
                                       gender,
                                       backup_phone_number AS backupPhoneNumber`,
                        )
                        .bind(
                            input.firstName,
                            input.middleName ?? null,
                            input.lastName,
                            input.nameExtension ?? null,
                            input.gender ?? null,
                            input.backupPhoneNumber ?? null,
                            ctx.get('user')!.id,
                            updatedAt.getTime(),
                        ),
                    auditTrailAfterChangeStatement(ctx, auditData, database),
                ])

                const data = updateResult.results[0] as
                    | {
                          backupPhoneNumber: null | string
                          firstName: string
                          gender: null | 'FEMALE' | 'MALE'
                          lastName: string
                          middleName: null | string
                          nameExtension: null | string
                      }
                    | undefined
                if (!data) {
                    throw new AppError(profileUpdateConflict)
                }

                if (auditData) markAuditTrailRecorded(ctx)

                return apiResponseOkWrapper(ctx, { data })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.profileUpdateFailed, { cause: err })
            }
        },
    )

export default profileRoute
