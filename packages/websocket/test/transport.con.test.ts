import { describe, expect, it, vi } from 'vitest'

import {
    createRealtimeBrokerObjectName,
    createRealtimeLeafObjectName,
    createRealtimeLeafProbeOrder,
    getSafeOrganizationIdentity,
    getSafeWebSocketObjectIdentity,
    getWebSocketAdmissionFailure,
    isRealtimeAudience,
    isRealtimeBrokerScope,
    isRealtimeLeafScope,
    isRealtimeRevocationDirective,
    isRealtimeTransportAttachment,
    REALTIME_STORAGE_VERSION,
    REALTIME_TRANSPORT_VERSION,
    runBoundedTasks,
    WS_LEAF_COUNT,
} from '../src/transport.js'

describe('WebSocket transport utilities', () => {
    it('uses transport-versioned collision-safe complete tuple names.', () => {
        expect(REALTIME_STORAGE_VERSION).toBe(1)
        expect(REALTIME_TRANSPORT_VERSION).toBe(1)
        expect(
            createRealtimeBrokerObjectName({
                storageVersion: REALTIME_STORAGE_VERSION,
                surface: 'public',
                organizationId: 'organization-a',
                stream: 'APP',
            }),
        ).toBe('["realtimeBroker",1,"public","organization-a","APP"]')
        expect(
            createRealtimeLeafObjectName(
                {
                    storageVersion: REALTIME_STORAGE_VERSION,
                    surface: 'public',
                    organizationId: 'organization-a',
                    stream: 'APP',
                },
                7,
            ),
        ).toBe('["realtimeLeaf",1,"public","organization-a","APP",7]')
        expect(
            createRealtimeBrokerObjectName({
                storageVersion: 1,
                surface: 'public',
                organizationId: 'a:b',
                stream: 'APP',
            }),
        ).not.toBe(
            createRealtimeBrokerObjectName({
                storageVersion: 1,
                surface: 'public',
                organizationId: 'a',
                stream: 'APP',
            }),
        )
        expect(
            createRealtimeBrokerObjectName({
                storageVersion: 1,
                surface: 'public',
                organizationId: 'a',
                stream: 'APP',
            }),
        ).not.toBe(
            createRealtimeBrokerObjectName({
                storageVersion: 1,
                surface: 'backoffice',
                organizationId: 'a',
                stream: 'APP',
            }),
        )
    })

    it('creates a stable exhaustive realtime probe per surface and stream.', () => {
        const scope = {
            storageVersion: 1 as const,
            surface: 'public' as const,
            organizationId: 'organization-a',
            stream: 'APP',
        }
        const first = createRealtimeLeafProbeOrder(scope, 'connection-a')
        const second = createRealtimeLeafProbeOrder(scope, 'connection-a')

        expect(first).toEqual(second)
        expect(first.slice(0, 8)).toEqual([
            43,
            26,
            9,
            56,
            39,
            22,
            5,
            52,
        ])
        expect(first).toHaveLength(WS_LEAF_COUNT)
        expect(new Set(first).size).toBe(WS_LEAF_COUNT)
        expect(
            first.map((shardIndex) =>
                createRealtimeLeafObjectName(scope, shardIndex),
            ),
        ).toHaveLength(WS_LEAF_COUNT)
    })

    it('returns distinct full-capacity and shard-unavailable failures.', () => {
        expect(getWebSocketAdmissionFailure(WS_LEAF_COUNT, 0)).toEqual({
            code: 'WEBSOCKET_CAPACITY_UNAVAILABLE',
            message: 'WebSocket capacity is temporarily unavailable.',
        })
        expect(getWebSocketAdmissionFailure(WS_LEAF_COUNT - 1, 1)).toEqual({
            code: 'WEBSOCKET_SHARD_UNAVAILABLE',
            message: 'WebSocket shards are temporarily unavailable.',
        })
    })

    it('produces safe stable object log identities.', () => {
        const objectId = 'raw-durable-object-id'
        const objectIdentity = getSafeWebSocketObjectIdentity(objectId)
        const organizationIdentity = getSafeOrganizationIdentity(objectId)

        expect(objectIdentity).toBe(getSafeWebSocketObjectIdentity(objectId))
        expect(organizationIdentity).toBe(getSafeOrganizationIdentity(objectId))
        expect(objectIdentity).not.toBe(organizationIdentity)
        expect(objectIdentity).not.toContain(objectId)
        expect(organizationIdentity).not.toContain(objectId)
        expect(objectIdentity).toMatch(/^[\da-f]{8}$/)
        expect(organizationIdentity).toMatch(/^[\da-f]{8}$/)
    })

    it('validates wire-versioned attachments and bounded audiences.', () => {
        const attachment = {
            storageVersion: 1,
            topology: 'leaf',
            surface: 'public',
            organizationId: 'organization-a',
            stream: 'APP',
            shardIndex: 63,
            authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
            connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
            identityId: 'identity-a',
            wireVersion: 'realtime.events.v1',
            roles: ['member'],
            sessionExpiresAt: Date.now() + 60_000,
            target: null,
        }

        expect(isRealtimeTransportAttachment(attachment)).toBe(true)
        expect(
            isRealtimeTransportAttachment({
                ...attachment,
                protocol: 1,
                wireVersion: undefined,
            }),
        ).toBe(false)
        expect(
            isRealtimeTransportAttachment({
                ...attachment,
                shardIndex: WS_LEAF_COUNT,
            }),
        ).toBe(false)
        expect(
            isRealtimeTransportAttachment({
                ...attachment,
                connectionId: 'connection-a',
            }),
        ).toBe(false)
        expect(
            isRealtimeTransportAttachment({
                ...attachment,
                roles: [
                    'member',
                    'member',
                ],
            }),
        ).toBe(false)
        expect(isRealtimeAudience({ kind: 'organization' })).toBe(true)
        expect(
            isRealtimeAudience({
                kind: 'identity',
                identityIds: ['identity-a'],
            }),
        ).toBe(true)
        expect(
            isRealtimeAudience({
                kind: 'role',
                roles: [],
            }),
        ).toBe(false)
    })

    it('validates scopes and requires UUIDv7 revocation operation IDs.', () => {
        const brokerScope = {
            organizationId: 'organization-a',
            stream: 'APP',
            surface: 'public',
            storageVersion: 1,
        }

        expect(isRealtimeBrokerScope(brokerScope)).toBe(true)
        expect(
            isRealtimeBrokerScope({
                ...brokerScope,
                storageVersion: undefined,
                version: 1,
            }),
        ).toBe(false)
        expect(
            isRealtimeLeafScope({
                ...brokerScope,
                shardIndex: WS_LEAF_COUNT - 1,
                topology: 'leaf',
            }),
        ).toBe(true)
        expect(
            isRealtimeLeafScope({
                ...brokerScope,
                shardIndex: WS_LEAF_COUNT,
                topology: 'leaf',
            }),
        ).toBe(false)

        const directive = {
            authorizationVersion: '550e8400-e29b-41d4-a716-446655440000',
            expiresAt: Date.now() + 60_000,
            identityId: 'identity-a',
            operationId: '0198ef86-e6ab-7da4-98d3-57e3101779e6',
            organizationId: 'organization-a',
        }

        expect(isRealtimeRevocationDirective(directive)).toBe(true)
        expect(
            isRealtimeRevocationDirective({
                ...directive,
                operationId: '550e8400-e29b-41d4-a716-446655440000',
            }),
        ).toBe(false)
    })

    it('bounds fan-out concurrency and isolates partial failures.', async () => {
        let active = 0
        let maxActive = 0
        const tasks = Array.from({ length: 12 }, (_, index) => async () => {
            active += 1
            maxActive = Math.max(maxActive, active)
            await Promise.resolve()
            active -= 1

            if (index === 4) throw new Error('Injected leaf failure.')

            return index
        })
        const results = await runBoundedTasks(tasks, 3, 1000)

        expect(maxActive).toBe(3)
        expect(results).toHaveLength(12)
        expect(
            results.filter(({ status }) => status === 'fulfilled'),
        ).toHaveLength(11)
        expect(results[4].status).toBe('rejected')
    })

    it('marks work unavailable after the fan-out deadline.', async () => {
        const results = await runBoundedTasks([async () => 'unreachable'], 1, 0)

        expect(results).toEqual([
            {
                status: 'rejected',
                reason: expect.any(Error),
            },
        ])
    })

    it.each([
        {
            concurrency: Number.NaN,
            deadlineMs: 1000,
        },
        {
            concurrency: Number.POSITIVE_INFINITY,
            deadlineMs: 1000,
        },
        {
            concurrency: 1,
            deadlineMs: Number.NaN,
        },
        {
            concurrency: 1,
            deadlineMs: Number.NEGATIVE_INFINITY,
        },
    ])(
        'fails closed for non-finite bounded-task configuration %#.',
        async ({ concurrency, deadlineMs }) => {
            const task = vi.fn(async () => 'unreachable')
            const results = await runBoundedTasks(
                [
                    task,
                    task,
                ],
                concurrency,
                deadlineMs,
            )

            expect(results).toEqual([
                {
                    status: 'rejected',
                    reason: expect.any(Error),
                },
                {
                    status: 'rejected',
                    reason: expect.any(Error),
                },
            ])
            expect(task).not.toHaveBeenCalled()
        },
    )
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
