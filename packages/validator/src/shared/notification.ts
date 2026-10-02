import { z } from 'zod'

import * as base from './base.js'

const notificationDataSchema = z.object({
    actionHref: z.string().nullable(),
    actionLabel: z.string().nullable(),
    category: z.string(),
    createdAt: z.string(),
    isRead: z.boolean(),
    message: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    publicId: z.string().uuid(),
    readAt: z.string().nullable(),
    title: z.string(),
})

export const listInputSchema = z.strictObject({
    cursor: z.string().uuid().optional(),
    limit: base.readManyInputSchema.shape.limit,
})

export const listOutputSchema = base.cursorPaginatedOutputSchema(
    z.array(notificationDataSchema),
    z.string().uuid(),
)

export const markReadInputSchema = z.object({
    notificationPublicIds: z.array(z.string().uuid()).min(1).max(200),
})

export const markReadOutputSchema = base.outputSchema(
    z.object({ marked: z.number().int().nonnegative() }),
)

export const unreadCountOutputSchema = base.outputSchema(
    z.object({ count: z.number().int().nonnegative() }),
)
