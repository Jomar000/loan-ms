import { dbClient, dbSchema } from '@hyperion/database/d1'
import type {
    TApiResponseCursorPaginatedOk,
    TApiResponseError,
    TApiResponseOk,
} from '@hyperion/types/shared'
import { env } from 'cloudflare:workers'
import { and, count, eq, inArray, like, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNotificationEvent } from '../../../src/services/notification/core.js'
import {
    getTestingRequest,
    postTestingRequest,
    seedTestingCookieForOrganization,
    seedTestingCookies,
    TEST_ADMINISTRATOR_USER_ID,
    TEST_ISOLATED_ORGANIZATION_ID,
    TEST_MEMBER_USER_ID,
    TEST_OWNER_USER_ID,
    TEST_OWNER_USER_PUBLIC_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../../utilities.js'

type TNotificationListItem = {
    actionHref: string | null
    actionLabel: string | null
    category: string
    createdAt: string
    isRead: boolean
    message: string
    metadata: Record<string, unknown> | null
    publicId: string
    readAt: string | null
    title: string
}

let db: ReturnType<typeof dbClient>
let administratorCookie: string
let isolatedCookie: string
let ownerCookie: string

const TEST_EVENT_PREFIX = '__TEST-notification:'
const memberOnlyEventKey = `${TEST_EVENT_PREFIX}member-only`
const isolatedEventKey = `${TEST_EVENT_PREFIX}isolated`

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

const getList = (cookie = ownerCookie, query = '') =>
    getTestingRequest(`/api/user/notification/list${query}`, { cookie })

const getUnreadCount = (cookie = ownerCookie) =>
    getTestingRequest('/api/user/notification/unreadCount', { cookie })

const setDeliveryCreatedAt = async (
    notificationPublicId: string,
    userId: string,
    createdAt: Date,
) => {
    const [event] = await db
        .select({ id: dbSchema.notificationEvent.id })
        .from(dbSchema.notificationEvent)
        .where(
            and(
                eq(
                    dbSchema.notificationEvent.organizationId,
                    TEST_PRIMARY_ORGANIZATION_ID,
                ),
                eq(dbSchema.notificationEvent.publicId, notificationPublicId),
            ),
        )
        .limit(1)

    if (!event) throw new Error('Notification event was not created.')

    await db
        .update(dbSchema.notificationDelivery)
        .set({ createdAt })
        .where(
            and(
                eq(
                    dbSchema.notificationDelivery.organizationId,
                    TEST_PRIMARY_ORGANIZATION_ID,
                ),
                eq(dbSchema.notificationDelivery.userId, userId),
                eq(dbSchema.notificationDelivery.notificationEventId, event.id),
            ),
        )
}

const markRead = (notificationPublicIds: string[], cookie = ownerCookie) =>
    postTestingRequest('/api/user/notification/markRead', {
        body: { notificationPublicIds },
        cookie,
    })

beforeAll(async () => {
    db = dbClient(env.HYPERIONBOFC_D1)
    ;[
        ownerCookie,
        ,
        administratorCookie,
    ] = await seedTestingCookies()
    isolatedCookie = await seedTestingCookieForOrganization(
        TEST_OWNER_USER_ID,
        TEST_ISOLATED_ORGANIZATION_ID,
        { db },
    )
    await cleanNotifications()
})

afterAll(async () => {
    await cleanNotifications()
})

describe('User Notification Endpoint', () => {
    it('rejects unauthenticated inbox requests.', async () => {
        const [
            listResponse,
            countResponse,
            markResponse,
        ] = await Promise.all([
            getTestingRequest('/api/user/notification/list'),
            getTestingRequest('/api/user/notification/unreadCount'),
            postTestingRequest('/api/user/notification/markRead', {
                body: { notificationPublicIds: [crypto.randomUUID()] },
            }),
        ])

        expect(listResponse.status).toBe(401)
        expect(countResponse.status).toBe(401)
        expect(markResponse.status).toBe(401)
    })

    it('lists only the active tenant and recipient.', async () => {
        const ownerEvent = await createEvent(
            `${TEST_EVENT_PREFIX}owner-list`,
            [TEST_OWNER_USER_ID],
            { title: '__TEST-OWNER NOTIFICATION' },
        )
        const memberEvent = await createEvent(
            memberOnlyEventKey,
            [TEST_MEMBER_USER_ID],
            { title: '__TEST-MEMBER NOTIFICATION' },
        )
        const isolatedEvent = await createEvent(
            isolatedEventKey,
            [TEST_OWNER_USER_ID],
            {
                organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                title: '__TEST-ISOLATED NOTIFICATION',
            },
        )

        const response = await getList(ownerCookie)
        const responseData =
            await response.json<
                TApiResponseCursorPaginatedOk<TNotificationListItem[]>
            >()
        const isolatedResponse = await getList(isolatedCookie)
        const isolatedData =
            await isolatedResponse.json<
                TApiResponseCursorPaginatedOk<TNotificationListItem[]>
            >()

        expect(response.status).toBe(200)
        expect(responseData.limit).toBe(100)
        expect(responseData).not.toHaveProperty('count')
        expect(responseData).not.toHaveProperty('offset')
        expect(responseData.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    publicId: ownerEvent.publicId,
                    title: '__TEST-OWNER NOTIFICATION',
                }),
            ]),
        )
        expect(responseData.data).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ publicId: memberEvent.publicId }),
                expect.objectContaining({ publicId: isolatedEvent.publicId }),
            ]),
        )
        const notification = responseData.data.find(
            ({ publicId }) => publicId === ownerEvent.publicId,
        )!

        expect(
            notification.actionHref === null ||
                typeof notification.actionHref === 'string',
        ).toBe(true)
        expect(
            notification.actionLabel === null ||
                typeof notification.actionLabel === 'string',
        ).toBe(true)
        expect(typeof notification.category).toBe('string')
        expect(typeof notification.isRead).toBe('boolean')
        expect(typeof notification.message).toBe('string')
        expect(
            notification.metadata === null ||
                (typeof notification.metadata === 'object' &&
                    !Array.isArray(notification.metadata)),
        ).toBe(true)
        expect(
            notification.readAt === null ||
                typeof notification.readAt === 'string',
        ).toBe(true)
        expect(typeof notification.title).toBe('string')
        expect(notification.publicId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        )
        expect(notification.createdAt).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        )
        expect(Number.isNaN(Date.parse(notification.createdAt))).toBe(false)
        for (const property of [
            'id',
            'organizationId',
            'notificationEventId',
            'userId',
            'eventKey',
            'contentFingerprint',
            'updatedAt',
        ])
            expect(notification).not.toHaveProperty(property)
        expect(isolatedResponse.status).toBe(200)
        expect(isolatedData.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    publicId: isolatedEvent.publicId,
                    title: '__TEST-ISOLATED NOTIFICATION',
                }),
            ]),
        )
        expect(isolatedData.data).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ publicId: ownerEvent.publicId }),
                expect.objectContaining({ publicId: memberEvent.publicId }),
            ]),
        )
    })

    it('paginates newest-first without duplicates when new rows arrive.', async () => {
        const oldest = await createEvent(`${TEST_EVENT_PREFIX}page-oldest`, [
            TEST_ADMINISTRATOR_USER_ID,
        ])
        const tiedOlder = await createEvent(
            `${TEST_EVENT_PREFIX}page-tied-older`,
            [TEST_ADMINISTRATOR_USER_ID],
        )
        const tiedNewer = await createEvent(
            `${TEST_EVENT_PREFIX}page-tied-newer`,
            [TEST_ADMINISTRATOR_USER_ID],
        )
        const newest = await createEvent(`${TEST_EVENT_PREFIX}page-newest`, [
            TEST_ADMINISTRATOR_USER_ID,
        ])
        const tiedCreatedAt = new Date('2020-01-01T01:00:00.000Z')

        await Promise.all([
            setDeliveryCreatedAt(
                oldest.publicId,
                TEST_ADMINISTRATOR_USER_ID,
                new Date('2020-01-01T00:00:00.000Z'),
            ),
            setDeliveryCreatedAt(
                tiedOlder.publicId,
                TEST_ADMINISTRATOR_USER_ID,
                tiedCreatedAt,
            ),
            setDeliveryCreatedAt(
                tiedNewer.publicId,
                TEST_ADMINISTRATOR_USER_ID,
                tiedCreatedAt,
            ),
            setDeliveryCreatedAt(
                newest.publicId,
                TEST_ADMINISTRATOR_USER_ID,
                new Date('2020-01-01T02:00:00.000Z'),
            ),
        ])

        const firstResponse = await getList(administratorCookie, '?limit=2')
        const firstData =
            await firstResponse.json<
                TApiResponseCursorPaginatedOk<TNotificationListItem[]>
            >()

        expect(firstResponse.status).toBe(200)
        expect(firstData.data.map(({ publicId }) => publicId)).toEqual([
            newest.publicId,
            tiedNewer.publicId,
        ])
        expect(firstData.limit).toBe(2)
        expect(firstData.nextCursor).toBe(tiedNewer.publicId)
        expect(firstData).not.toHaveProperty('count')
        expect(firstData).not.toHaveProperty('offset')

        const inserted = await createEvent(
            `${TEST_EVENT_PREFIX}page-inserted`,
            [TEST_ADMINISTRATOR_USER_ID],
        )
        const secondResponse = await getList(
            administratorCookie,
            `?limit=2&cursor=${firstData.nextCursor}`,
        )
        const secondData =
            await secondResponse.json<
                TApiResponseCursorPaginatedOk<TNotificationListItem[]>
            >()

        expect(secondResponse.status).toBe(200)
        expect(secondData.data.map(({ publicId }) => publicId)).toEqual([
            tiedOlder.publicId,
            oldest.publicId,
        ])
        expect(secondData.nextCursor).toBeNull()
        expect(
            [
                ...firstData.data,
                ...secondData.data,
            ].map(({ publicId }) => publicId),
        ).not.toContain(inserted.publicId)
        expect(
            new Set(
                [
                    ...firstData.data,
                    ...secondData.data,
                ].map(({ publicId }) => publicId),
            ).size,
        ).toBe(4)
    })

    it('rejects invalid and foreign list parameters.', async () => {
        const foreignUserEvent = await createEvent(
            `${TEST_EVENT_PREFIX}cursor-foreign-user`,
            [TEST_MEMBER_USER_ID],
        )
        const foreignTenantEvent = await createEvent(
            `${TEST_EVENT_PREFIX}cursor-foreign-tenant`,
            [TEST_OWNER_USER_ID],
            { organizationId: TEST_ISOLATED_ORGANIZATION_ID },
        )
        const nonexistentResponse = await getList(
            ownerCookie,
            `?cursor=${crypto.randomUUID()}`,
        )
        const foreignUserResponse = await getList(
            ownerCookie,
            `?cursor=${foreignUserEvent.publicId}`,
        )
        const foreignTenantResponse = await getList(
            ownerCookie,
            `?cursor=${foreignTenantEvent.publicId}`,
        )
        const [
            nonexistentData,
            foreignUserData,
            foreignTenantData,
        ] = await Promise.all([
            nonexistentResponse.json<TApiResponseError>(),
            foreignUserResponse.json<TApiResponseError>(),
            foreignTenantResponse.json<TApiResponseError>(),
        ])
        const validationResponses = await Promise.all([
            getList(ownerCookie, '?cursor=not-a-uuid'),
            getList(ownerCookie, '?limit=101'),
        ])

        expect(nonexistentResponse.status).toBe(400)
        expect(foreignUserResponse.status).toBe(400)
        expect(foreignTenantResponse.status).toBe(400)
        expect(nonexistentData.error.code).toBe('NOTIFICATION_CURSOR_INVALID')
        expect(foreignUserData.error.code).toBe('NOTIFICATION_CURSOR_INVALID')
        expect(foreignTenantData.error.code).toBe('NOTIFICATION_CURSOR_INVALID')
        expect(validationResponses.map(({ status }) => status)).toEqual([
            400,
            400,
        ])
    })

    it('returns an accurate unread count.', async () => {
        const [{ expectedCount }] = await db
            .select({ expectedCount: count() })
            .from(dbSchema.notificationDelivery)
            .where(
                and(
                    eq(
                        dbSchema.notificationDelivery.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(
                        dbSchema.notificationDelivery.userId,
                        TEST_OWNER_USER_ID,
                    ),
                    eq(dbSchema.notificationDelivery.isRead, false),
                ),
            )
        const response = await getUnreadCount()
        const responseData =
            await response.json<TApiResponseOk<{ count: number }>>()

        expect(response.status).toBe(200)
        expect(responseData.data.count).toBe(expectedCount)
    })

    it('deduplicates IDs and atomically marks a notification read.', async () => {
        const event = await createEvent(`${TEST_EVENT_PREFIX}mark-read`, [
            TEST_OWNER_USER_ID,
        ])
        const response = await markRead([
            event.publicId,
            event.publicId,
        ])
        const responseData =
            await response.json<TApiResponseOk<{ marked: number }>>()
        const [delivery] = await db
            .select({
                isRead: dbSchema.notificationDelivery.isRead,
                readAt: dbSchema.notificationDelivery.readAt,
            })
            .from(dbSchema.notificationDelivery)
            .innerJoin(
                dbSchema.notificationEvent,
                eq(
                    dbSchema.notificationEvent.id,
                    dbSchema.notificationDelivery.notificationEventId,
                ),
            )
            .where(eq(dbSchema.notificationEvent.publicId, event.publicId))

        expect(response.status).toBe(200)
        expect(responseData.data.marked).toBe(1)
        expect(delivery).toMatchObject({ isRead: true })
        expect(delivery!.readAt).toBeInstanceOf(Date)

        const [audit] = await db
            .select({ records: dbSchema.auditTrail.records })
            .from(dbSchema.auditTrail)
            .where(
                and(
                    eq(
                        dbSchema.auditTrail.organizationId,
                        TEST_PRIMARY_ORGANIZATION_ID,
                    ),
                    eq(dbSchema.auditTrail.component, 'user.notification'),
                    eq(dbSchema.auditTrail.action, 'markRead'),
                    sql`EXISTS (
                        SELECT 1 FROM json_each(${dbSchema.auditTrail.records})
                        WHERE json_extract(value, '$.id') = ${`${TEST_OWNER_USER_PUBLIC_ID}:${event.publicId}`}
                          AND json_extract(value, '$.table') = 'notification_delivery'
                    )`,
                ),
            )
            .limit(1)

        expect(audit).toBeDefined()

        const repeatedResponse = await markRead([event.publicId])
        const repeatedData = await repeatedResponse.json<TApiResponseError>()

        expect(repeatedResponse.status).toBe(409)
        expect(repeatedData.error.code).toBe('NOTIFICATION_ALREADY_READ')
    })

    it('rolls back a mixed read and unread batch.', async () => {
        const alreadyRead = await createEvent(
            `${TEST_EVENT_PREFIX}mixed-already-read`,
            [TEST_OWNER_USER_ID],
        )
        const unread = await createEvent(`${TEST_EVENT_PREFIX}mixed-unread`, [
            TEST_OWNER_USER_ID,
        ])

        expect((await markRead([alreadyRead.publicId])).status).toBe(200)

        const response = await markRead([
            alreadyRead.publicId,
            unread.publicId,
        ])
        const responseData = await response.json<TApiResponseError>()
        const [unreadDelivery] = await db
            .select({ isRead: dbSchema.notificationDelivery.isRead })
            .from(dbSchema.notificationDelivery)
            .innerJoin(
                dbSchema.notificationEvent,
                eq(
                    dbSchema.notificationEvent.id,
                    dbSchema.notificationDelivery.notificationEventId,
                ),
            )
            .where(eq(dbSchema.notificationEvent.publicId, unread.publicId))

        expect(response.status).toBe(409)
        expect(responseData.error.code).toBe('NOTIFICATION_ALREADY_READ')
        expect(unreadDelivery!.isRead).toBe(false)
    })

    it('rejects mixed ownership without partially marking owned rows.', async () => {
        const owned = await createEvent(`${TEST_EVENT_PREFIX}mixed-owned`, [
            TEST_OWNER_USER_ID,
        ])
        const foreign = await createEvent(`${TEST_EVENT_PREFIX}mixed-foreign`, [
            TEST_MEMBER_USER_ID,
        ])

        const response = await markRead([
            owned.publicId,
            foreign.publicId,
        ])
        const [ownedDelivery] = await db
            .select({ isRead: dbSchema.notificationDelivery.isRead })
            .from(dbSchema.notificationDelivery)
            .innerJoin(
                dbSchema.notificationEvent,
                eq(
                    dbSchema.notificationEvent.id,
                    dbSchema.notificationDelivery.notificationEventId,
                ),
            )
            .where(
                and(
                    eq(dbSchema.notificationEvent.publicId, owned.publicId),
                    eq(
                        dbSchema.notificationDelivery.userId,
                        TEST_OWNER_USER_ID,
                    ),
                ),
            )

        expect(response.status).toBe(404)
        expect(ownedDelivery!.isRead).toBe(false)
    })

    it('allows only one concurrent mark-read request.', async () => {
        const event = await createEvent(`${TEST_EVENT_PREFIX}concurrent-read`, [
            TEST_OWNER_USER_ID,
        ])
        const responses = await Promise.all([
            markRead([event.publicId]),
            markRead([event.publicId]),
        ])

        expect(responses.map(({ status }) => status).sort()).toEqual([
            200,
            409,
        ])

        const successfulResponse = responses.find(
            ({ status }) => status === 200,
        )!
        const conflictResponse = responses.find(({ status }) => status === 409)!
        const successfulData =
            await successfulResponse.json<TApiResponseOk<{ marked: number }>>()
        const conflictData = await conflictResponse.json<TApiResponseError>()

        expect(successfulData.data.marked).toBe(1)
        expect(conflictData.error.code).toBe('NOTIFICATION_ALREADY_READ')
    })

    it('marks the 200-notification contract maximum in one atomic D1 batch.', async () => {
        const publicIds = Array.from({ length: 200 }, () => crypto.randomUUID())
        const encodedIds = JSON.stringify(publicIds)
        await env.HYPERIONBOFC_D1.batch([
            env.HYPERIONBOFC_D1.prepare(
                `INSERT INTO notification_event (organization_id, public_id, event_key, content_fingerprint, category, title, message)
                 SELECT ?, value, ? || key, ? || key, 'system', 'Batch test', 'Batch test'
                 FROM json_each(?)`,
            ).bind(
                TEST_PRIMARY_ORGANIZATION_ID,
                `${TEST_EVENT_PREFIX}max-`,
                `${TEST_EVENT_PREFIX}max-fingerprint-`,
                encodedIds,
            ),
            env.HYPERIONBOFC_D1.prepare(
                `INSERT INTO notification_delivery (organization_id, notification_event_id, user_id)
                 SELECT organization_id, id, ? FROM notification_event
                 WHERE organization_id = ? AND public_id IN (SELECT value FROM json_each(?))`,
            ).bind(
                TEST_OWNER_USER_ID,
                TEST_PRIMARY_ORGANIZATION_ID,
                encodedIds,
            ),
        ])

        const response = await markRead(publicIds)
        const responseData =
            await response.json<TApiResponseOk<{ marked: number }>>()

        expect(response.status).toBe(200)
        expect(responseData.data.marked).toBe(200)
    })

    it('validates the mark-read payload.', async () => {
        const response = await postTestingRequest(
            '/api/user/notification/markRead',
            { body: { notificationPublicIds: [] }, cookie: ownerCookie },
        )
        const responseData = await response.json<TApiResponseError>()

        expect(response.status).toBe(400)
        expect(responseData.error.code).toBe('DATA_VALIDATION')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
