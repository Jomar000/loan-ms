import { dbClient, dbSchema } from '@hyperion/database/d1'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, describe, expect, it } from 'vitest'

import worker from '../../src/core/index.js'
import {
    purgeAuditTrail,
    purgeExpiredAuthenticationRecords,
    runRetentionCron,
} from '../../src/services/retention.js'
import {
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

const db = dbClient(env.HYPERIONBOFC_D1)
const recordIds = {
    expiredSession: '__TEST-retention-session-expired',
    expiredVerification: '__TEST-retention-verification-expired',
    liveSession: '__TEST-retention-session-live',
    liveVerification: '__TEST-retention-verification-live',
}
const apiKeyIds = [
    '__TEST-retention-apikey-expired',
    '__TEST-retention-apikey-live',
    '__TEST-retention-apikey-orphan',
    '__TEST-retention-apikey-fresh',
    '__TEST-retention-apikey-scheduled',
] as const
let scheduledRealtimeOperationId: string | undefined

const runScheduled = async (cron: string) => {
    const executionContext = createExecutionContext()
    worker.scheduled(
        { cron, noRetry: () => {}, scheduledTime: Date.now() },
        env,
        executionContext,
    )
    await waitOnExecutionContext(executionContext)
}

afterAll(async () => {
    if (scheduledRealtimeOperationId) {
        await db
            .delete(dbSchema.websocketRevocationOperation)
            .where(
                eq(
                    dbSchema.websocketRevocationOperation.id,
                    scheduledRealtimeOperationId,
                ),
            )
    }
    await db.delete(dbSchema.session).where(
        inArray(dbSchema.session.id, [
            recordIds.expiredSession,
            recordIds.liveSession,
        ]),
    )
    await db.delete(dbSchema.verification).where(
        inArray(dbSchema.verification.id, [
            recordIds.expiredVerification,
            recordIds.liveVerification,
        ]),
    )
    await db
        .delete(dbSchema.auditTrail)
        .where(eq(dbSchema.auditTrail.component, '__TEST-retention'))
    await db
        .delete(dbSchema.apikey)
        .where(inArray(dbSchema.apikey.id, apiKeyIds))
})

describe('Backoffice D1 retention cron', () => {
    it('selects only the four retention schedules.', async () => {
        expect(runRetentionCron(db, '*/5 * * * *')).toBeNull()
        await expect(runRetentionCron(db, '0 19 * * *')).resolves.toBeTruthy()
        await expect(runRetentionCron(db, '5 * * * *')).resolves.toBeTruthy()
        await expect(runRetentionCron(db, '10 * * * *')).resolves.toBeTruthy()
        await expect(runRetentionCron(db, '15 * * * *')).resolves.toBeTruthy()
    })

    it('deletes expired sessions and verifications while preserving boundaries.', async () => {
        const now = new Date('2026-08-26T10:00:00.000Z')
        const expiredAt = new Date(now.getTime() - 1)
        const liveAt = new Date('2100-01-01T00:00:00.000Z')

        await db.insert(dbSchema.session).values([
            {
                id: recordIds.expiredSession,
                token: recordIds.expiredSession,
                userId: TEST_OWNER_USER_ID,
                expiresAt: expiredAt,
            },
            {
                id: recordIds.liveSession,
                token: recordIds.liveSession,
                userId: TEST_OWNER_USER_ID,
                expiresAt: liveAt,
            },
        ])
        await db.insert(dbSchema.verification).values([
            {
                id: recordIds.expiredVerification,
                identifier: recordIds.expiredVerification,
                value: 'expired',
                expiresAt: expiredAt,
            },
            {
                id: recordIds.liveVerification,
                identifier: recordIds.liveVerification,
                value: 'live',
                expiresAt: liveAt,
            },
        ])

        await purgeExpiredAuthenticationRecords(db, 'session', now)
        await purgeExpiredAuthenticationRecords(db, 'verification', now)

        expect(
            await db
                .select({ id: dbSchema.session.id })
                .from(dbSchema.session)
                .where(inArray(dbSchema.session.id, Object.values(recordIds))),
        ).toEqual([{ id: recordIds.liveSession }])
        expect(
            await db
                .select({ id: dbSchema.verification.id })
                .from(dbSchema.verification)
                .where(
                    inArray(dbSchema.verification.id, Object.values(recordIds)),
                ),
        ).toEqual([{ id: recordIds.liveVerification }])
    })

    it('applies the 90-day audit boundary and is repeatable.', async () => {
        const now = new Date('2026-08-26T10:00:00.000Z')
        const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        await db.insert(dbSchema.auditTrail).values([
            {
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                actorType: 'system',
                actorDisplayName: 'Retention Test System',
                component: '__TEST-retention',
                action: 'expired',
                description: 'expired audit',
                loggedAt: cutoff,
            },
            {
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                actorType: 'system',
                actorDisplayName: 'Retention Test System',
                component: '__TEST-retention',
                action: 'live',
                description: 'live audit',
                loggedAt: new Date(cutoff.getTime() + 1),
            },
        ])

        expect((await purgeAuditTrail(db, now)).deletedCount).toBeGreaterThan(0)
        await purgeAuditTrail(db, now)

        expect(
            await db
                .select({ action: dbSchema.auditTrail.action })
                .from(dbSchema.auditTrail)
                .where(eq(dbSchema.auditTrail.component, '__TEST-retention')),
        ).toEqual([{ action: 'live' }])
    })

    it('applies API-key expiry and orphan boundaries.', async () => {
        const now = new Date('2026-08-26T10:00:00.000Z')
        const orphanCutoff = new Date(now.getTime() - 15 * 60 * 1000)
        await db.insert(dbSchema.apikey).values([
            {
                id: apiKeyIds[0],
                configId: 'public-v1',
                key: apiKeyIds[0],
                referenceId: TEST_PRIMARY_ORGANIZATION_ID,
                expiresAt: now,
                createdAt: now,
            },
            {
                id: apiKeyIds[1],
                configId: 'public-v1',
                key: apiKeyIds[1],
                referenceId: TEST_PRIMARY_ORGANIZATION_ID,
                expiresAt: new Date(now.getTime() + 1),
                createdAt: now,
            },
            {
                id: apiKeyIds[2],
                configId: 'public-v1',
                key: apiKeyIds[2],
                referenceId: TEST_PRIMARY_ORGANIZATION_ID,
                createdAt: orphanCutoff,
            },
            {
                id: apiKeyIds[3],
                configId: 'public-v1',
                key: apiKeyIds[3],
                referenceId: TEST_PRIMARY_ORGANIZATION_ID,
                createdAt: new Date(orphanCutoff.getTime() + 1),
            },
        ])

        await purgeExpiredAuthenticationRecords(db, 'apikey', now)

        const remaining = await db
            .select({ id: dbSchema.apikey.id })
            .from(dbSchema.apikey)
            .where(inArray(dbSchema.apikey.id, apiKeyIds))
        expect(remaining).toHaveLength(2)
        expect(remaining).toEqual(
            expect.arrayContaining([
                { id: apiKeyIds[1] },
                { id: apiKeyIds[3] },
            ]),
        )
    })

    it('reports and resumes deterministic cleanup batch caps.', async () => {
        const now = new Date('2026-08-26T10:00:00.000Z')
        const ids = [
            '__TEST-retention-cap-1',
            '__TEST-retention-cap-2',
            '__TEST-retention-cap-3',
        ] as const
        await db.insert(dbSchema.verification).values(
            ids.map((id, index) => ({
                id,
                identifier: id,
                value: id,
                expiresAt: new Date(now.getTime() - 3 + index),
            })),
        )

        await expect(
            purgeExpiredAuthenticationRecords(db, 'verification', now, {
                batchSize: 2,
                maxBatches: 1,
            }),
        ).resolves.toMatchObject({ capReached: true, deletedCount: 2 })
        await expect(
            purgeExpiredAuthenticationRecords(db, 'verification', now, {
                batchSize: 2,
                maxBatches: 1,
            }),
        ).resolves.toMatchObject({ capReached: false, deletedCount: 1 })
    })

    it('executes all four retention selectors through the scheduled controller.', async () => {
        const expiredAt = new Date('2000-01-01T00:00:00.000Z')
        const scheduledSession = '__TEST-retention-scheduled-session'
        const scheduledVerification = '__TEST-retention-scheduled-verification'
        await db.insert(dbSchema.auditTrail).values({
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            actorType: 'system',
            actorDisplayName: 'Retention Test System',
            component: '__TEST-retention',
            action: 'scheduled',
            description: 'scheduled audit',
            loggedAt: expiredAt,
        })
        await db.insert(dbSchema.session).values({
            id: scheduledSession,
            token: scheduledSession,
            userId: TEST_OWNER_USER_ID,
            expiresAt: expiredAt,
        })
        await db.insert(dbSchema.verification).values({
            id: scheduledVerification,
            identifier: scheduledVerification,
            value: scheduledVerification,
            expiresAt: expiredAt,
        })
        await db.insert(dbSchema.apikey).values({
            id: apiKeyIds[4],
            configId: 'public-v1',
            key: apiKeyIds[4],
            referenceId: TEST_PRIMARY_ORGANIZATION_ID,
            expiresAt: expiredAt,
            createdAt: expiredAt,
        })

        await runScheduled('0 19 * * *')
        await runScheduled('5 * * * *')
        await runScheduled('10 * * * *')
        await runScheduled('15 * * * *')

        expect(
            await db
                .select({ id: dbSchema.session.id })
                .from(dbSchema.session)
                .where(eq(dbSchema.session.id, scheduledSession)),
        ).toEqual([])
        expect(
            await db
                .select({ id: dbSchema.verification.id })
                .from(dbSchema.verification)
                .where(eq(dbSchema.verification.id, scheduledVerification)),
        ).toEqual([])
        expect(
            await db
                .select({ id: dbSchema.apikey.id })
                .from(dbSchema.apikey)
                .where(eq(dbSchema.apikey.id, apiKeyIds[4])),
        ).toEqual([])
        expect(
            await db
                .select({ action: dbSchema.auditTrail.action })
                .from(dbSchema.auditTrail)
                .where(eq(dbSchema.auditTrail.component, '__TEST-retention')),
        ).not.toContainEqual({ action: 'scheduled' })
    })

    it('runs surface-scoped realtime cleanup through the five-minute controller.', async () => {
        scheduledRealtimeOperationId = uuidv7()
        await db.insert(dbSchema.websocketRevocationOperation).values({
            id: scheduledRealtimeOperationId,
            organizationId: TEST_PRIMARY_ORGANIZATION_ID,
            reason: '__TEST-RETENTION-SCHEDULED-REALTIME',
            retainUntil: new Date('2000-01-01T00:00:00.000Z'),
            revokedAuthorizationVersion: uuidv7(),
            userId: TEST_OWNER_USER_ID,
        })
        await db.insert(dbSchema.websocketRevocationDelivery).values([
            {
                delivery: 'local',
                operationId: scheduledRealtimeOperationId,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                surface: 'backoffice',
            },
            {
                delivery: 'remote',
                operationId: scheduledRealtimeOperationId,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                surface: 'public',
            },
        ])

        await runScheduled('*/5 * * * *')

        expect(
            await db
                .select({
                    surface: dbSchema.websocketRevocationDelivery.surface,
                })
                .from(dbSchema.websocketRevocationDelivery)
                .where(
                    eq(
                        dbSchema.websocketRevocationDelivery.operationId,
                        scheduledRealtimeOperationId,
                    ),
                ),
        ).toEqual([{ surface: 'public' }])
    })
})
