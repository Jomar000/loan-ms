import { dbClient, dbSchema } from '@hyperion/database/d1'
import { env } from 'cloudflare:workers'
import { and, count, eq, inArray, like } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNotificationEvent } from '../../../src/services/notification/core.js'
import {
    TEST_ADMINISTRATOR_USER_ID,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_MEMBER_USER_ID,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../utilities.js'

let db: ReturnType<typeof dbClient>

const TEST_EVENT_PREFIX = '__TEST-notification:'
const primaryEventKey = `${TEST_EVENT_PREFIX}primary`

const cleanNotifications = async () => {
    await db.delete(dbSchema.notificationEvent).where(
        and(
            inArray(dbSchema.notificationEvent.organizationId, [
                TEST_PRIMARY_ORGANIZATION_ID,
                TEST_ISOLATED_ORGANIZATION_ID,
            ]),
            like(dbSchema.notificationEvent.eventKey, `${TEST_EVENT_PREFIX}%`),
        ),
    )
}

const createEvent = (
    eventKey: string,
    recipientUserIds: readonly string[],
    overrides: Partial<{
        action: { href: string; label: string }
        category: string
        message: string
        metadata: Record<string, unknown>
        organizationId: string
        title: string
    }> = {},
) =>
    createNotificationEvent(db, {
        action: overrides.action,
        category: overrides.category ?? 'system',
        eventKey,
        message: overrides.message ?? 'A test notification is available.',
        metadata: overrides.metadata,
        organizationId:
            overrides.organizationId ?? TEST_PRIMARY_ORGANIZATION_ID,
        recipientUserIds,
        title: overrides.title ?? 'Test notification',
    })

beforeAll(async () => {
    db = dbClient(env.HYPERIONBOFC_D1)
    await cleanNotifications()
})

afterAll(async () => {
    await cleanNotifications()
})

describe('Notification persistence', () => {
    it('creates one event and idempotently fans out deliveries.', async () => {
        const eventContent = {
            action: { href: '/app', label: 'Open' },
            metadata: { source: 'test' },
        }
        const first = await createEvent(
            primaryEventKey,
            [
                TEST_OWNER_USER_ID,
                TEST_OWNER_USER_ID,
            ],
            eventContent,
        )
        const second = await createEvent(
            primaryEventKey,
            [TEST_MEMBER_USER_ID],
            eventContent,
        )
        const replay = await createEvent(
            primaryEventKey,
            [
                TEST_OWNER_USER_ID,
                TEST_MEMBER_USER_ID,
            ],
            eventContent,
        )

        const [{ eventCount }] = await db
            .select({ eventCount: count() })
            .from(dbSchema.notificationEvent)
            .where(
                and(
                    eq(
                        dbSchema.notificationEvent.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.notificationEvent.eventKey, primaryEventKey),
                ),
            )
        const [{ deliveryCount }] = await db
            .select({ deliveryCount: count() })
            .from(dbSchema.notificationDelivery)
            .where(
                and(
                    eq(
                        dbSchema.notificationDelivery.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.notificationDelivery.notificationEventId,
                        (
                            await db
                                .select({ id: dbSchema.notificationEvent.id })
                                .from(dbSchema.notificationEvent)
                                .where(
                                    eq(
                                        dbSchema.notificationEvent.eventKey,
                                        primaryEventKey,
                                    ),
                                )
                                .limit(1)
                        )[0]!.id,
                    ),
                ),
            )

        expect(first.created).toBe(true)
        expect(first.delivered).toBe(1)
        expect(second.created).toBe(false)
        expect(second.delivered).toBe(1)
        expect(replay.delivered).toBe(0)
        expect(eventCount).toBe(1)
        expect(deliveryCount).toBe(2)
    })

    it('rejects an event key reused with different content.', async () => {
        await expect(
            createEvent(primaryEventKey, [TEST_OWNER_USER_ID], {
                title: 'Different notification',
            }),
        ).rejects.toMatchObject({ code: 'NOTIFICATION_EVENT_CONFLICT' })
    })

    it('uses canonical metadata when comparing event content.', async () => {
        const eventKey = `${TEST_EVENT_PREFIX}canonical-metadata`
        const first = await createEvent(eventKey, [TEST_OWNER_USER_ID], {
            metadata: { nested: { alpha: 1, beta: 2 }, source: 'test' },
        })
        const replay = await createEvent(eventKey, [TEST_MEMBER_USER_ID], {
            metadata: { source: 'test', nested: { beta: 2, alpha: 1 } },
        })

        expect(first.created).toBe(true)
        expect(replay.created).toBe(false)
        expect(replay.delivered).toBe(1)
    })

    it('requires at least one recipient.', async () => {
        await expect(
            createEvent(`${TEST_EVENT_PREFIX}no-recipient`, []),
        ).rejects.toMatchObject({ code: 'NOTIFICATION_RECIPIENTS_REQUIRED' })
    })

    it('rolls back the event when any recipient violates membership.', async () => {
        const eventKey = `${TEST_EVENT_PREFIX}invalid-recipient`

        await expect(
            createEvent(eventKey, ['__TEST-NOT-A-MEMBER']),
        ).rejects.toBeDefined()
        const [{ eventCount }] = await db
            .select({ eventCount: count() })
            .from(dbSchema.notificationEvent)
            .where(eq(dbSchema.notificationEvent.eventKey, eventKey))
        expect(eventCount).toBe(0)
    })

    it('converges concurrent event creation.', async () => {
        const eventKey = `${TEST_EVENT_PREFIX}concurrent`
        const results = await Promise.all([
            createEvent(eventKey, [TEST_OWNER_USER_ID]),
            createEvent(eventKey, [TEST_OWNER_USER_ID]),
        ])
        const [{ eventCount }] = await db
            .select({ eventCount: count() })
            .from(dbSchema.notificationEvent)
            .where(eq(dbSchema.notificationEvent.eventKey, eventKey))

        expect(results.filter(({ created }) => created)).toHaveLength(1)
        expect(eventCount).toBe(1)
    })

    it('enforces action and read-state consistency.', async () => {
        await expect(
            db.insert(dbSchema.notificationEvent).values({
                actionLabel: 'Open',
                category: 'system',
                contentFingerprint: 'invalid-action',
                eventKey: `${TEST_EVENT_PREFIX}invalid-action`,
                message: 'Invalid action pairing.',
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                title: 'Invalid action',
            }),
        ).rejects.toBeDefined()

        const event = await createEvent(`${TEST_EVENT_PREFIX}read-constraint`, [
            TEST_OWNER_USER_ID,
        ])
        const [eventRow] = await db
            .select({ id: dbSchema.notificationEvent.id })
            .from(dbSchema.notificationEvent)
            .where(eq(dbSchema.notificationEvent.publicId, event.publicId))

        await expect(
            db.insert(dbSchema.notificationDelivery).values({
                isRead: true,
                notificationEventId: eventRow!.id,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                userId: TEST_ADMINISTRATOR_USER_ID,
            }),
        ).rejects.toBeDefined()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
