import { AppError, catalog } from '@hyperion/errors'
import {
    uploadAttachmentCommitInputSchema,
    uploadAttachmentCreateInputSchema,
    uploadAttachmentRetryInputSchema,
} from '@hyperion/validator/public/objectStorage'
import { hexToBytes } from '@noble/hashes/utils.js'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { encodeBase64 } from 'hono/utils/encode'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    auditTrailAfterChangeStatement,
    auditTrailLogger,
    auditTrailQuery,
    getActiveOrganizationId,
    markAuditTrailRecorded,
    nanoidCustom,
} from '../../../utilities/helpers.js'
import { isTenantAuthenticated } from '../../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../../middleware/validateRequest.js'

const tenantGuard = isTenantAuthenticated()

export const uploadAttachmentRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .post(
        '/create',
        tenantGuard,
        validateRequest('json', uploadAttachmentCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { accountId, bucketPrivate, bucketPublic, presignExpiry } =
                ctx.get('objectStorageConfiguration')

            const {
                objectStorage,
                objectStorageAcl,
                upload,
                uploadAttachment,
                uploadAttachmentBatchRequest,
            } = ctx.get('dbSchema')

            const hashesToCheck = input.attachments.map(
                ({ hashSha256 }) => hashSha256,
            )
            const requestFingerprint = JSON.stringify({
                attachments: input.attachments,
                uploadId: input.uploadId,
            })
            const userId = ctx.get('user')!.id

            let auditRecorded = false
            const createAttachments = async () => {
                const tx = ctx.get('dbClient')
                return (async () => {
                    const [replay] = await tx
                        .select({
                            requestFingerprint:
                                uploadAttachmentBatchRequest.requestFingerprint,
                            responseData:
                                uploadAttachmentBatchRequest.responseData,
                            userId: uploadAttachmentBatchRequest.userId,
                        })
                        .from(uploadAttachmentBatchRequest)
                        .where(
                            and(
                                eq(
                                    uploadAttachmentBatchRequest.organizationId,
                                    organizationId,
                                ),
                                eq(
                                    uploadAttachmentBatchRequest.idempotencyKey,
                                    input.idempotencyKey,
                                ),
                            ),
                        )
                        .limit(1)

                    if (replay) {
                        if (
                            replay.userId !== userId ||
                            replay.requestFingerprint !== requestFingerprint
                        ) {
                            throw new AppError(
                                catalog.uploadAttachmentIdempotencyConflict,
                            )
                        }

                        return replay.responseData as {
                            uploadId: string
                            signedUrls: {
                                encodedHash: string | null
                                hashSha256: string
                                id: string
                                signedUrl: string | null
                                status: 201 | 409
                            }[]
                        }
                    }

                    const [activeUpload] = await tx
                        .select({
                            id: upload.id,
                            isCommitted: upload.isCommitted,
                            updatedAt: upload.updatedAt,
                        })
                        .from(upload)
                        .where(
                            and(
                                eq(upload.organizationId, organizationId),
                                eq(upload.id, input.uploadId),
                                ctx.get('isPrivilegedRole')
                                    ? undefined
                                    : eq(upload.userId, userId),
                            ),
                        )
                        .limit(1)

                    if (!activeUpload) {
                        throw new AppError(catalog.uploadNotFoundOrCommitted)
                    }

                    if (activeUpload.isCommitted) {
                        throw new AppError(catalog.uploadAlreadyCommitted)
                    }

                    const existingObjects = await tx
                        .select({
                            id: objectStorage.id,
                            hashSha256: objectStorage.hashSha256,
                            isPublic: objectStorage.isPublic,
                            isUploaded: objectStorage.isUploaded,
                        })
                        .from(objectStorage)
                        .where(
                            and(
                                eq(
                                    objectStorage.organizationId,
                                    organizationId,
                                ),
                                inArray(
                                    objectStorage.hashSha256,
                                    hashesToCheck,
                                ),
                            ),
                        )
                        .orderBy(objectStorage.id)

                    const existingObjectsByHashAndBucket = new Map(
                        existingObjects.map((os) => [
                            `${os.hashSha256}:${String(os.isPublic)}`,
                            os,
                        ]),
                    )

                    const objectStorageData: Pick<
                        typeof objectStorage.$inferInsert,
                        | 'id'
                        | 'organizationId'
                        | 'size'
                        | 'mimeType'
                        | 'hashSha256'
                        | 'isPublic'
                    >[] = []

                    const objectStorageAclData: Pick<
                        typeof objectStorageAcl.$inferInsert,
                        'organizationId' | 'userId' | 'objectStorageId'
                    >[] = []

                    const uploadAttachmentData: Pick<
                        typeof uploadAttachment.$inferInsert,
                        'organizationId' | 'uploadId' | 'objectStorageId'
                    >[] = []

                    const prepared: {
                        id: string
                        hashSha256: string
                        encodedHash: string | null
                        isPublic: boolean
                        status: 201 | 409
                    }[] = []

                    for (const attachment of input.attachments) {
                        const existingObject =
                            existingObjectsByHashAndBucket.get(
                                `${attachment.hashSha256}:${String(
                                    attachment.isPublic,
                                )}`,
                            )

                        const objectStorageId =
                            existingObject?.id ?? nanoidCustom(32)
                        const isPublic =
                            existingObject?.isPublic ?? attachment.isPublic

                        if (!existingObject) {
                            objectStorageData.push({
                                organizationId,
                                id: objectStorageId,
                                ...attachment,
                                isPublic,
                                size: Number(attachment.size),
                            })
                        }

                        uploadAttachmentData.push({
                            organizationId,
                            uploadId: input.uploadId,
                            objectStorageId,
                        })

                        objectStorageAclData.push({
                            organizationId,
                            userId: ctx.get('user')!.id,
                            objectStorageId,
                        })

                        if (existingObject?.isUploaded) {
                            prepared.push({
                                id: objectStorageId,
                                hashSha256: attachment.hashSha256,
                                encodedHash: null,
                                isPublic,
                                status: 409,
                            })
                            continue
                        }

                        prepared.push({
                            id: objectStorageId,
                            hashSha256: attachment.hashSha256,
                            encodedHash: encodeBase64(
                                hexToBytes(attachment.hashSha256).buffer,
                            ),
                            isPublic,
                            status: 201,
                        })
                    }

                    const signedUrls = await Promise.all(
                        prepared.map(async (preparedAttachment) => {
                            if (preparedAttachment.status === 409) {
                                return {
                                    id: preparedAttachment.id,
                                    hashSha256: preparedAttachment.hashSha256,
                                    encodedHash: null,
                                    signedUrl: null,
                                    status: preparedAttachment.status,
                                }
                            }

                            const uploadBucket = preparedAttachment.isPublic
                                ? bucketPublic
                                : bucketPrivate
                            const signed = await ctx
                                .get('aws4FetchClient')
                                .sign(
                                    `https://${accountId}.r2.cloudflarestorage.com/${uploadBucket}/${preparedAttachment.id}?X-Amz-Expires=${presignExpiry}`,
                                    {
                                        method: 'PUT',
                                        headers: {
                                            'x-amz-checksum-sha256':
                                                preparedAttachment.encodedHash!,
                                        },
                                        aws: {
                                            service: 's3',
                                            signQuery: true,
                                        },
                                    },
                                )

                            return {
                                id: preparedAttachment.id,
                                hashSha256: preparedAttachment.hashSha256,
                                encodedHash: preparedAttachment.encodedHash,
                                signedUrl: signed.url,
                                status: preparedAttachment.status,
                            }
                        }),
                    )
                    const responseData = {
                        uploadId: input.uploadId,
                        signedUrls,
                    }
                    const nextUploadUpdatedAt = new Date(
                        Math.max(
                            Date.now(),
                            activeUpload.updatedAt.getTime() + 1,
                        ),
                    )
                    const uploadStateGuard = tx
                        .update(upload)
                        .set({ updatedAt: nextUploadUpdatedAt })
                        .where(
                            and(
                                eq(upload.organizationId, organizationId),
                                eq(upload.id, input.uploadId),
                                eq(upload.isCommitted, false),
                                eq(upload.updatedAt, activeUpload.updatedAt),
                                ctx.get('isPrivilegedRole')
                                    ? undefined
                                    : eq(upload.userId, userId),
                            ),
                        )
                    const uploadStateCheck = tx
                        .select({
                            valid: sql<number>`CASE
                                WHEN changes() = 1 THEN 1
                                ELSE json('UPLOAD_ATTACHMENT_STATE_CONFLICT')
                            END`,
                        })
                        .from(upload)
                        .limit(1)

                    const aclInsert = tx
                        .insert(objectStorageAcl)
                        .values(objectStorageAclData)
                        .onConflictDoNothing()
                    const attachmentInsert = tx
                        .insert(uploadAttachment)
                        .values(uploadAttachmentData)
                        .onConflictDoNothing()
                    const auditInsert = auditTrailQuery(
                        ctx,
                        auditTrailLogger.prepare({
                            component: 'objectStorage.uploadAttachment',
                            action: 'create',
                            description: 'Attachments added to upload session',
                            records: [
                                ...objectStorageData.map((record) => ({
                                    table: 'object_storage',
                                    id: record.id,
                                    newData: record,
                                })),
                                ...uploadAttachmentData.map((record) => ({
                                    table: 'upload_attachment',
                                    id: `${record.uploadId}:${record.objectStorageId}`,
                                    newData: record,
                                })),
                            ],
                        })!,
                        tx,
                    )
                    const ledgerInsert = tx
                        .insert(uploadAttachmentBatchRequest)
                        .values({
                            idempotencyKey: input.idempotencyKey,
                            organizationId,
                            requestFingerprint,
                            responseData,
                            uploadId: input.uploadId,
                            userId,
                        })
                    const objectStorageInserts = Array.from(
                        {
                            length: Math.ceil(objectStorageData.length / 16),
                        },
                        (_, chunkIndex) =>
                            tx
                                .insert(objectStorage)
                                .values(
                                    objectStorageData.slice(
                                        chunkIndex * 16,
                                        (chunkIndex + 1) * 16,
                                    ),
                                ),
                    )
                    const batchQueries = [
                        uploadStateGuard,
                        uploadStateCheck,
                        ...objectStorageInserts,
                        aclInsert,
                        attachmentInsert,
                        auditInsert,
                        ledgerInsert,
                    ]
                    await tx.batch(
                        batchQueries as [
                            (typeof batchQueries)[number],
                            ...(typeof batchQueries)[number][],
                        ],
                    )
                    auditRecorded = true

                    return responseData
                })()
            }

            try {
                let data
                try {
                    data = await createAttachments()
                } catch (error) {
                    if (error instanceof AppError) throw error
                    data = await createAttachments()
                }

                if (auditRecorded) markAuditTrailRecorded(ctx)
                return apiResponseOkWrapper(ctx, { data })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.uploadAttachmentAdditionFailed, {
                    cause: err,
                })
            }
        },
    )
    .on(
        'QUERY',
        '/retry',
        tenantGuard,
        validateRequest('json', uploadAttachmentRetryInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)
            const { accountId, bucketPrivate, bucketPublic, presignExpiry } =
                ctx.get('objectStorageConfiguration')

            const { objectStorage, upload, uploadAttachment } =
                ctx.get('dbSchema')

            const uploadData = await ctx
                .get('dbClient')
                .select({ id: upload.id })
                .from(upload)
                .where(
                    and(
                        eq(upload.organizationId, organizationId),
                        eq(upload.id, input.uploadId),
                        eq(upload.isCommitted, false),
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

            const attachmentData = await ctx
                .get('dbClient')
                .select({
                    id: objectStorage.id,
                    isUploaded: objectStorage.isUploaded,
                    isPublic: objectStorage.isPublic,
                    hashSha256: objectStorage.hashSha256,
                })
                .from(objectStorage)
                .innerJoin(
                    uploadAttachment,
                    eq(uploadAttachment.objectStorageId, objectStorage.id),
                )
                .innerJoin(upload, eq(upload.id, uploadAttachment.uploadId))
                .where(
                    and(
                        eq(objectStorage.organizationId, organizationId),
                        eq(uploadAttachment.organizationId, organizationId),
                        eq(upload.organizationId, organizationId),
                        eq(upload.id, input.uploadId),
                        inArray(objectStorage.id, input.attachments),
                    ),
                )

            const attachmentsToRetry = attachmentData.reduce(
                (accumulator, { id, isUploaded, isPublic, hashSha256 }) => {
                    accumulator.set(id, {
                        isUploaded,
                        isPublic,
                        hashSha256,
                    })
                    return accumulator
                },
                new Map<
                    string,
                    {
                        isUploaded: boolean
                        isPublic: boolean
                        hashSha256: string
                    }
                >(),
            )

            // Generate pre-signed upload URLs
            const signedUrls = await Promise.all(
                input.attachments.map(async (objectStorageId) => {
                    if (attachmentsToRetry.has(objectStorageId)) {
                        const { hashSha256, isUploaded, isPublic } =
                            attachmentsToRetry.get(objectStorageId)!

                        if (isUploaded) {
                            return {
                                id: objectStorageId,
                                hashSha256,
                                encodedHash: null,
                                signedUrl: null,
                                status: 409 as const,
                            }
                        }

                        // Encode SHA-256 hash to Base64
                        const hashBase64 = encodeBase64(
                            hexToBytes(hashSha256).buffer,
                        )

                        const uploadBucket = isPublic
                            ? bucketPublic
                            : bucketPrivate

                        return {
                            id: objectStorageId,
                            hashSha256: hashSha256,
                            encodedHash: hashBase64,
                            signedUrl: (
                                await ctx
                                    .get('aws4FetchClient')
                                    .sign(
                                        `https://${accountId}.r2.cloudflarestorage.com/${uploadBucket}/${objectStorageId}?X-Amz-Expires=${presignExpiry}`,
                                        {
                                            method: 'PUT',
                                            headers: {
                                                // https://developers.cloudflare.com/r2/api/s3/api/#checksum-types
                                                'x-amz-checksum-sha256':
                                                    hashBase64,
                                            },
                                            aws: {
                                                service: 's3',
                                                signQuery: true,
                                            },
                                        },
                                    )
                            ).url,
                            status: 200 as const,
                        }
                    }

                    return {
                        id: objectStorageId,
                        hashSha256: null,
                        encodedHash: null,
                        signedUrl: null,
                        status: 404 as const,
                    }
                }),
            )

            return apiResponseOkWrapper(ctx, {
                data: { uploadId: input.uploadId, signedUrls },
            })
        },
    )
    .post(
        '/commit',
        tenantGuard,
        validateRequest('json', uploadAttachmentCommitInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const { objectStorage, upload, uploadAttachment } =
                ctx.get('dbSchema')

            const uploadData = await ctx
                .get('dbClient')
                .select({ id: upload.id })
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
                const data = await (async () => {
                    const [activeUpload] = await tx
                        .select({ id: upload.id })
                        .from(upload)
                        .where(
                            and(
                                eq(upload.organizationId, organizationId),
                                eq(upload.id, input.uploadId),
                                eq(upload.isCommitted, false),
                                ctx.get('isPrivilegedRole')
                                    ? undefined
                                    : eq(upload.userId, ctx.get('user')!.id),
                            ),
                        )
                        .limit(1)

                    if (!activeUpload) {
                        throw new AppError(catalog.uploadAlreadyCommitted)
                    }

                    const requestedAttachmentIds = [
                        ...new Set(input.attachments),
                    ]

                    const attachmentsToCommit = await tx
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
                                eq(uploadAttachment.uploadId, input.uploadId),
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
                        .orderBy(objectStorage.id)

                    if (
                        attachmentsToCommit.length !==
                        requestedAttachmentIds.length
                    ) {
                        throw new AppError(catalog.uploadAttachmentsNotFound)
                    }

                    if (
                        attachmentsToCommit.some(({ isUploaded }) => isUploaded)
                    ) {
                        throw new AppError(
                            catalog.uploadAttachmentsAlreadyCommitted,
                        )
                    }

                    const committedAttachmentIds = attachmentsToCommit.map(
                        ({ id }) => id,
                    )
                    const placeholders = committedAttachmentIds
                        .map(() => '?')
                        .join(', ')
                    const now = Date.now()
                    const database = tx.$client
                    const [commitResult] = await database.batch([
                        database
                            .prepare(
                                `UPDATE object_storage
                                     SET is_uploaded = 1, updated_at = ?
                                     WHERE organization_id = ?
                                       AND is_uploaded = 0
                                       AND id IN (${placeholders})
                                       AND (
                                           SELECT count(*)
                                           FROM object_storage candidate
                                           INNER JOIN upload_attachment ua
                                             ON ua.object_storage_id = candidate.id
                                            AND ua.organization_id = candidate.organization_id
                                           INNER JOIN upload active_upload
                                             ON active_upload.id = ua.upload_id
                                            AND active_upload.organization_id = ua.organization_id
                                           WHERE candidate.organization_id = ?
                                             AND candidate.is_uploaded = 0
                                             AND candidate.id IN (${placeholders})
                                             AND ua.upload_id = ?
                                             AND active_upload.is_committed = 0
                                             ${
                                                 ctx.get('isPrivilegedRole')
                                                     ? ''
                                                     : 'AND active_upload.user_id = ?'
                                             }
                                       ) = ?`,
                            )
                            .bind(
                                now,
                                organizationId,
                                ...committedAttachmentIds,
                                organizationId,
                                ...committedAttachmentIds,
                                input.uploadId,
                                ...(ctx.get('isPrivilegedRole')
                                    ? []
                                    : [ctx.get('user')!.id]),
                                committedAttachmentIds.length,
                            ),
                        auditTrailAfterChangeStatement(
                            ctx,
                            auditTrailLogger.prepare({
                                component: 'objectStorage.uploadAttachment',
                                action: 'commit',
                                description: 'Attachments marked as uploaded',
                                records: committedAttachmentIds.map((id) => ({
                                    table: 'object_storage',
                                    id,
                                    oldData: { isUploaded: false },
                                    newData: { isUploaded: true },
                                })),
                            }),
                            database,
                            committedAttachmentIds.length,
                        ),
                    ])

                    if (
                        commitResult.meta.changes !==
                        requestedAttachmentIds.length
                    ) {
                        throw new AppError(
                            catalog.uploadAttachmentsAlreadyCommitted,
                        )
                    }

                    markAuditTrailRecorded(ctx)
                    return {
                        uploadId: input.uploadId,
                        attachments: committedAttachmentIds,
                    }
                })()

                return apiResponseOkWrapper(ctx, { data })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.uploadAttachmentCommitFailed, {
                    cause: err,
                })
            }
        },
    )

export default uploadAttachmentRoute
