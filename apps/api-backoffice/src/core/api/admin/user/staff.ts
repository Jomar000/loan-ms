import { AppError, catalog, defineError } from '@loanms/errors'
import { staff } from '@loanms/validator/backoffice/admin/user'
import { and, asc, count as countFn, desc, eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { v7 as uuidv7 } from 'uuid'

import { createAndDeliverMembershipRealtimeRevocation } from '../../../../services/realtime/authorization.js'
import { BACKOFFICE_REALTIME_TOPOLOGY } from '../../../../services/realtime/configuration.js'
import type { THonoInstance } from '../../../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
    parseAuthRoles,
} from '../../../../utilities/helpers.js'
import { isAuthorized } from '../../../middleware/isAuthorized.js'
import { validateRequest } from '../../../middleware/validateRequest.js'

const staffReadGuard = isAuthorized({ SYSADMIN: ['ANY'] })
const staffManageGuard = isAuthorized({ SYSOWNER: ['ANY'] })

const staffMutationForbidden = defineError(
    'ADMIN_USER_STAFF_MUTATION_FORBIDDEN',
    'FORBIDDEN',
    'This staff account cannot be changed through this action.',
)
const staffMutationConflict = defineError(
    'ADMIN_USER_STAFF_MUTATION_CONFLICT',
    'CONFLICT',
    'Staff access changed before it could be updated.',
)

type TStaffRow = {
    email: string
    id: string
    isLocked: boolean | null
    name: string
    role: string
    userPublicId: string
    username: string
}

const toStaffData = (row: TStaffRow) => ({
    email: row.email,
    isLocked: row.isLocked ?? true,
    name: row.name,
    roles: parseAuthRoles(row.role),
    userPublicId: row.userPublicId,
    username: row.username,
})

const staffProjection = (schema: THonoInstance['Variables']['dbSchema']) => {
    const { member, user, userAttribute } = schema
    return {
        email: user.email,
        id: user.id,
        isLocked: userAttribute.isLocked,
        name: user.name,
        role: member.role,
        userPublicId: user.publicId,
        username: user.username,
    }
}

async function findTenantStaff(
    ctx: Context<THonoInstance>,
    userPublicId: string,
) {
    const organizationId = getActiveOrganizationId(ctx)
    const { member, user, userAttribute } = ctx.get('dbSchema')
    return (
        await ctx
            .get('dbClient')
            .select(staffProjection(ctx.get('dbSchema')))
            .from(member)
            .innerJoin(user, eq(user.id, member.userId))
            .leftJoin(userAttribute, eq(userAttribute.userId, user.id))
            .where(
                and(
                    eq(member.organizationId, organizationId),
                    eq(user.publicId, userPublicId),
                ),
            )
            .limit(1)
    )[0] as TStaffRow | undefined
}

async function assertMutableStaffTarget(
    ctx: Context<THonoInstance>,
    target: TStaffRow,
) {
    if (
        target.id === ctx.get('user')!.id ||
        parseAuthRoles(target.role).includes('owner')
    ) {
        throw new AppError(staffMutationForbidden)
    }

    const { member } = ctx.get('dbSchema')
    const [{ count }] = await ctx
        .get('dbClient')
        .select({ count: countFn(member.id) })
        .from(member)
        .where(eq(member.userId, target.id))

    if (count !== 1) throw new AppError(staffMutationForbidden)
}

