import { dbClient, dbSchema } from '@loanms/database/d1'
import { catalog } from '@loanms/errors'
import { getRealtimeRevocationDestinations } from '@loanms/websocket/topology'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createAndDeliverMembershipRealtimeRevocation } from '../../../src/services/realtime/authorization.js'
import {
    createMembershipWebSocketRevocation,
    listPendingWebSocketRevocationDeliveries,
    purgeExpiredWebSocketRevocations,
    recordWebSocketRevocationDeliveryAttempt,
} from '../../../src/services/realtime/authorizationPersistence.js'
import { TEST_ISOLATED_ORGANIZATION_ID } from '../../utilities.js'

const organizationId = '__TEST-ORG_WS_REVOCATION'
const userId = '__TEST-USER_WS_REVOCATION'
const memberId = '__TEST-MEMBER_WS_REVOCATION'
let db: ReturnType<typeof dbClient>

const readMembership = async () =>
    (
        await db
            .select()
            .from(dbSchema.member)
            .where(
                and(
                    eq(dbSchema.member.organizationId, organizationId),
                    eq(dbSchema.member.userId, userId),
                ),
            )
            .limit(1)
    )[0]

const expectD1ForeignKeyViolation = async (operation: PromiseLike<unknown>) => {
    try {
        await operation
    } catch (error) {
        const d1Error =
            typeof error === 'object' && error !== null && 'cause' in error
                ? error.cause
                : error

        expect(d1Error).toBeInstanceOf(Error)
        expect((d1Error as Error).message).toMatch(
            /FOREIGN KEY constraint failed/i,
        )
        return
    }

    throw new Error('Expected D1 foreign-key violation.')
}

beforeAll(async () => {
    db = dbClient(env.LOANMSPUB_D1)

    await db.insert(dbSchema.organization).values({
        id: organizationId,
        name: 'WebSocket Revocation Test',
        slug: '__test-ws-revocation',
    })
    await db.insert(dbSchema.user).values({
        id: userId,
        email: 'ws.revocation@test.loanms.example',
        name: 'WebSocket Revocation Test',
        username: '__test_ws_revocation',
    })
    await db.insert(dbSchema.member).values({
        id: memberId,
        organizationId,
        role: 'member',
        userId,
    })
})

it('returns typed invalid-input errors.', async () => {
    expect(() =>
        listPendingWebSocketRevocationDeliveries(db, {
            limit: 0,
            surface: 'public',
        }),
    ).toThrow(
        expect.objectContaining({
            code: 'REALTIME_REVOCATION_INVALID_INPUT',
            status: 500,
        }),
    )
    await expect(
        purgeExpiredWebSocketRevocations(db, {
            limit: 0,
            surface: 'public',
        }),
    ).rejects.toMatchObject({
        code: 'REALTIME_REVOCATION_INVALID_INPUT',
        status: 500,
    })
})

it('allows only one accepted delivery attempt.', async () => {
    const operationId = uuidv7()

    await db.insert(dbSchema.websocketRevocationOperation).values({
        id: operationId,
        organizationId,
        reason: 'DELIVERY_CONFLICT_TEST',
        retainUntil: new Date(Date.now() + 60_000),
        revokedAuthorizationVersion: uuidv7(),
        userId,
    })
    await db.insert(dbSchema.websocketRevocationDelivery).values({
        delivery: 'local',
        operationId,
        organizationId,
        surface: 'public',
    })

    const input = {
        accepted: true,
        operationId,
        organizationId,
        surface: 'public' as const,
    }
    const results = await Promise.allSettled([
        recordWebSocketRevocationDeliveryAttempt(db, input),
        recordWebSocketRevocationDeliveryAttempt(db, input),
    ])

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
        1,
    )
    expect(results.filter(({ status }) => status === 'rejected')).toEqual([
        expect.objectContaining({
            reason: expect.objectContaining({
                code: 'REALTIME_REVOCATION_DELIVERY_CONFLICT',
                status: 409,
            }),
        }),
    ])
    await expect(
        recordWebSocketRevocationDeliveryAttempt(db, input),
    ).rejects.toMatchObject({
        code: 'REALTIME_REVOCATION_DELIVERY_CONFLICT',
        status: 409,
    })
})

