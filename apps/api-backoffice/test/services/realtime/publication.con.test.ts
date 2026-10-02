import {
    createRealtimeRegistry,
    defineRealtimeEvent,
} from '@hyperion/websocket/registry'
import { createRealtimeBrokerObjectName } from '@hyperion/websocket/transport'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { WebSocketBroker } from '../../../src/core/durableObject/webSocket.js'
import {
    publishBackofficeRealtimeAfterCommit,
    publishBackofficeRealtimeLocally,
    scheduleBackofficeRealtimePublications,
    type TBackofficeRealtimePublicationResult,
} from '../../../src/services/realtime/publication.js'

const registry = createRealtimeRegistry({
    appEvents: {
        SYNTHETIC_CHANGED: defineRealtimeEvent({
            audiences: ['organization'],
            delivery: 'organization',
            payloadSchema: z.object({
                projection: z.string(),
            }),
        }),
    },
})

const metadata = {
    audience: { kind: 'organization' as const },
    event: 'SYNTHETIC_CHANGED',
    eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
    occurredAt: '2026-07-27T12:00:00.000+08:00',
    organizationId: 'organization-1',
    stream: 'APP',
    target: null,
}

const accepted = {
    accepted: true as const,
    deliveredCount: 1,
    failedTargetCount: 0,
    successfulTargetCount: 1,
}

const flush = (waitUntil: ReturnType<typeof vi.fn>) =>
    Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