export const staffRoute = new Hono<THonoInstance>()
    .on(
        'QUERY',
        '/readMany',
        staffReadGuard,
        validateRequest('json', staff.readManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { member, user, userAttribute } = ctx.get('dbSchema')
            const searchCondition = eq(member.organizationId, organizationId)
            const db = ctx.get('dbClient')

            const [{ count }] = await db
                .select({ count: countFn(member.id) })
                .from(member)
                .where(searchCondition)

            const rows = await db
                .select(staffProjection(ctx.get('dbSchema')))
                .from(member)
                .innerJoin(user, eq(user.id, member.userId))
                .leftJoin(userAttribute, eq(userAttribute.userId, user.id))
                .where(searchCondition)
                .orderBy(
                    input.sortOrder === 'asc' ? asc(user.id) : desc(user.id),
                )
                .limit(input.limit)
                .offset(input.offset)

            return apiResponsePaginatedOkWrapper(ctx, {
                count,
                data: (rows as TStaffRow[]).map(toStaffData),
                limit: input.limit,
                offset: input.offset,
            })
        },
    )
    .post(
        '/role',
        staffManageGuard,
        validateRequest('json', staff.updateRoleInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const target = await findTenantStaff(ctx, input.userPublicId)
            if (!target)
                return apiResponseErrorWrapper(ctx, catalog.userUpdateNotFound)
            await assertMutableStaffTarget(ctx, target)
            if (target.role === input.role) {
                return apiResponseOkWrapper(ctx, { data: toStaffData(target) })
            }

            const db = ctx.get('dbClient')
            const auditData = auditTrailLogger.prepare({
                action: 'update',
                component: 'admin.user.staff',
                description: 'Owner changed staff role',
                records: {
                    entityType: 'membership',
                    id: target.userPublicId,
                    newData: { role: input.role },
                    oldData: { role: target.role },
                    table: 'member',
                },
            })

            const result = await createAndDeliverMembershipRealtimeRevocation({
                additionalStatements: [
                    auditTrailAfterChangeStatement(ctx, auditData, db.$client),
                ],
                client: db,
                mutation: { kind: 'set-role', role: input.role },
                namespace: ctx.env.LOANMSBOFC_DO_WSB,
                operationId: uuidv7(),
                organizationId: getActiveOrganizationId(ctx),
                profile: BACKOFFICE_REALTIME_TOPOLOGY,
                reason: 'staff-role-update',
                userId: target.id,
                waitUntil: (promise) => ctx.executionCtx.waitUntil(promise),
            })
            if (result.replayed) throw new AppError(staffMutationConflict)
            if (auditData) markAuditTrailRecorded(ctx)

            return apiResponseOkWrapper(ctx, {
                data: { ...toStaffData(target), roles: [input.role] },
            })
        },
    )
    .post(
        '/access',
        staffManageGuard,
        validateRequest('json', staff.updateAccessInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const target = await findTenantStaff(ctx, input.userPublicId)
            if (!target)
                return apiResponseErrorWrapper(ctx, catalog.userUpdateNotFound)
            await assertMutableStaffTarget(ctx, target)
            if (target.isLocked === input.isLocked) {
                return apiResponseOkWrapper(ctx, { data: toStaffData(target) })
            }

            const db = ctx.get('dbClient')
            const auditData = auditTrailLogger.prepare({
                action: input.isLocked ? 'disable' : 'enable',
                component: 'admin.user.staff',
                description: input.isLocked
                    ? 'Owner disabled staff account'
                    : 'Owner enabled staff account',
                records: {
                    entityType: 'membership',
                    id: target.userPublicId,
                    newData: { isLocked: input.isLocked },
                    oldData: { isLocked: target.isLocked },
                    table: 'member',
                },
            })
            const now = Date.now()
            const result = await createAndDeliverMembershipRealtimeRevocation({
                additionalStatements: [
                    db.$client
                        .prepare(
                            `UPDATE user_attribute
                             SET is_locked = ?, updated_at = ?
                             WHERE user_id = ? AND is_locked = ?`,
                        )
                        .bind(input.isLocked, now, target.id, target.isLocked),
                    auditTrailAfterChangeStatement(ctx, auditData, db.$client),
                    db.$client
                        .prepare('DELETE FROM session WHERE user_id = ?')
                        .bind(target.id),
                ],
                client: db,
                mutation: { kind: 'rotate' },
                namespace: ctx.env.LOANMSBOFC_DO_WSB,
                operationId: uuidv7(),
                organizationId: getActiveOrganizationId(ctx),
                profile: BACKOFFICE_REALTIME_TOPOLOGY,
                reason: input.isLocked ? 'staff-disable' : 'staff-enable',
                userId: target.id,
                waitUntil: (promise) => ctx.executionCtx.waitUntil(promise),
            })
            if (result.replayed) throw new AppError(staffMutationConflict)
            if (auditData) markAuditTrailRecorded(ctx)

            return apiResponseOkWrapper(ctx, {
                data: { ...toStaffData(target), isLocked: input.isLocked },
            })
        },
    )

export default staffRoute
