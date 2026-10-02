import { AppError, catalog } from '@hyperion/errors'
import {
    downloadLinkCreateInputSchema,
    downloadReadManyInputSchema,
} from '@hyperion/validator/public/objectStorage'
import { and, asc, count as countFn, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import type { THonoInstance } from '../../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
    apiResponsePaginatedOkWrapper,
    getActiveOrganizationId,
} from '../../../utilities/helpers.js'
import { isTenantAuthenticated } from '../../middleware/isTenantAuthenticated.js'
import { validateRequest } from '../../middleware/validateRequest.js'

const tenantGuard = isTenantAuthenticated()

export const downloadRoute = new Hono<THonoInstance>()
    /**
     * @description
     * Routes
     */
    .get(
        '/link/create',
        tenantGuard,
        validateRequest('query', downloadLinkCreateInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('query')
            const organizationId = getActiveOrganizationId(ctx)
            const { accountId, bucketPrivate, bucketPublicUrl, presignExpiry } =
                ctx.get('objectStorageConfiguration')

            const {
                objectStorage,
                objectStorageAcl,
                upload,
                uploadAttachment,
            } = ctx.get('dbSchema')

            const linkedObjects = await ctx
                .get('dbClient')
                .select({
                    objectStorage,
                    objectStorageAcl,
                    uploadAttachment,
                    upload,
                })
                .from(objectStorage)
                .leftJoin(
                    objectStorageAcl,
                    and(
                        eq(objectStorageAcl.objectStorageId, objectStorage.id),
                        eq(objectStorageAcl.organizationId, organizationId),
                        eq(objectStorageAcl.userId, ctx.get('user')!.id),
                    ),
                )
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
                        eq(upload.isCommitted, true),
                        eq(objectStorage.isUploaded, true),
                        ctx.get('isPrivilegedRole')
                            ? undefined
                            : eq(upload.userId, ctx.get('user')!.id),
                    ),
                )

            if (linkedObjects.length === 0) {
                return apiResponseErrorWrapper(ctx, catalog.uploadNotFound)
            }

            const downloadUrls = await Promise.all(
                linkedObjects.map(
                    async ({ objectStorage: os, objectStorageAcl: osa }) => {
                        const isPublicObject = os.isPublic

                        const hasObjectPermission =
                            osa !== null &&
                            osa.userId === ctx.get('user')!.id &&
                            Boolean(osa.mode & 1)

                        if (
                            ctx.get('isPrivilegedRole') ||
                            isPublicObject ||
                            hasObjectPermission
                        ) {
                            const downloadUrl = isPublicObject
                                ? `${bucketPublicUrl}/${os.id}`
                                : (
                                      await ctx
                                          .get('aws4FetchClient')
                                          .sign(
                                              `https://${accountId}.r2.cloudflarestorage.com/${bucketPrivate}/${os.id}?X-Amz-Expires=${presignExpiry}`,
                                              {
                                                  method: 'GET',
                                                  aws: {
                                                      service: 's3',
                                                      signQuery: true,
                                                  },
                                              },
                                          )
                                  ).url

                            return {
                                objectStorageId: os.id,
                                downloadUrl,
                                status: 201 as const,
                            }
                        }

                        return {
                            objectStorageId: os.id,
                            downloadUrl: null,
                            status: 403 as const,
                        }
                    },
                ),
            )

            return apiResponseOkWrapper(ctx, {
                data: { downloadUrls },
            })
        },
    )
    .on(
        'QUERY',
        '/readMany',
        tenantGuard,
        validateRequest('json', downloadReadManyInputSchema),
        async (ctx) => {
            const input = ctx.req.valid('json')
            const organizationId = getActiveOrganizationId(ctx)

            const { objectStorage, upload, uploadAttachment } =
                ctx.get('dbSchema')

            try {
                const searchCondition = and(
                    eq(uploadAttachment.organizationId, organizationId),
                    eq(objectStorage.organizationId, organizationId),
                    eq(upload.organizationId, organizationId),
                    eq(upload.isCommitted, true),
                    eq(objectStorage.isUploaded, true),
                    ctx.get('isPrivilegedRole')
                        ? undefined
                        : eq(upload.userId, ctx.get('user')!.id),
                )

                const count = (
                    await ctx
                        .get('dbClient')
                        .select({
                            count: countFn(uploadAttachment.objectStorageId),
                        })
                        .from(uploadAttachment)
                        .innerJoin(
                            objectStorage,
                            eq(
                                objectStorage.id,
                                uploadAttachment.objectStorageId,
                            ),
                        )
                        .innerJoin(
                            upload,
                            eq(upload.id, uploadAttachment.uploadId),
                        )
                        .where(searchCondition)
                )[0].count

                const data = await ctx
                    .get('dbClient')
                    .select({
                        uploadId: upload.id,
                        objectStorageId: objectStorage.id,
                        size: objectStorage.size,
                        mimeType: objectStorage.mimeType,
                        hashSha256: objectStorage.hashSha256,
                        isPublic: objectStorage.isPublic,
                        objectCreatedAt: objectStorage.createdAt,
                        uploadCreatedAt: upload.createdAt,
                    })
                    .from(uploadAttachment)
                    .innerJoin(
                        objectStorage,
                        eq(objectStorage.id, uploadAttachment.objectStorageId),
                    )
                    .innerJoin(upload, eq(upload.id, uploadAttachment.uploadId))
                    .where(searchCondition)
                    .limit(input.limit)
                    .offset(input.offset)
                    .orderBy(
                        input.sortOrder === 'asc'
                            ? asc(upload.createdAt)
                            : desc(upload.createdAt),
                        input.sortOrder === 'asc'
                            ? asc(upload.id)
                            : desc(upload.id),
                        input.sortOrder === 'asc'
                            ? asc(objectStorage.id)
                            : desc(objectStorage.id),
                    )

                return apiResponsePaginatedOkWrapper(ctx, {
                    data,
                    count,
                    limit: input.limit,
                    offset: input.offset,
                })
            } catch (err) {
                if (err instanceof AppError) throw err

                throw new AppError(catalog.downloadListRetrievalFailed, {
                    cause: err,
                })
            }
        },
    )

export default downloadRoute
