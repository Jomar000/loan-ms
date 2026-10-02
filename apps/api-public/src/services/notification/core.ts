import { dbClient, dbSchema } from '@loanms/database/d1'
import { AppError, catalog } from '@loanms/errors'
import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

type TDatabaseClient = ReturnType<typeof dbClient>

export type TCreateNotificationEventInput = {
    action?: {
        href: string
        label: string
    }
    category: string
    eventKey: string
    message: string
    metadata?: Record<string, unknown>
    organizationId: string
    recipientUserIds: readonly string[]
    title: string
}

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value instanceof Date) return value.toJSON()

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(
                    ([
                        ,
                        entryValue,
                    ]) => entryValue !== undefined,
                )
                .sort(([leftKey], [rightKey]) =>
                    leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0,
                )
                .map(
                    ([
                        key,
                        entryValue,
                    ]) => [
                        key,
                        canonicalize(entryValue),
                    ],
                ),
        )
    }

    return value
}

const createContentFingerprint = async (
    input: TCreateNotificationEventInput,
) => {
    const canonicalContent = JSON.stringify(
        canonicalize({
            actionHref: input.action?.href ?? null,
            actionLabel: input.action?.label ?? null,
            category: input.category,
            message: input.message,
            metadata: input.metadata ?? null,
            title: input.title,
        }),
    )
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonicalContent),
    )

    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('')
}

/** Core workflow for persisting an idempotent event and its recipient deliveries. */
export const createNotificationEvent = async (
    client: TDatabaseClient,
    input: TCreateNotificationEventInput,
) => {
    const recipientUserIds = Array.from(new Set(input.recipientUserIds)).sort()

    if (recipientUserIds.length === 0) {
        throw new AppError(catalog.notificationRecipientsRequired)
    }

    const contentFingerprint = await createContentFingerprint(input)
    const createdAt = Date.now()
    const database = client.$client
    const eventInsert = database
        .prepare(
            `INSERT INTO notification_event (
                 public_id, organization_id, event_key, content_fingerprint,
                 category, title, message, action_label, action_href,
                 metadata, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(organization_id, event_key) DO NOTHING`,
        )
        .bind(
            uuidv7(),
            input.organizationId,
            input.eventKey,
            contentFingerprint,
            input.category,
            input.title,
            input.message,
            input.action?.label ?? null,
            input.action?.href ?? null,
            input.metadata ? JSON.stringify(input.metadata) : null,
            createdAt,
        )
    const deliveryStatements = Array.from(
        { length: Math.ceil(recipientUserIds.length / 30) },
        (_, chunkIndex) =>
            recipientUserIds.slice(chunkIndex * 30, (chunkIndex + 1) * 30),
    ).map((recipientChunk) => {
        const recipients = recipientChunk
            .map((_, index) =>
                index === 0 ? 'SELECT ? AS user_id' : 'SELECT ?',
            )
            .join(' UNION ALL ')

        return database
            .prepare(
                `INSERT INTO notification_delivery (
                     organization_id, notification_event_id, user_id,
                     is_read, read_at, created_at
                 )
                 SELECT event.organization_id, event.id, recipient.user_id,
                        0, NULL, ?
                 FROM notification_event event
                 JOIN (${recipients}) recipient
                 WHERE event.organization_id = ?
                   AND event.event_key = ?
                   AND event.content_fingerprint = ?
                 ON CONFLICT(organization_id, notification_event_id, user_id)
                 DO NOTHING`,
            )
            .bind(
                createdAt,
                ...recipientChunk,
                input.organizationId,
                input.eventKey,
                contentFingerprint,
            )
    })
    const [
        eventInsertResult,
        ...deliveryResults
    ] = await database.batch([
        eventInsert,
        ...deliveryStatements,
    ])
    const event = (
        await client
            .select({
                contentFingerprint:
                    dbSchema.notificationEvent.contentFingerprint,
                id: dbSchema.notificationEvent.id,
                publicId: dbSchema.notificationEvent.publicId,
            })
            .from(dbSchema.notificationEvent)
            .where(
                and(
                    eq(
                        dbSchema.notificationEvent.organizationId,
                        input.organizationId,
                    ),
                    eq(dbSchema.notificationEvent.eventKey, input.eventKey),
                ),
            )
            .limit(1)
    )[0]

    if (!event || event.contentFingerprint !== contentFingerprint) {
        throw new AppError(catalog.notificationEventConflict)
    }

    return {
        created: eventInsertResult.meta.changes === 1,
        delivered: deliveryResults.reduce(
            (count: number, result: { meta: { changes: number } }) =>
                count + result.meta.changes,
            0,
        ),
        publicId: event.publicId,
    }
}
