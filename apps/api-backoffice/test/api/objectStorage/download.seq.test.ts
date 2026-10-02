import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponsePaginatedOk } from '@loanms/types/shared'
import { env } from 'cloudflare:workers'
import { inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
    queryTestingRequest,
    seedTestingCookieForOrganization,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../utilities.js'
import { registerSequentialObjectStorageTests } from './objectStorage.shared.js'

registerSequentialObjectStorageTests('download')

describe('Download pagination tie-breakers', () => {
    it('orders equal timestamps by upload and object IDs across page boundaries.', async () => {
        const db = dbClient(env.LOANMSBOFC_D1)
        const uploadIds = [
            'TESTTieUpload000A',
            'TESTTieUpload000B',
        ]
        const objectIds = [
            `${'TESTTieObject'.padEnd(31, '0')}A`,
            `${'TESTTieObject'.padEnd(31, '0')}B`,
            `${'TESTTieObject'.padEnd(31, '0')}C`,
        ]
        const organizationId = TEST_PRIMARY_ORGANIZATION_ID
        const pairs = [
            { uploadId: uploadIds[0], objectStorageId: objectIds[0] },
            { uploadId: uploadIds[0], objectStorageId: objectIds[1] },
            { uploadId: uploadIds[1], objectStorageId: objectIds[2] },
        ]
        try {
            const cookie = await seedTestingCookieForOrganization(
                TEST_OWNER_USER_ID,
                organizationId,
                { db },
            )
            await db.insert(dbSchema.upload).values(
                uploadIds.map((id) => ({
                    id,
                    organizationId,
                    userId: TEST_OWNER_USER_ID,
                    isCommitted: true,
                    createdAt: new Date('1900-01-01T00:00:00Z'),
                })),
            )
            await db.insert(dbSchema.objectStorage).values(
                objectIds.map((id, index) => ({
                    id,
                    organizationId,
                    size: 1,
                    hashSha256: String(index + 1).repeat(64),
                    isPublic: true,
                    isUploaded: true,
                })),
            )
            await db
                .insert(dbSchema.uploadAttachment)
                .values(pairs.map((pair) => ({ ...pair, organizationId })))
            for (const sortOrder of [
                'asc',
                'desc',
            ] as const) {
                if (sortOrder === 'desc') {
                    await db
                        .update(dbSchema.upload)
                        .set({ createdAt: new Date('2099-01-01T00:00:00Z') })
                        .where(inArray(dbSchema.upload.id, uploadIds))
                }
                const actual: typeof pairs = []
                for (let offset = 0; offset < pairs.length; offset++) {
                    const response = await queryTestingRequest(
                        '/api/objectStorage/download/readMany',
                        { limit: 1, offset, sortOrder },
                        { cookie },
                    )
                    expect(response.status).toBe(200)
                    const json =
                        await response.json<
                            TApiResponsePaginatedOk<typeof pairs>
                        >()
                    actual.push(
                        ...json.data.map(({ uploadId, objectStorageId }) => ({
                            uploadId,
                            objectStorageId,
                        })),
                    )
                }
                expect(actual).toEqual(
                    sortOrder === 'asc' ? pairs : [...pairs].reverse(),
                )
            }
        } finally {
            try {
                await db
                    .delete(dbSchema.uploadAttachment)
                    .where(
                        inArray(dbSchema.uploadAttachment.uploadId, uploadIds),
                    )
                await db
                    .delete(dbSchema.upload)
                    .where(inArray(dbSchema.upload.id, uploadIds))
                await db
                    .delete(dbSchema.objectStorage)
                    .where(inArray(dbSchema.objectStorage.id, objectIds))
            } finally {
                // D1 clients do not require teardown.
            }
        }
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
