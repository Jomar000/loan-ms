import { z } from 'zod'

import * as base from '../shared/base.js'
import * as field from '../shared/field.js'
import * as refinement from '../shared/refinement.js'

export const downloadLinkCreateInputSchema = z.object({
    uploadId: field
        .vText({ fieldName: 'Upload ID', min: 16 })
        .regex(/^[a-zA-Z0-9]+$/, {
            error: 'Upload ID must be alphanumeric characters only.',
        }),
})

export const downloadLinkCreateOutputSchema = base.outputSchema(
    base.objectOutputDataSchema,
)

export const downloadReadManyInputSchema = base.readManyInputSchema

export const downloadReadManyOutputSchema = base.paginatedOutputSchema(
    base.objectArrayOutputDataSchema,
)

export const uploadAttachmentCommitInputSchema = z.object({
    uploadId: field
        .vText({ fieldName: 'Upload ID', min: 16 })
        .regex(/^[a-zA-Z0-9]+$/, {
            error: 'Upload ID must be alphanumeric characters only.',
        }),
    attachments: z
        .array(
            field
                .vText({ fieldName: 'Attachment ID', min: 32 })
                .regex(/^[a-zA-Z0-9]+$/, {
                    error: 'Attachment ID must be alphanumeric characters only.',
                }),
        )
        .min(1, { error: 'At least one attachment must be provided.' })
        .max(25, { error: 'A maximum of 25 attachments can be provided.' }),
})

export const uploadAttachmentCommitOutputSchema = base.outputSchema(
    base.objectOutputDataSchema,
)

export const uploadAttachmentCreateInputSchema = z.object({
    idempotencyKey: field
        .vText({ fieldName: 'Idempotency Key', min: 36, max: 36 })
        .toLowerCase()
        .pipe(z.uuidv7({ error: 'Idempotency Key must be a UUID v7.' })),
    uploadId: field
        .vText({ fieldName: 'Upload ID', min: 16 })
        .regex(/^[a-zA-Z0-9]+$/, {
            error: 'Upload ID must be alphanumeric characters only.',
        }),
    attachments: z
        .array(
            z.object({
                size: field.vNumeric({ fieldName: 'Size', max: 10485760 }),
                mimeType: field
                    .vText({ fieldName: 'MIME Type', min: 8, max: 128 })
                    .lowercase()
                    .optional(),
                hashSha256: field.vSha256('SHA-256 hash'),
                isPublic: field
                    .vBoolean('isPublic Flag')
                    .optional()
                    .default(false),
            }),
        )
        .min(1, { error: 'At least one attachment must be provided.' })
        .max(25, { error: 'A maximum of 25 attachments can be provided.' })
        .check((ctx) => {
            refinement.uniqueArrayValues(ctx, {
                values: ctx.value,
                key: 'hashSha256',
                message: 'Duplicate SHA-256 hashes detected.',
            })
        }),
})

export const uploadAttachmentCreateOutputSchema = base.outputSchema(
    base.objectOutputDataSchema,
)

export const uploadAttachmentRetryInputSchema =
    uploadAttachmentCommitInputSchema

export const uploadAttachmentRetryOutputSchema = base.outputSchema(
    base.objectOutputDataSchema,
)

export const uploadCommitInputSchema = z.object({
    uploadId: field
        .vText({ fieldName: 'Upload ID', min: 16 })
        .regex(/^[a-zA-Z0-9]+$/, {
            error: 'Upload ID must be alphanumeric characters only.',
        }),
    attachments: z
        .array(
            field
                .vText({ fieldName: 'Attachment ID', min: 32 })
                .regex(/^[a-zA-Z0-9]+$/, {
                    error: 'Attachment ID must be alphanumeric characters only.',
                }),
        )
        .max(25, { error: 'A maximum of 25 attachments can be provided.' })
        .optional()
        .default([]),
})

export const uploadCommitOutputSchema = base.outputSchema(
    base.objectOutputDataSchema,
)

export const uploadCreateInputSchema = z.object({
    idempotencyKey: field
        .vText({ fieldName: 'Idempotency Key', min: 36, max: 36 })
        .toLowerCase()
        .pipe(z.uuidv7({ error: 'Idempotency Key must be a UUID v7.' })),
})

export const uploadCreateOutputSchema = base.outputSchema(
    base.objectOutputDataSchema,
)
