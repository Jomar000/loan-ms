import { AppError, catalog, defineError } from '@hyperion/errors'
import { address as addressValidator } from '@hyperion/validator/backoffice/user'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { v7 as uuidv7 } from 'uuid'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    markAuditTrailRecorded,
} from '../../../utilities/helpers.js'
import { isTenantAuthenticated } from '../../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../../middleware/validateRequest.js'

type TDatabaseSchema = typeof import('@hyperion/database/d1').dbSchema

const addressSelection = (userAddress: TDatabaseSchema['userAddress']) => ({
    publicId: userAddress.publicId,
    type: userAddress.type,
    label: userAddress.label,
    isPrimary: userAddress.isPrimary,
    addressLine1: userAddress.addressLine1,
    addressLine2: userAddress.addressLine2,
    dependentLocality: userAddress.dependentLocality,
    locality: userAddress.locality,
    administrativeArea: userAddress.administrativeArea,
    postalCode: userAddress.postalCode,
    countryCode: userAddress.countryCode,
    psgcCode: userAddress.psgcCode,
})

const addressValues = (input: {
    type: 'RESIDENTIAL' | 'MAILING' | 'OTHER'
    label?: string
    addressLine1: string
    addressLine2?: string
    dependentLocality?: string
    locality?: string
    administrativeArea?: string
    postalCode?: string
    countryCode: string
    psgcCode?: string
}) => ({
    type: input.type,
    label: input.label ?? null,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? null,
    dependentLocality: input.dependentLocality ?? null,
    locality: input.locality ?? null,
    administrativeArea: input.administrativeArea ?? null,
    postalCode: input.postalCode ?? null,
    countryCode: input.countryCode,
    psgcCode: input.psgcCode ?? null,
})

const addressNotFound = () => new AppError(catalog.addressNotFound)
const addressDeleteConflict = defineError(
    'USER_ADDRESS_DELETE_CONFLICT',
    'CONFLICT',
    'Address changed before it could be deleted.',
)
const addressUpdateConflict = defineError(
    'USER_ADDRESS_UPDATE_CONFLICT',
    'CONFLICT',
    'Address changed before it could be updated.',
)
const tenantGuard = isTenantAuthenticated()