it('orders only due deliveries and applies capped exponential backoff.', async () => {
    const dueFirstOperationId = uuidv7()
    const dueSecondOperationId = uuidv7()
    const futureOperationId = uuidv7()
    const retryOperationId = uuidv7()
    const now = Date.now()

    await db.insert(dbSchema.websocketRevocationOperation).values(
        [
            dueFirstOperationId,
            dueSecondOperationId,
            futureOperationId,
            retryOperationId,
        ].map((id) => ({
            id,
            organizationId,
            reason: '__TEST-DELIVERY_BACKOFF',
            retainUntil: new Date(now + 2 * 60 * 60 * 1000),
            revokedAuthorizationVersion: uuidv7(),
            userId,
        })),
    )
    await db.insert(dbSchema.websocketRevocationDelivery).values([
        {
            delivery: 'local',
            nextAttemptAt: new Date(now - 2 * 60 * 1000),
            operationId: dueFirstOperationId,
            organizationId,
            surface: 'public',
        },
        {
            delivery: 'local',
            nextAttemptAt: new Date(now - 60 * 1000),
            operationId: dueSecondOperationId,
            organizationId,
            surface: 'public',
        },
        {
            delivery: 'local',
            nextAttemptAt: new Date(now + 60 * 1000),
            operationId: futureOperationId,
            organizationId,
            surface: 'public',
        },
        {
            delivery: 'local',
            operationId: retryOperationId,
            organizationId,
            surface: 'public',
        },
    ])

    const pendingOperationIds = (
        await listPendingWebSocketRevocationDeliveries(db, {
            limit: 100,
            surface: 'public',
        })
    )
        .map(({ operationId }) => operationId)
        .filter((operationId) =>
            [
                dueFirstOperationId,
                dueSecondOperationId,
                futureOperationId,
            ].includes(operationId),
        )

    expect(pendingOperationIds).toEqual([
        dueFirstOperationId,
        dueSecondOperationId,
    ])

    const [createdDelivery] = await db
        .select()
        .from(dbSchema.websocketRevocationDelivery)
        .where(
            eq(
                dbSchema.websocketRevocationDelivery.operationId,
                retryOperationId,
            ),
        )

    expect(
        createdDelivery!.nextAttemptAt.getTime() -
            createdDelivery!.createdAt.getTime(),
    ).toBe(5 * 60 * 1000)

    for (const [
        attemptIndex,
        delayMinutes,
    ] of [
        5,
        10,
        20,
        40,
        60,
        60,
    ].entries()) {
        await recordWebSocketRevocationDeliveryAttempt(db, {
            accepted: false,
            error: 'broker unavailable',
            operationId: retryOperationId,
            organizationId,
            surface: 'public',
        })

        const [delivery] = await db
            .select()
            .from(dbSchema.websocketRevocationDelivery)
            .where(
                eq(
                    dbSchema.websocketRevocationDelivery.operationId,
                    retryOperationId,
                ),
            )

        expect(delivery).toMatchObject({
            acceptedAt: null,
            attemptCount: attemptIndex + 1,
            lastAttemptAt: expect.any(Date),
            lastError: 'broker unavailable',
            nextAttemptAt: expect.any(Date),
        })
        expect(
            delivery!.nextAttemptAt.getTime() -
                delivery!.lastAttemptAt!.getTime(),
        ).toBe(delayMinutes * 60 * 1000)
    }
})

afterAll(async () => {
    await db
        .delete(dbSchema.websocketRevocationOperation)
        .where(
            eq(
                dbSchema.websocketRevocationOperation.organizationId,
                organizationId,
            ),
        )
    await db.delete(dbSchema.member).where(eq(dbSchema.member.id, memberId))
    await db.delete(dbSchema.user).where(eq(dbSchema.user.id, userId))
    await db
        .delete(dbSchema.organization)
        .where(eq(dbSchema.organization.id, organizationId))
})