const createNamespace = (
    result:
        | typeof accepted
        | {
              accepted: false
              code: 'FANOUT_UNAVAILABLE' | 'RATE_LIMITED'
          } = accepted,
) => {
    const publishRealtime = vi.fn().mockResolvedValue(result)
    const getByName = vi.fn(() => ({ publishRealtime }))

    return {
        getByName,
        namespace: {
            getByName,
        } as unknown as DurableObjectNamespace<WebSocketBroker>,
        publishRealtime,
    }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('Backoffice realtime publication', () => {
    it('publishes a validated descriptor to the local broker.', async () => {
        const broker = createNamespace()
        const result = await publishBackofficeRealtimeLocally({
            descriptor: {
                ...metadata,
                destinationSurface: 'backoffice',
                payload: { projection: 'backoffice' },
                sourceSurface: 'backoffice',
            },
            namespace: broker.namespace,
            origin: 'local',
            registry,
        })

        expect(result).toEqual(accepted)
        expect(broker.getByName).toHaveBeenCalledWith(
            createRealtimeBrokerObjectName({
                organizationId: 'organization-1',
                storageVersion: 1,
                stream: 'APP',
                surface: 'backoffice',
            }),
        )
        expect(broker.publishRealtime).toHaveBeenCalledWith(
            expect.objectContaining({
                eventId: metadata.eventId,
                payload: { projection: 'backoffice' },
            }),
        )
    })

    it('returns local broker rejection without throwing.', async () => {
        const broker = createNamespace({
            accepted: false,
            code: 'RATE_LIMITED',
        })

        await expect(
            publishBackofficeRealtimeLocally({
                descriptor: {
                    ...metadata,
                    destinationSurface: 'backoffice',
                    payload: { projection: 'backoffice' },
                    sourceSurface: 'backoffice',
                },
                namespace: broker.namespace,
                origin: 'local',
                registry,
            }),
        ).resolves.toEqual({
            accepted: false,
            code: 'RATE_LIMITED',
        })
    })

    it('rejects peer RPC descriptors that claim the local source.', async () => {
        const broker = createNamespace()

        await expect(
            publishBackofficeRealtimeLocally({
                descriptor: {
                    ...metadata,
                    destinationSurface: 'backoffice',
                    payload: { projection: 'backoffice' },
                    sourceSurface: 'backoffice',
                },
                namespace: broker.namespace,
                origin: 'peer',
                profile: {
                    direction: 'bidirectional',
                    kind: 'shared-auth-events',
                },
                registry,
            }),
        ).resolves.toEqual({
            accepted: false,
            code: 'SOURCE_MISMATCH',
        })
        expect(broker.publishRealtime).not.toHaveBeenCalled()
    })

    it('projects per surface and preserves one event ID for reverse one-way publication.', async () => {
        const broker = createNamespace()
        const projectPayload = vi.fn((surface: string) => ({
            projection: surface,
        }))
        const publishRealtimePublication = vi.fn().mockResolvedValue(accepted)
        const result = await publishBackofficeRealtimeAfterCommit({
            metadata,
            namespace: broker.namespace,
            profile: {
                direction: 'backoffice-to-public',
                kind: 'shared-auth-events',
            },
            projectPayload,
            realtimePublisher: { publishRealtimePublication },
            registry,
        })

        expect(result).toMatchObject({
            complete: true,
            eventId: metadata.eventId,
            deliveries: [
                {
                    accepted: true,
                    delivery: 'local',
                    surface: 'backoffice',
                },
                { accepted: true, delivery: 'remote', surface: 'public' },
            ],
        })
        expect(projectPayload).toHaveBeenCalledTimes(2)
        expect(publishRealtimePublication).toHaveBeenCalledWith(
            expect.objectContaining({
                destinationSurface: 'public',
                eventId: metadata.eventId,
                payload: { projection: 'public' },
            }),
        )
    })

    it('attempts remote publication after local failure.', async () => {
        const broker = createNamespace({
            accepted: false,
            code: 'FANOUT_UNAVAILABLE',
        })
        const publishRealtimePublication = vi.fn().mockResolvedValue(accepted)
        const result = await publishBackofficeRealtimeAfterCommit({
            metadata,
            namespace: broker.namespace,
            profile: {
                direction: 'bidirectional',
                kind: 'shared-auth-events',
            },
            projectPayload: (surface) => ({ projection: surface }),
            realtimePublisher: { publishRealtimePublication },
            registry,
        })

        expect(result.complete).toBe(false)
        expect(result.deliveries).toEqual([
            expect.objectContaining({
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
                surface: 'backoffice',
            }),
            expect.objectContaining({
                accepted: true,
                surface: 'public',
            }),
        ])
        expect(publishRealtimePublication).toHaveBeenCalledOnce()
    })

    it('keeps local success when remote projection or RPC fails.', async () => {
        const broker = createNamespace()
        const projectionFailure = await publishBackofficeRealtimeAfterCommit({
            metadata,
            namespace: broker.namespace,
            profile: {
                direction: 'backoffice-to-public',
                kind: 'shared-auth-events',
            },
            projectPayload: (surface) => {
                if (surface === 'public')
                    throw new Error(
                        'PRIVATE_PROJECTION postgres://user:PRIVATE_PASSWORD@db.internal/app',
                    )
                return { projection: surface }
            },
            realtimePublisher: {
                publishRealtimePublication: vi.fn(),
            },
            registry,
        })
        const rpcFailure = await publishBackofficeRealtimeAfterCommit({
            metadata,
            namespace: broker.namespace,
            profile: {
                direction: 'backoffice-to-public',
                kind: 'shared-auth-events',
            },
            projectPayload: (surface) => ({ projection: surface }),
            realtimePublisher: {
                publishRealtimePublication: vi
                    .fn()
                    .mockRejectedValue(
                        new Error('PRIVATE_RPC Bearer PRIVATE_TOKEN'),
                    ),
            },
            registry,
        })

        expect(projectionFailure.deliveries).toEqual([
            expect.objectContaining({ accepted: true, surface: 'backoffice' }),
            expect.objectContaining({
                accepted: false,
                code: 'PROJECTION_FAILED',
                surface: 'public',
            }),
        ])
        expect(rpcFailure.deliveries).toEqual([
            expect.objectContaining({ accepted: true, surface: 'backoffice' }),
            expect.objectContaining({
                accepted: false,
                code: 'RPC_UNAVAILABLE',
                surface: 'public',
            }),
        ])
        expect(projectionFailure.deliveries[1]).toMatchObject({
            error: 'Realtime payload projection failed.',
        })
        expect(rpcFailure.deliveries[1]).toMatchObject({
            error: 'Realtime publication failed.',
        })
        expect(
            JSON.stringify([
                projectionFailure,
                rpcFailure,
            ]),
        ).not.toContain('PRIVATE_')
    })

    it('schedules successful publications without logging an error.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const waitUntil = vi.fn()

        scheduleBackofficeRealtimePublications({
            operation: 'APP',
            publications: [
                Promise.resolve({
                    complete: true,
                    deliveries: [
                        {
                            accepted: true,
                            delivery: 'local',
                            result: accepted,
                            surface: 'backoffice',
                        },
                    ],
                    eventId: metadata.eventId,
                } satisfies TBackofficeRealtimePublicationResult),
            ],
            waitUntil,
        })
        await flush(waitUntil)

        expect(waitUntil).toHaveBeenCalledOnce()
        expect(consoleError).not.toHaveBeenCalled()
    })

    it('logs every resolved incomplete publication delivery.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const waitUntil = vi.fn()

        scheduleBackofficeRealtimePublications({
            operation: 'APP',
            publications: [
                Promise.resolve({
                    complete: false,
                    deliveries: [
                        {
                            accepted: false,
                            code: 'LOCAL_BROKER_UNAVAILABLE',
                            delivery: 'local',
                            error: 'Local broker unavailable.',
                            surface: 'backoffice',
                        },
                        {
                            accepted: false,
                            code: 'CAPABILITY_UNAVAILABLE',
                            delivery: 'remote',
                            surface: 'public',
                        },
                    ],
                    eventId: metadata.eventId,
                } satisfies TBackofficeRealtimePublicationResult),
            ],
            waitUntil,
        })
        await flush(waitUntil)

        expect(
            consoleError.mock.calls.map(([entry]) => JSON.parse(String(entry))),
        ).toEqual([
            {
                code: 'LOCAL_BROKER_UNAVAILABLE',
                delivery: 'local',
                destination: 'backoffice',
                message: 'Local broker unavailable.',
                metric: 'realtime.publish.failure',
                operation: 'APP',
                type: 'REALTIME_PUBLISH_ERROR',
            },
            {
                code: 'CAPABILITY_UNAVAILABLE',
                delivery: 'remote',
                destination: 'public',
                metric: 'realtime.publish.failure',
                operation: 'APP',
                type: 'REALTIME_PUBLISH_ERROR',
            },
        ])
    })

    it('keeps rejected publications best effort when waitUntil is unavailable.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const waitUntil = vi.fn(() => {
            throw new Error('Execution context unavailable.')
        })

        expect(() =>
            scheduleBackofficeRealtimePublications({
                operation: 'GAME',
                publications: [
                    Promise.reject(new Error('Unexpected publisher failure.')),
                ],
                waitUntil,
            }),
        ).not.toThrow()
        await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce())

        expect(
            JSON.parse(String(consoleError.mock.calls[0]?.[0])),
        ).toMatchObject({
            code: 'PROMISE_REJECTED',
            delivery: 'unknown',
            destination: 'unknown',
            message: 'Unexpected publisher failure.',
            metric: 'realtime.publish.failure',
            name: 'Error',
            operation: 'GAME',
            type: 'REALTIME_PUBLISH_ERROR',
        })
    })

    it('serializes rejected reasons without letting them replace the event code.', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined)
        const waitUntil = vi.fn()

        scheduleBackofficeRealtimePublications({
            operation: 'GAME',
            publications: [
                Promise.reject(
                    Object.assign(
                        new Error(
                            'Write failed postgres://user:PRIVATE_PASSWORD@db.internal/app',
                        ),
                        {
                            code: '23505',
                            name: 'PostgresError',
                            type: 'PRIVATE_TYPE',
                        },
                    ),
                ),
                Promise.reject('Bearer PRIVATE_TOKEN'),
            ],
            waitUntil,
        })
        await flush(waitUntil)

        const entries = consoleError.mock.calls.map(([entry]) =>
            JSON.parse(String(entry)),
        )
        expect(entries).toEqual([
            expect.objectContaining({
                code: 'PROMISE_REJECTED',
                message: 'Write failed postgres://<redacted>@db.internal/app',
                metric: 'realtime.publish.failure',
                name: 'PostgresError',
                type: 'REALTIME_PUBLISH_ERROR',
            }),
            expect.objectContaining({
                code: 'PROMISE_REJECTED',
                message: 'Bearer <redacted>',
                name: 'UnknownThrownValue',
                type: 'REALTIME_PUBLISH_ERROR',
            }),
        ])
        expect(JSON.stringify(entries)).not.toContain('PRIVATE_')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
