import { AppError, catalog } from '@hyperion/errors'
import { notification } from '@hyperion/validator/public/user'
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseCursorPaginatedOkWrapper,
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
} from '../../../utilities/helpers.js'
import { isTenantAuthenticated } from '../../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../../middleware/validateRequest.js'

const tenantGuard = isTenantAuthenticated()

export const notificationRoute = new Hono<THonoInstance>()
    .get(
        '/list',
        tenantGuard,
        validateRequest('query', notification.listInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('query')
            const db = ctx.get('dbClient')
            const { notificationDelivery, notificationEvent } =
                ctx.get('dbSchema')
            const organizationId = getActiveOrganizationId(ctx)
            const userId = ctx.get('user')!.id

            try {
                const deliveryWhere = and(
                    eq(notificationDelivery.organizationId, organizationId),
                    eq(notificationDelivery.userId, userId),
                )
                const eventJoin = and(
                    eq(notificationEvent.organizationId, organizationId),
                    eq(
                        notificationEvent.id,
                        notificationDelivery.notificationEventId,
                    ),
                )
                const cursorAnchor = input.cursor
                    ? (
                          await db
                              .select({
                                  createdAt: notificationDelivery.createdAt,
                                  notificationEventId:
                                      notificationDelivery.notificationEventId,
                              })
                              .from(notificationDelivery)
                              .innerJoin(notificationEvent, eventJoin)
                              .where(
                                  and(
                                      deliveryWhere,
                                      eq(
                                          notificationEvent.publicId,
                                          input.cursor,
                                      ),
                                  ),
                              )
                              .limit(1)
                      )[0]
                    : undefined

                if (input.cursor && !cursorAnchor) {
                    throw new AppError(catalog.notificationCursorInvalid)
                }

                const rows = await db
                    .select({
                        actionHref: notificationEvent.actionHref,
                        actionLabel: notificationEvent.actionLabel,
                        category: notificationEvent.category,
                        createdAt: notificationDelivery.createdAt,
                        isRead: notificationDelivery.isRead,
                        message: notificationEvent.message,
                        metadata: notificationEvent.metadata,
                        publicId: notificationEvent.publicId,
                        readAt: notificationDelivery.readAt,
                        title: notificationEvent.title,
                    })
                    .from(notificationDelivery)
                    .innerJoin(notificationEvent, eventJoin)
                    .where(
                        and(
                            deliveryWhere,
                            cursorAnchor
                                ? or(
                                      lt(
                                          notificationDelivery.createdAt,
                                          cursorAnchor.createdAt,
                                      ),
                                      and(
                                          eq(
                                              notificationDelivery.createdAt,
                                              cursorAnchor.createdAt,
                                          ),
                                          lt(
                                              notificationDelivery.notificationEventId,
                                              cursorAnchor.notificationEventId,
                                          ),
                                      ),
                                  )
                                : undefined,
                        ),
                    )
                    .orderBy(
                        desc(notificationDelivery.createdAt),
                        desc(notificationDelivery.notificationEventId),
                    )
                    .limit(input.limit + 1)
                const data = rows.slice(0, input.limit)
                const nextCursor =
                    rows.length > input.limit
                        ? data[data.length - 1]!.publicId
                        : null

                return apiResponseCursorPaginatedOkWrapper(ctx, {
                    data,
                    limit: input.limit,
                    nextCursor,
                })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.notificationListFetchFailed, {
                    cause: err,
                })
            }
        },
    )
    .post(
        '/markRead',
        tenantGuard,
        validateRequest('json', notification.markReadInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const db = ctx.get('dbClient')
            const { notificationDelivery, notificationEvent, user } =
                ctx.get('dbSchema')
            const organizationId = getActiveOrganizationId(ctx)
            const userId = ctx.get('user')!.id

            try {
                const publicIds = Array.from(
                    new Set(input.notificationPublicIds),
                )
                const delivered = (
                    await Promise.all(
                        Array.from(
                            { length: Math.ceil(publicIds.length / 95) },
                            (_, chunkIndex) =>
                                db
                                    .select({
                                        notificationEventId:
                                            notificationDelivery.notificationEventId,
                                        isRead: notificationDelivery.isRead,
                                        publicId: notificationEvent.publicId,
                                        userPublicId: user.publicId,
                                    })
                                    .from(notificationDelivery)
                                    .innerJoin(
                                        notificationEvent,
                                        and(
                                            eq(
                                                notificationEvent.organizationId,
                                                organizationId,
                                            ),
                                            eq(
                                                notificationEvent.id,
                                                notificationDelivery.notificationEventId,
                                            ),
                                        ),
                                    )
                                    .innerJoin(
                                        user,
                                        eq(
                                            user.id,
                                            notificationDelivery.userId,
                                        ),
                                    )
                                    .where(
                                        and(
                                            eq(
                                                notificationDelivery.organizationId,
                                                organizationId,
                                            ),
                                            eq(
                                                notificationDelivery.userId,
                                                userId,
                                            ),
                                            inArray(
                                                notificationEvent.publicId,
                                                publicIds.slice(
                                                    chunkIndex * 95,
                                                    (chunkIndex + 1) * 95,
                                                ),
                                            ),
                                        ),
                                    ),
                        ),
                    )
                ).flat()

                if (delivered.length !== publicIds.length) {
                    throw new AppError(catalog.notificationNotFound)
                }
                if (delivered.some(({ isRead }) => isRead)) {
                    throw new AppError(catalog.notificationAlreadyRead)
                }

                const readAt = new Date()
                const eventIds = delivered.map(
                    ({ notificationEventId }) => notificationEventId,
                )
                const database = db.$client
                const [updateResult] = await database.batch([
                    database
                        .prepare(
                            `UPDATE notification_delivery
                             SET is_read = 1, read_at = ?
                             WHERE organization_id = ?
                               AND user_id = ?
                               AND is_read = 0
                               AND notification_event_id IN (
                                   SELECT CAST(value AS INTEGER)
                                   FROM json_each(?)
                               )
                               AND (
                                   SELECT count(*) FROM notification_delivery candidate
                                   WHERE candidate.organization_id = ?
                                     AND candidate.user_id = ?
                                     AND candidate.is_read = 0
                                     AND candidate.notification_event_id IN (
                                         SELECT CAST(value AS INTEGER)
                                         FROM json_each(?)
                                     )
                               ) = ?`,
                        )
                        .bind(
                            readAt.getTime(),
                            organizationId,
                            userId,
                            JSON.stringify(eventIds),
                            organizationId,
                            userId,
                            JSON.stringify(eventIds),
                            eventIds.length,
                        ),
                    auditTrailAfterChangeStatement(
                        ctx,
                        auditTrailLogger.prepare({
                            component: 'user.notification',
                            action: 'markRead',
                            description: 'User marked notifications as read',
                            records: delivered.map(
                                ({ publicId, userPublicId }) => ({
                                    table: 'notification_delivery',
                                    id: `${userPublicId}:${publicId}`,
                                    oldData: {
                                        isRead: false,
                                        readAt: null,
                                    },
                                    newData: {
                                        isRead: true,
                                        readAt,
                                    },
                                }),
                            ),
                        }),
                        database,
                        eventIds.length,
                    ),
                ])

                if (updateResult.meta.changes !== publicIds.length) {
                    throw new AppError(catalog.notificationAlreadyRead)
                }
                const marked = updateResult.meta.changes
                markAuditTrailRecorded(ctx)

                return apiResponseOkWrapper(ctx, { data: { marked } })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.notificationMarkReadFailed, {
                    cause: err,
                })
            }
        },
    )
    .get('/unreadCount', tenantGuard, async (ctx) => {
        const { notificationDelivery } = ctx.get('dbSchema')
        const organizationId = getActiveOrganizationId(ctx)
        const userId = ctx.get('user')!.id

        try {
            const [{ count }] = await ctx
                .get('dbClient')
                .select({ count: sql<number>`count(*)`.mapWith(Number) })
                .from(notificationDelivery)
                .where(
                    and(
                        eq(notificationDelivery.organizationId, organizationId),
                        eq(notificationDelivery.userId, userId),
                        eq(notificationDelivery.isRead, false),
                    ),
                )

            return apiResponseOkWrapper(ctx, { data: { count } })
        } catch (err) {
            if (err instanceof AppError) throw err

            throw new AppError(catalog.notificationUnreadCountFetchFailed, {
                cause: err,
            })
        }
    })

export default notificationRoute
