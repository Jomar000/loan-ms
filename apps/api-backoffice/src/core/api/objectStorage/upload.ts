import { AppError, catalog, defineError } from '@loanms/errors'
import {
    uploadCommitInputSchema,
    uploadCreateInputSchema,
} from '@loanms/validator/backoffice/objectStorage'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { Hono } from 'hono'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    getActiveOrganizationId,
    markAuditTrailRecorded,
    nanoidCustom,
} from '../../../utilities/helpers.js'
import { isTenantAuthenticated } from '../../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../../middleware/validateRequest.js'

const uploadCommitConflict = defineError(
    'OBJECT_STORAGE_UPLOAD_COMMIT_CONFLICT',
    'CONFLICT',
    'Upload attachments changed before the upload could be committed.',
)
const tenantGuard = isTenantAuthenticated()

export const uploadRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .post(
        '/create',
        tenantGuard,
        validateRequest('json', uploadCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { upload } = ctx.get('dbSchema')

            try {
                const client = ctx.get('dbClient')
                const findExistingUpload = async () =>
                    (
                        await client
                            .select({
                                id: upload.id,
                                userId: upload.userId,
                            })
                            .from(upload)
                            .where(
                                and(
                                    eq(upload.organizationId, organizationId),
                                    eq(
                                        upload.idempotencyKey,
                                        input.idempotencyKey,
                                    ),
                                ),
                            )
                    )[0]
                const replay = await findExistingUpload()
                if (replay) {
                    if (replay.userId !== ctx.get('user')!.id) {
                        throw new AppError(
                            catalog.uploadIdempotencyOwnerConflict,
                        )
                    }
                    return apiResponseOkWrapper(ctx, {
                        data: { uploadId: replay.id },
                    })
                }

                const uploadId = nanoidCustom(16)
                try {
                    const now = Date.now()
                    await client.$client.batch([
                        client.$client
                            .prepare(
                                `INSERT INTO upload (
                                     id, organization_id, user_id,
                                     idempotency_key, is_committed,
                                     created_at, updated_at
                                 ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
                            )
                            .bind(
                                uploadId,
                                organizationId,
                                ctx.get('user')!.id,
                                input.idempotencyKey,
                                now,
                                now,
                            ),
                        auditTrailAfterChangeStatement(
                            ctx,
                            auditTrailLogger.prepare({
                                component: 'objectStorage.upload',
                                action: 'create',
                                description: 'Upload session created',
                                records: {
                                    table: 'upload',
                                    id: uploadId,
                                    newData: { isCommitted: false },
                                },
                            }),
                            client.$client,
                        ),
                    ])
                    markAuditTrailRecorded(ctx)
                } catch (error) {
                    const concurrentReplay = await findExistingUpload()
                    if (!concurrentReplay) throw error
                    if (concurrentReplay.userId !== ctx.get('user')!.id) {
                        throw new AppError(
                            catalog.uploadIdempotencyOwnerConflict,
                        )
                    }
                    return apiResponseOkWrapper(ctx, {
                        data: { uploadId: concurrentReplay.id },
                    })
                }

                return apiResponseOkWrapper(ctx, {
                    data: { uploadId },
                })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.uploadIdCreationFailed, {
                    cause: err,
                })
            }
        },
    )
    .post(
        '/commit',
        tenantGuard,
        validateRequest('json', uploadCommitInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const { objectStorage, upload, uploadAttachment } =
                ctx.get('dbSchema')

            const uploadData = await ctx
                .get('dbClient')
                .select({ id: upload.id, updatedAt: upload.updatedAt })
                .from(upload)
                .where(
                    and(
                        eq(upload.organizationId, organizationId),
                        eq(upload.id, input.uploadId),
                        ctx.get('isPrivilegedRole')
                            ? undefined
                            : eq(upload.userId, ctx.get('user')!.id),
                    ),
                )

            if (!uploadData[0]) {
                return apiResponseErrorWrapper(
                    ctx,
                    catalog.uploadNotFoundOrCommitted,
                )
            }

            try {
                const tx = ctx.get('dbClient')
                const committedAttachments = await (async () => {
                    const commitToken = Date.now()

                    const requestedAttachmentIds = [
                        ...new Set(input.attachments),
                    ]

                    if (requestedAttachmentIds.length > 0) {
                        const selectedAttachments = await tx
                            .select({
                                id: objectStorage.id,
                                isUploaded: objectStorage.isUploaded,
                            })
                            .from(uploadAttachment)
                            .innerJoin(
                                objectStorage,
                                eq(
                                    objectStorage.id,
                                    uploadAttachment.objectStorageId,
                                ),
                            )
                            .where(
                                and(
                                    eq(
                                        uploadAttachment.organizationId,
                                        organizationId,
                                    ),
                                    eq(
                                        uploadAttachment.uploadId,
                                        input.uploadId,
                                    ),
                                    eq(
                                        objectStorage.organizationId,
                                        organizationId,
                                    ),
                                    inArray(
                                        objectStorage.id,
                                        requestedAttachmentIds,
                                    ),
                                ),
                            )

                        if (
                            selectedAttachments.length !==
                            requestedAttachmentIds.length
                        ) {
                            throw new AppError(
                                catalog.uploadAttachmentsNotFound,
                            )
                        }

                        if (
                            selectedAttachments.some(
                                ({ isUploaded }) => !isUploaded,
                            )
                        ) {
                            throw new AppError(
                                catalog.uploadAttachmentsNotCommitted,
                            )
                        }
                    }

                    const attachmentsToPurge = (
                        await tx
                            .select({ id: objectStorage.id })
                            .from(upload)
                            .innerJoin(
                                uploadAttachment,
                                eq(upload.id, uploadAttachment.uploadId),
                            )
                            .innerJoin(
                                objectStorage,
                                eq(
                                    objectStorage.id,
                                    uploadAttachment.objectStorageId,
                                ),
                            )
                            .where(
                                and(
                                    eq(upload.organizationId, organizationId),
                                    eq(upload.id, input.uploadId),
                                    eq(
                                        uploadAttachment.organizationId,
                                        organizationId,
                                    ),
                                    eq(
                                        objectStorage.organizationId,
                                        organizationId,
                                    ),
                                    requestedAttachmentIds.length > 0
                                        ? notInArray(
                                              objectStorage.id,
                                              requestedAttachmentIds,
                                          )
                                        : undefined,
                                ),
                            )
                    ).map(({ id }) => id)

                    const database = tx.$client
                    const [commitResult] = await database.batch([
                        database
                            .prepare(
                                `UPDATE upload
                                     SET is_committed = 1, updated_at = ?
                                     WHERE organization_id = ?
                                       AND id = ?
                                       AND is_committed = 0
                                       AND updated_at = ?
                                       ${
                                           ctx.get('isPrivilegedRole')
                                               ? ''
                                               : 'AND user_id = ?'
                                       }`,
                            )
                            .bind(
                                commitToken,
                                organizationId,
                                input.uploadId,
                                uploadData[0].updatedAt.getTime(),
                                ...(ctx.get('isPrivilegedRole')
                                    ? []
                                    : [ctx.get('user')!.id]),
                            ),
                        auditTrailAfterChangeStatement(
                            ctx,
                            auditTrailLogger.prepare({
                                component: 'objectStorage.upload',
                                action: 'commit',
                                description: 'Upload committed',
                                records: [
                                    {
                                        table: 'upload',
                                        id: input.uploadId,
                                        oldData: { isCommitted: false },
                                        newData: { isCommitted: true },
                                    },
                                    ...attachmentsToPurge.map(
                                        (objectStorageId) => ({
                                            table: 'upload_attachment',
                                            id: `${input.uploadId}:${objectStorageId}`,
                                            oldData: {
                                                uploadId: input.uploadId,
                                                objectStorageId,
                                            },
                                        }),
                                    ),
                                ],
                            }),
                            database,
                        ),
                        ...attachmentsToPurge.map((objectStorageId) =>
                            database
                                .prepare(
                                    `DELETE FROM upload_attachment
                                         WHERE organization_id = ?
                                           AND upload_id = ?
                                           AND object_storage_id = ?
                                           AND EXISTS (
                                               SELECT 1 FROM upload
                                               WHERE organization_id = ?
                                                 AND id = ?
                                                 AND updated_at = ?
                                                 AND is_committed = 1
                                           )`,
                                )
                                .bind(
                                    organizationId,
                                    input.uploadId,
                                    objectStorageId,
                                    organizationId,
                                    input.uploadId,
                                    commitToken,
                                ),
                        ),
                    ])
                    if (commitResult.meta.changes !== 1) {
                        const [currentUpload] = await tx
                            .select({ isCommitted: upload.isCommitted })
                            .from(upload)
                            .where(
                                and(
                                    eq(upload.organizationId, organizationId),
                                    eq(upload.id, input.uploadId),
                                ),
                            )
                            .limit(1)

                        if (currentUpload && !currentUpload.isCommitted) {
                            throw new AppError(uploadCommitConflict)
                        }

                        throw new AppError(catalog.uploadAlreadyCommitted)
                    }

                    markAuditTrailRecorded(ctx)
                    return await tx
                        .select({ id: objectStorage.id })
                        .from(upload)
                        .innerJoin(
                            uploadAttachment,
                            eq(upload.id, uploadAttachment.uploadId),
                        )
                        .innerJoin(
                            objectStorage,
                            eq(
                                objectStorage.id,
                                uploadAttachment.objectStorageId,
                            ),
                        )
                        .where(
                            and(
                                eq(upload.organizationId, organizationId),
                                eq(upload.id, input.uploadId),
                                eq(
                                    uploadAttachment.organizationId,
                                    organizationId,
                                ),
                                eq(
                                    objectStorage.organizationId,
                                    organizationId,
                                ),
                            ),
                        )
                })()

                return apiResponseOkWrapper(ctx, {
                    data: {
                        uploadId: input.uploadId,
                        attachments: committedAttachments.map(({ id }) => id),
                    },
                })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.uploadCommitFailed, { cause: err })
            }
        },
    )

export default uploadRoute