describe('Membership WebSocket authorization revocation', () => {
    it('generates a non-null authorization version for new memberships.', async () => {
        expect(await readMembership()).toMatchObject({
            websocketAuthorizationVersion:
                expect.stringMatching(/^[0-9a-f-]{36}$/i),
        })
    })

    it('atomically rotates role and authorization with one local destination.', async () => {
        const before = (await readMembership())!
        const operationId = uuidv7()
        const created = await createMembershipWebSocketRevocation({
            client: db,
            destinations: getRealtimeRevocationDestinations(
                { kind: 'independent-surfaces' },
                'public',
            ),
            mutation: {
                kind: 'set-role',
                role: 'administrator',
            },
            operationId,
            organizationId,
            reason: 'MEMBERSHIP_ROLE_CHANGED',
            userId,
        })
        const after = (await readMembership())!
        const deliveries = await db
            .select()
            .from(dbSchema.websocketRevocationDelivery)
            .where(
                eq(
                    dbSchema.websocketRevocationDelivery.operationId,
                    operationId,
                ),
            )

        expect(created.replayed).toBe(false)
        expect(after.role).toBe('administrator')
        expect(after.websocketAuthorizationVersion).not.toBe(
            before.websocketAuthorizationVersion,
        )
        expect(created.operation).toMatchObject({
            replacementAuthorizationVersion:
                after.websocketAuthorizationVersion,
            revokedAuthorizationVersion: before.websocketAuthorizationVersion,
        })
        expect(deliveries).toEqual([
            expect.objectContaining({
                delivery: 'local',
                surface: 'public',
            }),
        ])

        const replay = await createMembershipWebSocketRevocation({
            client: db,
            destinations: getRealtimeRevocationDestinations(
                { kind: 'independent-surfaces' },
                'public',
            ),
            mutation: {
                kind: 'set-role',
                role: 'administrator',
            },
            operationId,
            organizationId,
            reason: 'MEMBERSHIP_ROLE_CHANGED',
            userId,
        })

        expect(replay.replayed).toBe(true)
        expect((await readMembership())!.websocketAuthorizationVersion).toBe(
            after.websocketAuthorizationVersion,
        )
    })

    it('generates local and remote rows for shared authorization.', async () => {
        const operationId = uuidv7()

        await createMembershipWebSocketRevocation({
            client: db,
            destinations: getRealtimeRevocationDestinations(
                { kind: 'shared-auth-security-only' },
                'public',
            ),
            mutation: { kind: 'rotate' },
            operationId,
            organizationId,
            reason: 'ACCOUNT_LOCK_CHANGED',
            userId,
        })

        expect(
            await db
                .select({
                    delivery: dbSchema.websocketRevocationDelivery.delivery,
                    surface: dbSchema.websocketRevocationDelivery.surface,
                })
                .from(dbSchema.websocketRevocationDelivery)
                .where(
                    eq(
                        dbSchema.websocketRevocationDelivery.operationId,
                        operationId,
                    ),
                ),
        ).toEqual(
            expect.arrayContaining([
                {
                    delivery: 'local',
                    surface: 'public',
                },
                {
                    delivery: 'remote',
                    surface: 'backoffice',
                },
            ]),
        )
    })

    it('removes membership while retaining historical upload attribution.', async () => {
        const testSuffix = uuidv7()
        const testOrganizationId = `__TEST-ORG_WS_HISTORY_${testSuffix}`
        const testUserId = `__TEST-USER_WS_HISTORY_${testSuffix}`
        const testMemberId = `__TEST-MEMBER_WS_HISTORY_${testSuffix}`
        const testUploadId = `__TEST-UPLOAD_WS_HISTORY_${testSuffix}`
        const operationId = uuidv7()

        try {
            await db.insert(dbSchema.organization).values({
                id: testOrganizationId,
                name: 'WebSocket Historical Attribution Test',
                slug: `__test-ws-history-${testSuffix}`,
            })
            await db.insert(dbSchema.user).values({
                id: testUserId,
                email: `ws.history.${testSuffix}@test.loanms.example`,
                name: 'WebSocket Historical Attribution Test',
                username: `__test_ws_history_${testSuffix}`,
            })
            await db.insert(dbSchema.member).values({
                id: testMemberId,
                organizationId: testOrganizationId,
                role: 'member',
                userId: testUserId,
            })
            await db.insert(dbSchema.upload).values({
                id: testUploadId,
                organizationId: testOrganizationId,
                userId: testUserId,
            })
            await db.insert(dbSchema.uploadAttachmentBatchRequest).values({
                idempotencyKey: uuidv7(),
                organizationId: testOrganizationId,
                requestFingerprint: uuidv7(),
                responseData: {
                    signedUrls: [],
                    uploadId: testUploadId,
                },
                uploadId: testUploadId,
                userId: testUserId,
            })

            const created = await createMembershipWebSocketRevocation({
                client: db,
                destinations: getRealtimeRevocationDestinations(
                    { kind: 'independent-surfaces' },
                    'public',
                ),
                mutation: { kind: 'remove' },
                operationId,
                organizationId: testOrganizationId,
                reason: 'MEMBERSHIP_REMOVED_WITH_UPLOAD_HISTORY',
                userId: testUserId,
            })

            expect(created.replayed).toBe(false)
            expect(created.operation.replacementAuthorizationVersion).toBeNull()
            expect(
                await db
                    .select({ id: dbSchema.member.id })
                    .from(dbSchema.member)
                    .where(eq(dbSchema.member.id, testMemberId)),
            ).toEqual([])
            expect(
                await db
                    .select({
                        organizationId:
                            dbSchema.uploadAttachmentBatchRequest
                                .organizationId,
                        userId: dbSchema.uploadAttachmentBatchRequest.userId,
                    })
                    .from(dbSchema.uploadAttachmentBatchRequest)
                    .where(
                        and(
                            eq(
                                dbSchema.uploadAttachmentBatchRequest
                                    .organizationId,
                                testOrganizationId,
                            ),
                            eq(
                                dbSchema.uploadAttachmentBatchRequest.userId,
                                testUserId,
                            ),
                        ),
                    ),
            ).toEqual([
                {
                    organizationId: testOrganizationId,
                    userId: testUserId,
                },
            ])
        } finally {
            await db
                .delete(dbSchema.websocketRevocationOperation)
                .where(
                    eq(dbSchema.websocketRevocationOperation.id, operationId),
                )
            await db
                .delete(dbSchema.upload)
                .where(eq(dbSchema.upload.id, testUploadId))
            await db
                .delete(dbSchema.member)
                .where(eq(dbSchema.member.id, testMemberId))
            await db
                .delete(dbSchema.user)
                .where(eq(dbSchema.user.id, testUserId))
            await db
                .delete(dbSchema.organization)
                .where(eq(dbSchema.organization.id, testOrganizationId))
        }
    })

    it('requires exact fingerprint identity when an operation ID is replayed.', async () => {
        const operationId = uuidv7()
        const baseInput = {
            client: db,
            destinations: getRealtimeRevocationDestinations(
                { kind: 'shared-auth-security-only' } as const,
                'public',
            ),
            mutation: {
                kind: 'set-role' as const,
                role: 'member',
            },
            operationId,
            organizationId,
            reason: 'EXACT_REPLAY_TEST',
            userId,
        }
        const created = await createMembershipWebSocketRevocation(baseInput)
        const afterCreation = (await readMembership())!
        const replay = await createMembershipWebSocketRevocation({
            ...baseInput,
            destinations: [...baseInput.destinations].reverse(),
        })

        expect(created.replayed).toBe(false)
        expect(replay.replayed).toBe(true)

        const variants = [
            {
                ...baseInput,
                mutation: { kind: 'rotate' as const },
            },
            {
                ...baseInput,
                mutation: {
                    kind: 'set-role' as const,
                    role: 'administrator',
                },
            },
            {
                ...baseInput,
                destinations: getRealtimeRevocationDestinations(
                    { kind: 'independent-surfaces' },
                    'public',
                ),
            },
            {
                ...baseInput,
                reason: 'DIFFERENT_REASON',
            },
            {
                ...baseInput,
                organizationId: '__DIFFERENT_ORGANIZATION',
            },
            {
                ...baseInput,
                userId: '__DIFFERENT_USER',
            },
            {
                ...baseInput,
                retainUntil: new Date(Date.now() + 86_400_000),
            },
        ]

        for (const variant of variants) {
            await expect(
                createMembershipWebSocketRevocation(variant),
            ).rejects.toThrow(
                'WebSocket revocation operation ID was reused with different input.',
            )
        }

        expect((await readMembership())!).toMatchObject({
            role: afterCreation.role,
            websocketAuthorizationVersion:
                afterCreation.websocketAuthorizationVersion,
        })
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationDelivery)
                .where(
                    eq(
                        dbSchema.websocketRevocationDelivery.operationId,
                        operationId,
                    ),
                ),
        ).toHaveLength(2)
    })

    it('creates once for concurrent identical operations.', async () => {
        const operationId = uuidv7()
        const input = {
            client: db,
            destinations: getRealtimeRevocationDestinations(
                { kind: 'independent-surfaces' } as const,
                'public',
            ),
            mutation: { kind: 'rotate' as const },
            operationId,
            organizationId,
            reason: 'CONCURRENT_REPLAY_TEST',
            userId,
        }
        const results = await Promise.all([
            createMembershipWebSocketRevocation(input),
            createMembershipWebSocketRevocation(input),
        ])

        expect(results.map(({ replayed }) => replayed).sort()).toEqual([
            false,
            true,
        ])
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationOperation)
                .where(
                    eq(dbSchema.websocketRevocationOperation.id, operationId),
                ),
        ).toHaveLength(1)
    })

    it('rejects invalid and non-v7 operation IDs before persistence.', async () => {
        for (const operationId of [
            'invalid',
            uuidv4(),
        ]) {
            await expect(
                createMembershipWebSocketRevocation({
                    client: db,
                    destinations: getRealtimeRevocationDestinations(
                        { kind: 'independent-surfaces' },
                        'public',
                    ),
                    mutation: { kind: 'rotate' },
                    operationId,
                    organizationId,
                    reason: 'INVALID_ID_TEST',
                    userId,
                }),
            ).rejects.toMatchObject({
                ...catalog.realtimeRevocationInvalidInput,
                cause: 'WebSocket revocation operation ID must be a UUIDv7.',
            })
        }
    })

    it('rejects replay of a persisted operation with a null fingerprint.', async () => {
        const operationId = uuidv7()

        await db.insert(dbSchema.websocketRevocationOperation).values({
            id: operationId,
            organizationId,
            reason: 'NULL_FINGERPRINT_REPLAY_TEST',
            retainUntil: new Date(Date.now() + 60_000),
            revokedAuthorizationVersion: uuidv7(),
            userId,
        })

        await expect(
            createMembershipWebSocketRevocation({
                client: db,
                destinations: getRealtimeRevocationDestinations(
                    { kind: 'independent-surfaces' },
                    'public',
                ),
                mutation: { kind: 'rotate' },
                operationId,
                organizationId,
                reason: 'NULL_FINGERPRINT_REPLAY_TEST',
                userId,
            }),
        ).rejects.toThrow(
            'WebSocket revocation operation ID was reused with different input.',
        )
    })

    it('commits before best-effort local and remote delivery.', async () => {
        const operationId = uuidv7()
        const scheduled: Promise<unknown>[] = []
        const deliverRealtimeRevocation = vi
            .fn()
            .mockRejectedValue(
                new Error(
                    'remote broker offline postgres://user:PRIVATE_PASSWORD@db.internal/app',
                ),
            )

        const created = await createAndDeliverMembershipRealtimeRevocation({
            client: db,
            database: env.LOANMSPUB_D1,
            mutation: { kind: 'rotate' },
            namespace: {
                getByName: () => ({
                    revokeRealtimeAuthorization: async () => ({
                        accepted: true,
                        closedSocketCount: 0,
                        failedLeafCount: 0,
                        successfulLeafCount: 64,
                    }),
                }),
            } as unknown as typeof env.LOANMSPUB_DO_WSB,
            operationId,
            organizationId,
            profile: { kind: 'shared-auth-security-only' },
            reason: 'POST_COMMIT_DELIVERY_TEST',
            remoteBroker: { deliverRealtimeRevocation },
            userId,
            waitUntil: (promise) => scheduled.push(promise),
        })

        expect(created.operation.id).toBe(operationId)
        expect(scheduled).toHaveLength(1)
        await expect(scheduled[0]).resolves.toBeUndefined()
        expect(deliverRealtimeRevocation).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId,
                organizationId,
            }),
        )
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationDelivery)
                .where(
                    eq(
                        dbSchema.websocketRevocationDelivery.operationId,
                        operationId,
                    ),
                ),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    acceptedAt: expect.any(Date),
                    attemptCount: 1,
                    lastError: null,
                    surface: 'public',
                }),
                expect.objectContaining({
                    acceptedAt: null,
                    attemptCount: 1,
                    lastError: 'Realtime revocation delivery failed.',
                    surface: 'backoffice',
                }),
            ]),
        )
    })

    it('persists a fixed error for thrown local and remote delivery failures.', async () => {
        const operationId = uuidv7()
        const scheduled: Promise<unknown>[] = []
        const secret = 'postgres://user:PRIVATE_PASSWORD@db.internal/app'
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)

        try {
            await createAndDeliverMembershipRealtimeRevocation({
                client: db,
                database: env.LOANMSPUB_D1,
                mutation: { kind: 'rotate' },
                namespace: {
                    getByName: () => ({
                        revokeRealtimeAuthorization: async () => {
                            throw new Error(`local broker down ${secret}`)
                        },
                    }),
                } as unknown as typeof env.LOANMSPUB_DO_WSB,
                operationId,
                organizationId,
                profile: { kind: 'shared-auth-security-only' },
                reason: 'FIXED_DELIVERY_ERROR_TEST',
                remoteBroker: {
                    deliverRealtimeRevocation: vi
                        .fn()
                        .mockRejectedValue(
                            new Error(`remote broker down ${secret}`),
                        ),
                },
                userId,
                waitUntil: (promise) => scheduled.push(promise),
            })
            await scheduled[0]

            const deliveries = await db
                .select()
                .from(dbSchema.websocketRevocationDelivery)
                .where(
                    eq(
                        dbSchema.websocketRevocationDelivery.operationId,
                        operationId,
                    ),
                )
            const entries = consoleError.mock.calls.flatMap(([entry]) => {
                try {
                    return [
                        JSON.parse(String(entry)) as Record<string, unknown>,
                    ]
                } catch {
                    return []
                }
            })
            expect(deliveries).toHaveLength(2)
            for (const delivery of deliveries)
                expect(delivery).toMatchObject({
                    acceptedAt: null,
                    attemptCount: 1,
                    lastError: 'Realtime revocation delivery failed.',
                })
            expect(JSON.stringify(deliveries)).not.toContain('PRIVATE_')
            // The persisted error is fixed; the cause is only in the log.
            expect(
                entries.filter(
                    (entry) => entry.type === 'WS_REVOCATION_DELIVERY_ERROR',
                ),
            ).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        operationId,
                        surface: 'public',
                        message:
                            'local broker down postgres://<redacted>@db.internal/app',
                    }),
                    expect.objectContaining({
                        operationId,
                        surface: 'backoffice',
                        message:
                            'remote broker down postgres://<redacted>@db.internal/app',
                    }),
                ]),
            )
            expect(JSON.stringify(entries)).not.toContain('PRIVATE_')
        } finally {
            consoleError.mockRestore()
        }
    })

    it('logs a serialized, redacted error when a delivery attempt cannot be recorded.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const operationId = uuidv7()
        const scheduled: Promise<unknown>[] = []

        try {
            await createAndDeliverMembershipRealtimeRevocation({
                client: db,
                deliveryClient: {
                    update: () => {
                        throw new Error(
                            'record failed postgres://user:PRIVATE_PASSWORD@db.internal/app',
                        )
                    },
                } as unknown as typeof db,
                mutation: { kind: 'rotate' },
                namespace: {
                    getByName: () => ({
                        revokeRealtimeAuthorization: async () => ({
                            accepted: true,
                            closedSocketCount: 0,
                            failedLeafCount: 0,
                            successfulLeafCount: 64,
                        }),
                    }),
                } as unknown as typeof env.LOANMSPUB_DO_WSB,
                operationId,
                organizationId,
                profile: { kind: 'independent-surfaces' },
                reason: 'RECORD_ERROR_LOG_TEST',
                userId,
                waitUntil: (promise) => scheduled.push(promise),
            })
            await scheduled[0]

            const entries = consoleError.mock.calls.map(([entry]) =>
                JSON.parse(String(entry)),
            )
            expect(entries).toContainEqual(
                expect.objectContaining({
                    type: 'WS_REVOCATION_DELIVERY_RECORD_ERROR',
                    operationId,
                    surface: 'public',
                    name: 'Error',
                    message:
                        'record failed postgres://<redacted>@db.internal/app',
                }),
            )
            expect(JSON.stringify(entries)).not.toContain('PRIVATE_')
        } finally {
            consoleError.mockRestore()
        }
    })

    it('purges bounded expired deliveries only for the requested surface.', async () => {
        const sharedOperationId = uuidv7()
        const publicOnlyOperationId = uuidv7()

        await db.insert(dbSchema.websocketRevocationOperation).values([
            {
                id: sharedOperationId,
                organizationId,
                reason: '__TEST-EXPIRED_RECOVERY_SHARED',
                retainUntil: new Date('2000-01-01T00:00:00.000Z'),
                revokedAuthorizationVersion: uuidv7(),
                userId,
            },
            {
                id: publicOnlyOperationId,
                organizationId,
                reason: '__TEST-EXPIRED_RECOVERY_PUBLIC_ONLY',
                retainUntil: new Date('2001-01-01T00:00:00.000Z'),
                revokedAuthorizationVersion: uuidv7(),
                userId,
            },
        ])
        await db.insert(dbSchema.websocketRevocationDelivery).values([
            {
                delivery: 'local',
                operationId: sharedOperationId,
                organizationId,
                surface: 'public',
            },
            {
                delivery: 'local',
                operationId: sharedOperationId,
                organizationId,
                surface: 'backoffice',
            },
            {
                delivery: 'local',
                operationId: publicOnlyOperationId,
                organizationId,
                surface: 'public',
            },
        ])

        expect(
            (
                await listPendingWebSocketRevocationDeliveries(db, {
                    limit: 100,
                    surface: 'public',
                })
            ).map(({ operationId }) => operationId),
        ).not.toEqual(
            expect.arrayContaining([
                sharedOperationId,
                publicOnlyOperationId,
            ]),
        )
        await expect(
            purgeExpiredWebSocketRevocations(db, {
                limit: 1,
                surface: 'public',
            }),
        ).resolves.toBe(1)
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationOperation)
                .where(
                    eq(
                        dbSchema.websocketRevocationOperation.id,
                        sharedOperationId,
                    ),
                ),
        ).toHaveLength(1)
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationDelivery)
                .where(
                    eq(
                        dbSchema.websocketRevocationDelivery.operationId,
                        sharedOperationId,
                    ),
                ),
        ).toEqual([
            expect.objectContaining({ surface: 'backoffice' }),
        ])

        await expect(
            purgeExpiredWebSocketRevocations(db, {
                limit: 1,
                surface: 'backoffice',
            }),
        ).resolves.toBe(1)
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationOperation)
                .where(
                    eq(
                        dbSchema.websocketRevocationOperation.id,
                        sharedOperationId,
                    ),
                ),
        ).toHaveLength(0)

        await expect(
            purgeExpiredWebSocketRevocations(db, {
                limit: 100,
                surface: 'public',
            }),
        ).resolves.toBe(1)
        expect(
            await db
                .select()
                .from(dbSchema.websocketRevocationOperation)
                .where(
                    eq(
                        dbSchema.websocketRevocationOperation.id,
                        publicOnlyOperationId,
                    ),
                ),
        ).toHaveLength(0)
    })

    it('enforces same-tenant delivery references.', async () => {
        const operationId = uuidv7()

        await db.insert(dbSchema.websocketRevocationOperation).values({
            id: operationId,
            organizationId,
            reason: 'TENANT_CONSTRAINT_TEST',
            retainUntil: new Date(Date.now() + 60_000),
            revokedAuthorizationVersion: uuidv7(),
            userId,
        })

        await expectD1ForeignKeyViolation(
            db.insert(dbSchema.websocketRevocationDelivery).values({
                delivery: 'local',
                operationId,
                organizationId: TEST_ISOLATED_ORGANIZATION_ID,
                surface: 'public',
            }),
        )
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