export const addressRoute = new Hono<THonoInstance>()
    .get('/readMany', tenantGuard, async (ctx) => {
        const { userAddress } = ctx.get('dbSchema')
        const data = await ctx
            .get('dbClient')
            .select(addressSelection(userAddress))
            .from(userAddress)
            .where(eq(userAddress.userId, ctx.get('user')!.id))
            .orderBy(desc(userAddress.isPrimary), asc(userAddress.createdAt))

        return apiResponseOkWrapper(ctx, { data })
    })
    .post(
        '/create',
        tenantGuard,
        validateRequest('json', addressValidator.createInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const userId = ctx.get('user')!.id
            const { userAddress } = ctx.get('dbSchema')

            const db = ctx.get('dbClient')
            const [existing] = await db
                .select(addressSelection(userAddress))
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.idempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)

            if (existing)
                return apiResponseOkWrapper(ctx, {
                    data: existing,
                    status: 201,
                })

            const publicId = uuidv7()
            const values = addressValues(input)
            const previousPrimaries = input.makePrimary
                ? await db
                      .select(addressSelection(userAddress))
                      .from(userAddress)
                      .where(
                          and(
                              eq(userAddress.userId, userId),
                              eq(userAddress.isPrimary, true),
                          ),
                      )
                : []
            const database = db.$client
            const insertStatement = database
                .prepare(
                    `INSERT INTO user_address (
                         public_id, user_id, type, label, is_primary,
                         address_line_1, address_line_2, dependent_locality,
                         locality, administrative_area, postal_code,
                         country_code, psgc_code, idempotency_key
                     ) VALUES (
                         ?, ?, ?, ?,
                         CASE
                             WHEN NOT EXISTS (
                                 SELECT 1 FROM user_address WHERE user_id = ?
                             ) THEN 1 ELSE 0
                         END,
                         ?, ?, ?, ?, ?, ?, ?, ?, ?
                     )
                     ON CONFLICT(user_id, idempotency_key) DO NOTHING`,
                )
                .bind(
                    publicId,
                    userId,
                    values.type,
                    values.label,
                    userId,
                    values.addressLine1,
                    values.addressLine2,
                    values.dependentLocality,
                    values.locality,
                    values.administrativeArea,
                    values.postalCode,
                    values.countryCode,
                    values.psgcCode,
                    input.idempotencyKey,
                )
            const auditStatement = auditTrailAfterChangeStatement(
                ctx,
                auditTrailLogger.prepare({
                    component: 'user.address',
                    action: 'create',
                    description: 'User created an address',
                    records: [
                        {
                            table: 'user_address',
                            id: publicId,
                            newData: {
                                ...values,
                                isPrimary: input.makePrimary,
                            },
                        },
                        ...previousPrimaries.map((oldData) => ({
                            table: 'user_address',
                            id: oldData.publicId,
                            oldData,
                            newData: { ...oldData, isPrimary: false },
                        })),
                    ],
                }),
                database,
            )
            let auditRecorded: boolean
            if (input.makePrimary) {
                const [insertResult] = await database.batch([
                    insertStatement,
                    database
                        .prepare(
                            `UPDATE user_address
                             SET is_primary = CASE WHEN public_id = ? THEN 1 ELSE 0 END
                             WHERE user_id = ?
                               AND changes() = 1
                               AND (is_primary = 1 OR public_id = ?)`,
                        )
                        .bind(publicId, userId, publicId),
                    auditStatement,
                ])
                auditRecorded = insertResult.meta.changes === 1
            } else {
                const [insertResult] = await database.batch([
                    insertStatement,
                    auditStatement,
                ])
                auditRecorded = insertResult.meta.changes === 1
            }

            const [data] = await db
                .select(addressSelection(userAddress))
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.idempotencyKey, input.idempotencyKey),
                    ),
                )
                .limit(1)

            if (auditRecorded) markAuditTrailRecorded(ctx)

            return apiResponseOkWrapper(ctx, { data, status: 201 })
        },
    )
    .post(
        '/delete',
        tenantGuard,
        validateRequest('json', addressValidator.deleteInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const userId = ctx.get('user')!.id
            const { userAddress } = ctx.get('dbSchema')

            const db = ctx.get('dbClient')
            const [existing] = await db
                .select({
                    id: userAddress.id,
                    updatedAt: userAddress.updatedAt,
                    ...addressSelection(userAddress),
                })
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.publicId, input.publicId),
                    ),
                )
                .limit(1)

            if (!existing) throw addressNotFound()

            const [replacement] = existing.isPrimary
                ? await db
                      .select({
                          id: userAddress.id,
                          ...addressSelection(userAddress),
                      })
                      .from(userAddress)
                      .where(
                          and(
                              eq(userAddress.userId, userId),
                              ne(userAddress.id, existing.id),
                          ),
                      )
                      .orderBy(asc(userAddress.createdAt), asc(userAddress.id))
                      .limit(1)
                : [undefined]

            const database = db.$client
            const deleteStatement = database
                .prepare(
                    `DELETE FROM user_address
                     WHERE user_id = ? AND id = ? AND updated_at = ?`,
                )
                .bind(userId, existing.id, existing.updatedAt.getTime())
            const auditStatement = auditTrailAfterChangeStatement(
                ctx,
                auditTrailLogger.prepare({
                    component: 'user.address',
                    action: 'delete',
                    description: 'User deleted an address',
                    records: [
                        {
                            table: 'user_address',
                            id: input.publicId,
                            oldData: existing,
                        },
                        ...(replacement
                            ? [
                                  {
                                      table: 'user_address',
                                      id: replacement.publicId,
                                      oldData: replacement,
                                      newData: {
                                          ...replacement,
                                          isPrimary: true,
                                      },
                                  },
                              ]
                            : []),
                    ],
                }),
                database,
            )
            if (replacement) {
                try {
                    await database.batch([
                        deleteStatement,
                        database
                            .prepare(
                                `UPDATE user_address
                                 SET is_primary = 1
                                 WHERE user_id = ? AND id = ? AND changes() = 1`,
                            )
                            .bind(userId, replacement.id),
                        database.prepare(
                            `SELECT CASE
                                 WHEN changes() = 1 THEN 1
                                 ELSE json('ADDRESS_DELETE_CONFLICT')
                             END`,
                        ),
                        auditStatement,
                    ])
                } catch (error) {
                    let isStateConflict: boolean
                    try {
                        const [
                            currentTarget,
                            currentReplacement,
                        ] = await Promise.all([
                            db
                                .select({
                                    updatedAt: userAddress.updatedAt,
                                })
                                .from(userAddress)
                                .where(
                                    and(
                                        eq(userAddress.userId, userId),
                                        eq(userAddress.id, existing.id),
                                    ),
                                )
                                .limit(1),
                            db
                                .select({ id: userAddress.id })
                                .from(userAddress)
                                .where(
                                    and(
                                        eq(userAddress.userId, userId),
                                        eq(userAddress.id, replacement.id),
                                    ),
                                )
                                .limit(1),
                        ])

                        isStateConflict =
                            !currentTarget[0] ||
                            currentTarget[0].updatedAt.getTime() !==
                                existing.updatedAt.getTime() ||
                            !currentReplacement[0]
                    } catch {
                        throw error
                    }

                    if (!isStateConflict) throw error

                    throw new AppError(addressDeleteConflict, {
                        cause: error,
                    })
                }
            } else {
                const [deleteResult] = await database.batch([
                    deleteStatement,
                    auditStatement,
                ])
                if (deleteResult.meta.changes !== 1) {
                    throw new AppError(addressDeleteConflict)
                }
            }

            markAuditTrailRecorded(ctx)

            return apiResponseOkWrapper(ctx, { data: {} })
        },
    )
    .post(
        '/setPrimary',
        tenantGuard,
        validateRequest('json', addressValidator.setPrimaryInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const userId = ctx.get('user')!.id
            const { userAddress } = ctx.get('dbSchema')

            const db = ctx.get('dbClient')
            const [existing] = await db
                .select({
                    id: userAddress.id,
                    ...addressSelection(userAddress),
                })
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.publicId, input.publicId),
                    ),
                )
                .limit(1)

            if (!existing) throw addressNotFound()

            if (existing.isPrimary) {
                throw new AppError(catalog.httpConflict)
            }

            const previousPrimaries = await db
                .select(addressSelection(userAddress))
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.isPrimary, true),
                    ),
                )
            const database = db.$client
            const [updateResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE user_address
                             SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END
                             WHERE user_id = ?
                               AND EXISTS (
                                   SELECT 1 FROM user_address target
                                   WHERE target.user_id = ? AND target.id = ?
                               )
                               AND is_primary <> CASE WHEN id = ? THEN 1 ELSE 0 END`,
                    )
                    .bind(
                        existing.id,
                        userId,
                        userId,
                        existing.id,
                        existing.id,
                    ),
                auditTrailAfterChangeStatement(
                    ctx,
                    auditTrailLogger.prepare({
                        component: 'user.address',
                        action: 'setPrimary',
                        description: 'User selected a primary address',
                        records: [
                            ...previousPrimaries.map((oldData) => ({
                                table: 'user_address',
                                id: oldData.publicId,
                                oldData,
                                newData: {
                                    ...oldData,
                                    isPrimary: false,
                                },
                            })),
                            {
                                table: 'user_address',
                                id: input.publicId,
                                oldData: existing,
                                newData: {
                                    ...existing,
                                    isPrimary: true,
                                },
                            },
                        ],
                    }),
                    database,
                ),
            ])
            if (updateResult.meta.changes === 0) {
                throw new AppError(addressUpdateConflict)
            }
            markAuditTrailRecorded(ctx)

            const [data] = await db
                .select(addressSelection(userAddress))
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.id, existing.id),
                    ),
                )

            return apiResponseOkWrapper(ctx, { data })
        },
    )
    .post(
        '/update',
        tenantGuard,
        validateRequest('json', addressValidator.updateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const userId = ctx.get('user')!.id
            const { userAddress } = ctx.get('dbSchema')

            const db = ctx.get('dbClient')
            const [existing] = await db
                .select({
                    ...addressSelection(userAddress),
                    updatedAt: userAddress.updatedAt,
                })
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.publicId, input.publicId),
                    ),
                )
                .limit(1)

            if (!existing) throw addressNotFound()

            const { updatedAt, ...oldData } = existing
            const values = addressValues(input)
            const database = db.$client
            const nextUpdatedAt = Math.max(Date.now(), updatedAt.getTime() + 1)
            const auditData = auditTrailLogger.prepare({
                component: 'user.address',
                action: 'update',
                description: 'User updated an address',
                records: {
                    table: 'user_address',
                    id: input.publicId,
                    oldData,
                    newData: values,
                },
            })
            const [updateResult] = await database.batch([
                database
                    .prepare(
                        `UPDATE user_address
                         SET type = ?, label = ?, address_line_1 = ?,
                             address_line_2 = ?, dependent_locality = ?,
                             locality = ?, administrative_area = ?,
                             postal_code = ?, country_code = ?, psgc_code = ?,
                             updated_at = ?
                         WHERE user_id = ? AND public_id = ? AND updated_at = ?`,
                    )
                    .bind(
                        values.type,
                        values.label,
                        values.addressLine1,
                        values.addressLine2,
                        values.dependentLocality,
                        values.locality,
                        values.administrativeArea,
                        values.postalCode,
                        values.countryCode,
                        values.psgcCode,
                        nextUpdatedAt,
                        userId,
                        input.publicId,
                        updatedAt.getTime(),
                    ),
                auditTrailAfterChangeStatement(ctx, auditData, database),
            ])
            if (updateResult.meta.changes !== 1) {
                throw new AppError(addressUpdateConflict)
            }
            if (auditData) markAuditTrailRecorded(ctx)

            const [data] = await db
                .select(addressSelection(userAddress))
                .from(userAddress)
                .where(
                    and(
                        eq(userAddress.userId, userId),
                        eq(userAddress.publicId, input.publicId),
                    ),
                )

            return apiResponseOkWrapper(ctx, { data })
        },
    )

export default addressRoute
