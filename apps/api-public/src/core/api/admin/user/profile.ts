import { AppError, catalog, defineError } from '@loanms/errors'
import { profile } from '@loanms/validator/public/admin/user'
import { and, asc, count as countFn, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { THonoInstance } from '../../../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../../../utilities/helpers.js'
import { isAuthorized } from '../../../middleware/isAuthorized.js'
import { validateRequest } from '../../../middleware/validateRequest.js'

const profileUpdateConflict = defineError(
    'ADMIN_USER_PROFILE_UPDATE_CONFLICT',
    'CONFLICT',
    'Profile changed before it could be updated.',
)
const adminGuard = isAuthorized({ SYSADMIN: ['ANY'] })

export const profileRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .get(
        '/read',
        adminGuard,
        validateRequest('query', profile.readInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('query')
            const organizationId = getActiveOrganizationId(ctx)

            const { member, user, userProfile } = ctx.get('dbSchema')

            try {
                const searchCondition = and(
                    eq(member.organizationId, organizationId),
                    eq(user.publicId, input.userPublicId),
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
                        userPublicId: user.publicId,
                    })
                    .from(userProfile)
                    .innerJoin(user, eq(user.id, userProfile.userId))
                    .innerJoin(member, eq(member.userId, userProfile.userId))
                    .where(searchCondition)

                if (!data) throw new AppError(catalog.userNotFound)

                return apiResponseOkWrapper(ctx, { data })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.profileRetrievalFailed, {
                    cause: err,
                })
            }
        },
    )
    .on(
        'QUERY',
        '/readMany',
        adminGuard,
        validateRequest('json', profile.readManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const { member, user, userProfile } = ctx.get('dbSchema')

            try {
                const searchCondition = eq(
                    member.organizationId,
                    organizationId,
                )

                const count = (
                    await ctx
                        .get('dbClient')
                        .select({ count: countFn(userProfile.userId) })
                        .from(member)
                        .innerJoin(user, eq(user.id, member.userId))
                        .innerJoin(userProfile, eq(userProfile.userId, user.id))
                        .where(searchCondition)
                )[0].count

                const data = await ctx
                    .get('dbClient')
                    .select({
                        backupPhoneNumber: userProfile.backupPhoneNumber,
                        firstName: userProfile.firstName,
                        gender: userProfile.gender,
                        lastName: userProfile.lastName,
                        middleName: userProfile.middleName,
                        nameExtension: userProfile.nameExtension,
                        userPublicId: user.publicId,
                    })
                    .from(member)
                    .innerJoin(user, eq(user.id, member.userId))
                    .innerJoin(userProfile, eq(userProfile.userId, user.id))
                    .where(searchCondition)
                    .orderBy(
                        input.sortOrder === 'asc'
                            ? asc(user.id)
                            : desc(user.id),
                    )
                    .limit(input.limit)
                    .offset(input.offset)

                return apiResponsePaginatedOkWrapper(ctx, {
                    data,
                    count,
                    limit: input.limit,
                    offset: input.offset,
                })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.profileListRetrievalFailed, {
                    cause: err,
                })
            }
        },
    )
    .post(
        '/update',
        adminGuard,
        validateRequest('json', profile.updateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const { member, user, userProfile } = ctx.get('dbSchema')

            try {
                const db = ctx.get('dbClient')
                const [previous] = await db
                    .select({
                        firstName: userProfile.firstName,
                        middleName: userProfile.middleName,
                        lastName: userProfile.lastName,
                        nameExtension: userProfile.nameExtension,
                        gender: userProfile.gender,
                        backupPhoneNumber: userProfile.backupPhoneNumber,
                        userId: userProfile.userId,
                        userPublicId: user.publicId,
                        updatedAt: userProfile.updatedAt,
                    })
                    .from(userProfile)
                    .innerJoin(user, eq(user.id, userProfile.userId))
                    .innerJoin(member, eq(member.userId, userProfile.userId))
                    .where(
                        and(
                            eq(member.organizationId, organizationId),
                            eq(user.publicId, input.userPublicId),
                        ),
                    )

                if (!previous) {
                    return apiResponseErrorWrapper(
                        ctx,
                        catalog.userUpdateNotFound,
                    )
                }

                const { updatedAt, userId, userPublicId, ...oldData } = previous
                const database = db.$client
                const auditData = auditTrailLogger.prepare({
                    component: 'admin.user.profile',
                    action: 'update',
                    description: 'Admin updated user profile',
                    records: {
                        table: 'user_profile',
                        id: userPublicId,
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
                            userId,
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
                    return apiResponseErrorWrapper(ctx, profileUpdateConflict)
                }

                if (auditData) markAuditTrailRecorded(ctx)

                return apiResponseOkWrapper(ctx, {
                    data: { ...data, userPublicId },
                })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.profileUpdateFailed, { cause: err })
            }
        },
    )

export default profileRoute
