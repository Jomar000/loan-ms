import { dbClient, dbSchema } from '@loanms/database/d1'
import type { TApiResponseError } from '@loanms/types/shared'
import {
    parseRealtimeServerFrame,
    REALTIME_WIRE_VERSION,
} from '@loanms/websocket/protocol'
import {
    builtInRealtimeRegistry,
    createRealtimeRegistry,
    defineRealtimeEvent,
    defineRealtimeStream,
    type TRealtimeRegistry,
} from '@loanms/websocket/registry'
import {
    setRealtimeTransportHeaders,
    type TBrokerPublishResult,
    type TBrokerRealtimePublishInput,
    type TBrokerRealtimeRevocationInput,
    type TBrokerRealtimeRevocationResult,
    type TRealtimeLeafDeliveryResult,
    type TRealtimeLeafRevocationInput,
    type TRealtimeLeafRevocationResult,
} from '@loanms/websocket/server'
import {
    createRealtimeBrokerObjectName,
    createRealtimeLeafObjectName,
    createRealtimeLeafProbeOrder,
    isRealtimeTransportAttachment,
    WS_LEAF_COUNT,
    type TRealtimeBrokerScope,
    type TRealtimeLeafScope,
    type TRealtimeTransportAttachment,
} from '@loanms/websocket/transport'
import { evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import app from '../../src/core/index.js'
import { recoverPublicRealtimeRevocations } from '../../src/services/realtime/authorization.js'
import {
    seedTestingCookies,
    TEST_OWNER_USER_ID,
    TEST_PRIMARY_ORGANIZATION_ID,
} from '../utilities.js'

let privilegedCookie: string
let standardCookie: string
let administratorCookie: string

const TEST_ORGANIZATION_ID = 'TESTWebSocketTransportOrganization'

const fetchRealtimeSocket = (attachment: TRealtimeTransportAttachment) => {
    const headers = new Headers({
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': REALTIME_WIRE_VERSION,
    })

    setRealtimeTransportHeaders(headers, attachment)

    return env.LOANMSPUB_DO_WSS.getByName(
        createRealtimeLeafObjectName(attachment, attachment.shardIndex),
    ).fetch(new Request('https://internal.test/api/ws/app', { headers }))
}

const waitForMessage = (socket: WebSocket) =>
    new Promise<string>((resolve) => {
        socket.addEventListener(
            'message',
            (event) => resolve(String(event.data)),
            { once: true },
        )
    })

const waitForClose = (socket: WebSocket) =>
    new Promise<CloseEvent>((resolve) => {
        socket.addEventListener('close', resolve, { once: true })
    })

type TRealtimeBrokerTestHarness = {
    createRealtimeTargets(scope: TRealtimeBrokerScope): Array<{
        objectName: string
        stub: {
            deliverRealtimeFrame(
                serializedFrame: string,
                frameBytes: number,
                audience: TBrokerRealtimePublishInput['audience'],
                scope: TRealtimeLeafScope,
                target: string | null,
                revocations?: readonly TRealtimeLeafRevocationInput[],
            ): Promise<TRealtimeLeafDeliveryResult>
        }
    }>
    getFanOutConcurrency(): number
    getFanOutDeadlineMs(): number
    getRealtimeRegistry(): TRealtimeRegistry
    getPublicationBurst(): number
    getPublicationRatePerSecond(): number
    publishRealtime(
        input: TBrokerRealtimePublishInput,
    ): Promise<TBrokerPublishResult>
    revokeRealtimeAuthorization(
        input: TBrokerRealtimeRevocationInput,
    ): Promise<TBrokerRealtimeRevocationResult>
    alarm(): Promise<void>
}

type TRealtimeLeafTestHarness = {
    fetch(request: Request): Promise<Response>
    getLeafSoftCap(): number
    getRealtimeRegistry(): TRealtimeRegistry
    getSocketBufferedAmount(socket: WebSocket): number
}

beforeAll(async () => {
    ;[
        privilegedCookie,
        standardCookie,
        administratorCookie,
    ] = await seedTestingCookies()
})

describe('WebSocket Endpoint', () => {
    describe('Realtime-v1 substrate', () => {
        it('requires both a WebSocket upgrade and wire-version negotiation.', async () => {
            const missingUpgrade = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )
            const missingUpgradeData =
                await missingUpgrade.json<TApiResponseError>()
            const missingProtocol = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                    },
                },
                env,
            )
            const missingProtocolData =
                await missingProtocol.json<TApiResponseError>()

            expect(missingUpgrade.status).toBe(426)
            expect(missingUpgradeData.error.code).toBe(
                'WEBSOCKET_UPGRADE_REQUIRED',
            )
            expect(missingProtocol.status).toBe(426)
            expect(missingProtocolData.error.code).toBe(
                'WEBSOCKET_PROTOCOL_REQUIRED',
            )
        })

        it('returns READY and negotiates the registered wire version.', async () => {
            const realtimeResponse = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            expect(realtimeResponse.status).toBe(101)
            expect(realtimeResponse.headers.get('Sec-WebSocket-Protocol')).toBe(
                REALTIME_WIRE_VERSION,
            )

            const realtimeSocket = realtimeResponse.webSocket as WebSocket
            const readyMessage = waitForMessage(realtimeSocket)
            realtimeSocket.accept()

            try {
                const parsedReady = parseRealtimeServerFrame(
                    builtInRealtimeRegistry,
                    await readyMessage,
                )

                expect(parsedReady).toMatchObject({
                    success: true,
                    data: {
                        wireVersion: 'realtime.events.v1',
                        stream: 'APP',
                        type: 'READY',
                    },
                })
            } finally {
                realtimeSocket.close(1000, 'Test complete.')
            }
        })

        it('rejects browser application frames with policy code 1008.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            expect(response.status).toBe(101)

            const socket = response.webSocket as WebSocket
            socket.accept()
            const close = waitForClose(socket)
            socket.send('{"command":"forbidden"}')

            await expect(close).resolves.toMatchObject({
                code: 1008,
                reason: 'Application commands require HTTP.',
            })
        })

        it('rejects unknown dedicated streams before Durable Object admission.', async () => {
            const response = await app.request(
                '/api/ws/UNKNOWN/target',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )
            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(404)
            expect(responseData.error.code).toBe('REALTIME_UNKNOWN_STREAM')
        })

        it('sequences only organization broadcasts and preserves canonical bytes.', async () => {
            const registry = createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: [
                            'identity',
                            'organization',
                        ],
                        delivery: 'organization',
                        payloadSchema: z.object({
                            value: z.number().int(),
                        }),
                    }),
                },
            })
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}RealtimeSequence`,
                stream: 'APP',
                surface: 'public',
            }
            const brokerStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const deliveredFrames: Array<{
                audience: TBrokerRealtimePublishInput['audience']
                frameBytes: number
                serializedFrame: string
            }> = []
            const result = await runInDurableObject(
                brokerStub,
                async (instance) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [
                        {
                            objectName: 'TESTRealtimeTarget',
                            stub: {
                                deliverRealtimeFrame: async (
                                    serializedFrame,
                                    frameBytes,
                                    audience,
                                ) => {
                                    deliveredFrames.push({
                                        audience,
                                        frameBytes,
                                        serializedFrame,
                                    })

                                    return {
                                        deliveredCount: 1,
                                        expiredSocketCount: 0,
                                        revokedSocketCount: 0,
                                        sendFailureCount: 0,
                                        slowSocketCount: 0,
                                    }
                                },
                            },
                        },
                    ]

                    const createInput = (
                        eventId: string,
                        audience: TBrokerRealtimePublishInput['audience'],
                        value: number,
                    ): TBrokerRealtimePublishInput => ({
                        audience,
                        event: 'APP_UPDATED',
                        eventId,
                        occurredAt: '2026-07-27T12:00:00.000+08:00',
                        payload: { value },
                        scope,
                        target: null,
                    })

                    return Promise.all([
                        broker.publishRealtime(
                            createInput(
                                '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                                { kind: 'organization' },
                                1,
                            ),
                        ),
                        broker.publishRealtime(
                            createInput(
                                '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                                {
                                    kind: 'identity',
                                    identityIds: ['identity-a'],
                                },
                                2,
                            ),
                        ),
                        broker.publishRealtime(
                            createInput(
                                '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                                { kind: 'organization' },
                                3,
                            ),
                        ),
                    ])
                },
            )

            expect(result).toEqual([
                expect.objectContaining({ accepted: true }),
                expect.objectContaining({ accepted: true }),
                expect.objectContaining({ accepted: true }),
            ])
            expect(
                deliveredFrames.map(({ serializedFrame }) => {
                    const frame = JSON.parse(serializedFrame) as {
                        sequence?: string
                    }

                    return frame.sequence
                }),
            ).toEqual([
                '1',
                undefined,
                '2',
            ])
            deliveredFrames.forEach(({ frameBytes, serializedFrame }) => {
                expect(
                    new TextEncoder().encode(serializedFrame).byteLength,
                ).toBe(frameBytes)
                expect(
                    parseRealtimeServerFrame(registry, serializedFrame),
                ).toMatchObject({ success: true })
            })
        })

        it('uses canonical broker inputs without mutating RPC callers.', async () => {
            const registry = createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: z.object({
                            label: z.string().trim(),
                        }),
                    }),
                },
            })
            const scope: TRealtimeBrokerScope = {
                organizationId: `${TEST_ORGANIZATION_ID}CanonicalBrokerInput`,
                stream: 'APP',
                surface: 'public',
                storageVersion: 1,
            }
            const rawInput = {
                audience: {
                    kind: 'organization',
                    unexpectedAudienceProperty: true,
                },
                event: 'APP_UPDATED',
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                occurredAt: '2026-07-27T12:00:00.000+08:00',
                payload: {
                    label: ' ready ',
                    unexpectedPayloadProperty: true,
                },
                scope: {
                    ...scope,
                    unexpectedScopeProperty: true,
                },
                target: null,
                unexpectedInputProperty: true,
            }
            const originalInput = structuredClone(rawInput)
            const forwarded: Array<{
                audience: unknown
                scope: unknown
                serializedFrame: string
            }> = []
            const brokerStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const outcome = await runInDurableObject(
                brokerStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [
                        {
                            objectName: 'TESTCanonicalBrokerTarget',
                            stub: {
                                deliverRealtimeFrame: async (
                                    serializedFrame,
                                    _frameBytes,
                                    audience,
                                    leafScope,
                                ) => {
                                    forwarded.push({
                                        audience,
                                        scope: leafScope,
                                        serializedFrame,
                                    })

                                    return {
                                        deliveredCount: 1,
                                        expiredSocketCount: 0,
                                        revokedSocketCount: 0,
                                        sendFailureCount: 0,
                                        slowSocketCount: 0,
                                    }
                                },
                            },
                        },
                    ]

                    const result = await broker.publishRealtime(
                        rawInput as unknown as TBrokerRealtimePublishInput,
                    )

                    return {
                        result,
                        storedScope: await state.storage.get('scope'),
                    }
                },
            )

            expect(rawInput).toEqual(originalInput)
            expect(outcome).toEqual({
                result: {
                    accepted: true,
                    deliveredCount: 1,
                    failedTargetCount: 0,
                    successfulTargetCount: 1,
                },
                storedScope: scope,
            })
            expect(forwarded).toEqual([
                {
                    audience: { kind: 'organization' },
                    scope: {
                        ...scope,
                        shardIndex: 0,
                        topology: 'leaf',
                    },
                    serializedFrame: expect.any(String),
                },
            ])
            expect(JSON.parse(forwarded[0]!.serializedFrame)).toEqual({
                event: 'APP_UPDATED',
                eventId: rawInput.eventId,
                occurredAt: rawInput.occurredAt,
                payload: { label: 'ready' },
                sequence: '1',
                stream: 'APP',
                type: 'EVENT',
            })
        })

        it('allows an application broker to override publication capacity.', async () => {
            const registry = createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: z.string(),
                    }),
                },
            })
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}RealtimeConfiguredRate`,
                stream: 'APP',
                surface: 'public',
            }
            const stub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const results = await runInDurableObject(stub, async (instance) => {
                const broker = instance as unknown as TRealtimeBrokerTestHarness
                broker.getFanOutConcurrency = () => 1
                broker.getFanOutDeadlineMs = () => 1000
                broker.getPublicationBurst = () => 6
                broker.getPublicationRatePerSecond = () => 0
                broker.getRealtimeRegistry = () => registry
                broker.createRealtimeTargets = () => [
                    {
                        objectName: 'TESTRealtimeConfiguredRateTarget',
                        stub: {
                            deliverRealtimeFrame: async () => ({
                                deliveredCount: 0,
                                expiredSocketCount: 0,
                                revokedSocketCount: 0,
                                sendFailureCount: 0,
                                slowSocketCount: 0,
                            }),
                        },
                    },
                ]

                return Promise.all(
                    Array.from({ length: 6 }, (_, index) =>
                        broker.publishRealtime({
                            audience: { kind: 'organization' },
                            event: 'APP_UPDATED',
                            eventId: `0198ef86-e6ab-7da4-98d3-57e3101779e${index + 4}`,
                            occurredAt: '2026-07-27T12:00:00.000+08:00',
                            payload: 'ready',
                            scope,
                            target: null,
                        }),
                    ),
                )
            })

            expect(results).toEqual(
                Array.from({ length: 6 }, () =>
                    expect.objectContaining({ accepted: true }),
                ),
            )
        })

        it('fails unavailable for invalid broker overrides without writing rate state.', async () => {
            const registry = createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: z.string(),
                    }),
                },
            })
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}InvalidBrokerOverrides`,
                stream: 'APP',
                surface: 'public',
            }
            const stub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const outcome = await runInDurableObject(
                stub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    let leafCallCount = 0
                    const publish = (eventId: string) =>
                        broker.publishRealtime({
                            audience: { kind: 'organization' },
                            event: 'APP_UPDATED',
                            eventId,
                            occurredAt: '2026-07-27T12:00:00.000+08:00',
                            payload: 'ready',
                            scope,
                            target: null,
                        })

                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [
                        {
                            objectName: 'TESTInvalidBrokerOverrideTarget',
                            stub: {
                                deliverRealtimeFrame: async () => {
                                    leafCallCount += 1

                                    return {
                                        deliveredCount: 0,
                                        expiredSocketCount: 0,
                                        revokedSocketCount: 0,
                                        sendFailureCount: 0,
                                        slowSocketCount: 0,
                                    }
                                },
                            },
                        },
                    ]

                    broker.getPublicationBurst = () => Number.NaN
                    const invalidBurst = await publish(
                        '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                    )
                    broker.getPublicationBurst = () => 5
                    broker.getPublicationRatePerSecond = () =>
                        Number.POSITIVE_INFINITY
                    const invalidRate = await publish(
                        '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                    )
                    broker.getPublicationRatePerSecond = () => 2
                    broker.getFanOutConcurrency = () => Number.NaN
                    const invalidConcurrency = await publish(
                        '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                    )
                    broker.getFanOutConcurrency = () => 1
                    broker.getFanOutDeadlineMs = () => Number.POSITIVE_INFINITY
                    const invalidDeadline = await publish(
                        '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                    )

                    return {
                        invalidBurst,
                        invalidConcurrency,
                        invalidDeadline,
                        invalidRate,
                        leafCallCount,
                        rateState: await state.storage.get(
                            'realtimeServerBucket',
                        ),
                    }
                },
            )

            expect(outcome).toEqual({
                invalidBurst: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                invalidConcurrency: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                invalidDeadline: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                invalidRate: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                leafCallCount: 0,
                rateState: undefined,
            })
        })

        it('rate-limits broker publications and preserves an oversized sequence gap.', async () => {
            let payloadValidationCount = 0
            const registry = createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: z.preprocess((value) => {
                            payloadValidationCount += 1
                            return value
                        }, z.string()),
                    }),
                },
            })
            const rateScope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}RealtimeRate`,
                stream: 'APP',
                surface: 'public',
            }
            const rateStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(rateScope),
            )
            const rateResults = await runInDurableObject(
                rateStub,
                async (instance) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [
                        {
                            objectName: 'TESTRealtimeRateTarget',
                            stub: {
                                deliverRealtimeFrame: async () => ({
                                    deliveredCount: 0,
                                    expiredSocketCount: 0,
                                    revokedSocketCount: 0,
                                    sendFailureCount: 0,
                                    slowSocketCount: 0,
                                }),
                            },
                        },
                    ]

                    return Promise.all(
                        Array.from({ length: 6 }, (_, index) =>
                            broker.publishRealtime({
                                audience: { kind: 'organization' },
                                event: 'APP_UPDATED',
                                eventId: `0198ef86-e6ab-7da4-98d3-57e3101779e${index + 4}`,
                                occurredAt: '2026-07-27T12:00:00.000+08:00',
                                payload: 'ready',
                                scope: rateScope,
                                target: null,
                            }),
                        ),
                    )
                },
            )

            expect(rateResults.slice(0, 5)).toEqual(
                Array.from({ length: 5 }, () =>
                    expect.objectContaining({ accepted: true }),
                ),
            )
            expect(rateResults[5]).toEqual({
                accepted: false,
                code: 'RATE_LIMITED',
            })
            expect(payloadValidationCount).toBe(6)

            const sequenceScope: TRealtimeBrokerScope = {
                ...rateScope,
                organizationId: `${TEST_ORGANIZATION_ID}RealtimeOversize`,
            }
            const sequenceStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(sequenceScope),
            )
            const deliveredFrames: string[] = []
            const sequenceResults = await runInDurableObject(
                sequenceStub,
                async (instance) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [
                        {
                            objectName: 'TESTRealtimeOversizeTarget',
                            stub: {
                                deliverRealtimeFrame: async (
                                    serializedFrame,
                                ) => {
                                    deliveredFrames.push(serializedFrame)
                                    return {
                                        deliveredCount: 0,
                                        expiredSocketCount: 0,
                                        revokedSocketCount: 0,
                                        sendFailureCount: 0,
                                        slowSocketCount: 0,
                                    }
                                },
                            },
                        },
                    ]
                    const publish = (eventId: string, payload: string) =>
                        broker.publishRealtime({
                            audience: { kind: 'organization' },
                            event: 'APP_UPDATED',
                            eventId,
                            occurredAt: '2026-07-27T12:00:00.000+08:00',
                            payload,
                            scope: sequenceScope,
                            target: null,
                        })

                    return [
                        await publish(
                            '0198ef86-e6ab-7da4-98d3-57e3101779ea',
                            'x'.repeat(8192),
                        ),
                        await publish(
                            '0198ef86-e6ab-7da4-98d3-57e3101779eb',
                            'ready',
                        ),
                    ]
                },
            )

            expect(sequenceResults[0]).toEqual({
                accepted: false,
                code: 'FRAME_TOO_LARGE',
            })
            expect(sequenceResults[1]).toMatchObject({ accepted: true })
            expect(JSON.parse(deliveredFrames[0] ?? '{}')).toMatchObject({
                sequence: '2',
            })
            expect(payloadValidationCount).toBe(8)
        })

        it('fails closed for corrupt broker state and bounds corrupt rate state.', async () => {
            const registry = createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: z.string(),
                    }),
                },
            })
            const publish = (
                broker: TRealtimeBrokerTestHarness,
                scope: TRealtimeBrokerScope,
                eventId: string,
            ) =>
                broker.publishRealtime({
                    audience: { kind: 'organization' },
                    event: 'APP_UPDATED',
                    eventId,
                    occurredAt: '2026-07-27T12:00:00.000+08:00',
                    payload: 'ready',
                    scope,
                    target: null,
                })
            const createTarget = () => ({
                objectName: 'TESTRealtimeStorageTarget',
                stub: {
                    deliverRealtimeFrame: async () => ({
                        deliveredCount: 0,
                        expiredSocketCount: 0,
                        revokedSocketCount: 0,
                        sendFailureCount: 0,
                        slowSocketCount: 0,
                    }),
                },
            })
            const sequenceScope: TRealtimeBrokerScope = {
                organizationId: `${TEST_ORGANIZATION_ID}InvalidSequence`,
                stream: 'APP',
                surface: 'public',
                storageVersion: 1,
            }
            const sequenceStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(sequenceScope),
            )
            const sequenceResult = await runInDurableObject(
                sequenceStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [createTarget()]
                    await state.storage.put(
                        'realtimeSequence',
                        'invalid-sequence',
                    )

                    const result = await publish(
                        broker,
                        sequenceScope,
                        '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                    )

                    return {
                        result,
                        storedSequence:
                            await state.storage.get('realtimeSequence'),
                    }
                },
            )

            expect(sequenceResult).toEqual({
                result: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                storedSequence: 'invalid-sequence',
            })

            const scope: TRealtimeBrokerScope = {
                ...sequenceScope,
                organizationId: `${TEST_ORGANIZATION_ID}InvalidScope`,
            }
            const scopeStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const scopeResult = await runInDurableObject(
                scopeStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [createTarget()]
                    const invalidScope = {
                        organizationId: scope.organizationId,
                        stream: 'app',
                        surface: scope.surface,
                        storageVersion: 1,
                    }
                    await state.storage.put('scope', invalidScope)

                    const result = await publish(
                        broker,
                        scope,
                        '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                    )

                    return {
                        result,
                        storedScope: await state.storage.get('scope'),
                    }
                },
            )

            expect(scopeResult).toEqual({
                result: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                storedScope: {
                    organizationId: scope.organizationId,
                    stream: 'app',
                    surface: 'public',
                    storageVersion: 1,
                },
            })

            const malformedResultScope: TRealtimeBrokerScope = {
                ...sequenceScope,
                organizationId: `${TEST_ORGANIZATION_ID}InvalidRpcResult`,
            }
            const malformedResultStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(malformedResultScope),
            )
            const malformedResult = await runInDurableObject(
                malformedResultStub,
                async (instance) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [
                        {
                            objectName: 'TESTRealtimeMalformedResultTarget',
                            stub: {
                                deliverRealtimeFrame: async () =>
                                    ({
                                        deliveredCount: 'invalid',
                                    }) as unknown as TRealtimeLeafDeliveryResult,
                            },
                        },
                    ]

                    return publish(
                        broker,
                        malformedResultScope,
                        '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                    )
                },
            )

            expect(malformedResult).toEqual({
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
            })

            const bucketScope: TRealtimeBrokerScope = {
                ...sequenceScope,
                organizationId: `${TEST_ORGANIZATION_ID}InvalidBucket`,
            }
            const bucketStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(bucketScope),
            )
            const bucketResult = await runInDurableObject(
                bucketStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [createTarget()]
                    await state.storage.put('realtimeServerBucket', {
                        refilledAt: 'invalid',
                        tokens: Number.POSITIVE_INFINITY,
                    })

                    const result = await publish(
                        broker,
                        bucketScope,
                        '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                    )

                    return {
                        result,
                        storedBucket: await state.storage.get(
                            'realtimeServerBucket',
                        ),
                    }
                },
            )

            expect(bucketResult).toEqual({
                result: expect.objectContaining({ accepted: true }),
                storedBucket: {
                    refilledAt: expect.any(Number),
                    tokens: 4,
                },
            })

            const revocationScope: TRealtimeBrokerScope = {
                ...sequenceScope,
                organizationId: `${TEST_ORGANIZATION_ID}InvalidRevocation`,
            }
            const revocationStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(revocationScope),
            )
            const corruptRevocation = { invalid: true }
            const corruptRevocationKey =
                'realtimeRevocation:0198ef86-e6ab-7da4-98d3-57e3101779e8'
            const revocationResult = await runInDurableObject(
                revocationStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    broker.getRealtimeRegistry = () => registry
                    broker.createRealtimeTargets = () => [createTarget()]
                    await state.storage.put(
                        corruptRevocationKey,
                        corruptRevocation,
                    )

                    const result = await publish(
                        broker,
                        revocationScope,
                        '0198ef86-e6ab-7da4-98d3-57e3101779e8',
                    )

                    return {
                        result,
                        storedRevocation:
                            await state.storage.get(corruptRevocationKey),
                    }
                },
            )

            expect(revocationResult).toEqual({
                result: {
                    accepted: false,
                    code: 'FANOUT_UNAVAILABLE',
                },
                storedRevocation: corruptRevocation,
            })
        })

        it('restores trusted realtime attachments after Hibernation.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )
            const socket = response.webSocket as WebSocket
            const readyMessage = waitForMessage(socket)
            socket.accept()
            const parsedReady = parseRealtimeServerFrame(
                builtInRealtimeRegistry,
                await readyMessage,
            )

            expect(parsedReady.success).toBe(true)
            if (!parsedReady.success || parsedReady.data.type !== 'READY') {
                throw new Error('Expected a realtime READY frame.')
            }

            const connectionId = parsedReady.data.connectionId
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                stream: 'APP',
                surface: 'public',
            }
            const shardIndex = createRealtimeLeafProbeOrder(
                scope,
                connectionId,
            )[0]
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(scope, shardIndex),
            )

            await evictDurableObject(stub)

            const attachment = await runInDurableObject(
                stub,
                (_instance, state) => {
                    const restoredSocket = state
                        .getWebSockets()
                        .find((candidate) => {
                            const candidateAttachment =
                                candidate.deserializeAttachment()

                            return (
                                isRealtimeTransportAttachment(
                                    candidateAttachment,
                                ) &&
                                candidateAttachment.connectionId ===
                                    connectionId
                            )
                        })

                    return restoredSocket?.deserializeAttachment()
                },
            )

            expect(attachment).toMatchObject({
                storageVersion: 1,
                topology: 'leaf',
                surface: 'public',
                organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                stream: 'APP',
                shardIndex,
                connectionId,
                wireVersion: REALTIME_WIRE_VERSION,
                target: null,
            })

            const close = waitForClose(socket)
            socket.send('{"command":"still-forbidden"}')
            await expect(close).resolves.toMatchObject({ code: 1008 })
        })

        it('fails leaf admission closed for an invalid capacity override.', async () => {
            const scope: TRealtimeLeafScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}InvalidLeafOverride`,
                shardIndex: 9,
                stream: 'APP',
                surface: 'public',
                topology: 'leaf',
            }
            const attachment: TRealtimeTransportAttachment = {
                ...scope,
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                identityId: 'TESTInvalidLeafOverrideIdentity',
                wireVersion: REALTIME_WIRE_VERSION,
                roles: ['member'],
                sessionExpiresAt: Date.now() + 60_000,
                target: null,
            }
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(scope, scope.shardIndex),
            )
            const outcome = await runInDurableObject(
                stub,
                async (instance, state) => {
                    const leaf = instance as unknown as TRealtimeLeafTestHarness
                    const headers = new Headers({
                        Upgrade: 'websocket',
                        'Sec-WebSocket-Protocol': REALTIME_WIRE_VERSION,
                    })

                    setRealtimeTransportHeaders(headers, attachment)
                    leaf.getLeafSoftCap = () => Number.NaN

                    const response = await leaf.fetch(
                        new Request('https://internal.test/api/ws/app', {
                            headers,
                        }),
                    )

                    return {
                        admission: response.headers.get('X-WS-Admission'),
                        socketCount: state.getWebSockets().length,
                        status: response.status,
                    }
                },
            )

            expect(outcome).toEqual({
                admission: 'full',
                socketCount: 0,
                status: 503,
            })
        })

        it('closes a hibernated attachment that no longer matches its immutable leaf scope.', async () => {
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}ScopeIsolation`,
                stream: 'APP',
                surface: 'public',
            }
            const attachment: TRealtimeTransportAttachment = {
                ...scope,
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                identityId: 'TESTRealtimeScopeIdentity',
                wireVersion: REALTIME_WIRE_VERSION,
                roles: ['member'],
                sessionExpiresAt: Date.now() + 60_000,
                shardIndex: 7,
                target: null,
                topology: 'leaf',
            }
            const response = await fetchRealtimeSocket(attachment)
            const socket = response.webSocket as WebSocket
            socket.accept()
            const close = waitForClose(socket)
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(scope, attachment.shardIndex),
            )

            await evictDurableObject(stub)
            await runInDurableObject(stub, (_instance, state) => {
                const restoredSocket = state.getWebSockets()[0]
                const restoredAttachment =
                    restoredSocket?.deserializeAttachment()

                if (
                    !restoredSocket ||
                    !isRealtimeTransportAttachment(restoredAttachment)
                ) {
                    throw new Error('Expected a restored realtime socket.')
                }

                restoredSocket.serializeAttachment({
                    ...restoredAttachment,
                    organizationId: 'TESTDifferentOrganization',
                })
            })
            const result = await stub.deliverRealtimeFrame(
                '{}',
                2,
                { kind: 'organization' },
                attachment,
                null,
            )

            expect(result).toMatchObject({
                deliveredCount: 0,
                revokedSocketCount: 1,
            })
            await expect(close).resolves.toMatchObject({
                code: 1008,
                reason: 'Realtime authorization refresh required.',
            })
        })

        it('composes dedicated-target and multi-role delivery filters.', async () => {
            const registry = createRealtimeRegistry({
                streams: [
                    defineRealtimeStream({
                        authorizationPolicy: 'synthetic_member',
                        events: {
                            SYNTHETIC_UPDATED: defineRealtimeEvent({
                                audiences: ['role'],
                                delivery: 'target',
                                payloadSchema: z.object({
                                    value: z.number(),
                                }),
                            }),
                        },
                        idleRetentionMs: 0,
                        kind: 'dedicated',
                        metricsLabel: 'synthetic',
                        recoveryPolicy: 'synthetic_queries',
                        targetSchema: z.string(),
                        wireName: 'SYNTHETIC',
                    }),
                ],
            })
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}TargetRole`,
                stream: 'SYNTHETIC',
                surface: 'public',
            }
            const leafScope = {
                ...scope,
                shardIndex: 11,
                topology: 'leaf' as const,
            }
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(scope, leafScope.shardIndex),
            )

            await runInDurableObject(stub, (instance) => {
                ;(
                    instance as unknown as {
                        getRealtimeRegistry: () => TRealtimeRegistry
                    }
                ).getRealtimeRegistry = () => registry
            })

            const connect = async (
                connectionId: string,
                roles: string[],
                target: string,
            ) => {
                const response = await fetchRealtimeSocket({
                    ...leafScope,
                    authorizationVersion:
                        '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                    connectionId,
                    identityId: connectionId,
                    wireVersion: REALTIME_WIRE_VERSION,
                    roles,
                    sessionExpiresAt: Date.now() + 60_000,
                    target,
                })
                const socket = response.webSocket as WebSocket
                const ready = waitForMessage(socket)
                socket.accept()
                await ready
                return socket
            }
            const matchingSocket = await connect(
                '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                [
                    'member',
                    'operator',
                ],
                'TARGET-A',
            )
            const wrongRoleSocket = await connect(
                '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                ['viewer'],
                'TARGET-A',
            )
            const wrongTargetSocket = await connect(
                '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                ['operator'],
                'TARGET-B',
            )
            const frame = JSON.stringify({
                event: 'SYNTHETIC_UPDATED',
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e8',
                occurredAt: '2026-07-27T12:00:00.000+08:00',
                payload: { value: 1 },
                stream: 'SYNTHETIC',
                target: 'TARGET-A',
                type: 'EVENT',
            })
            const matchingMessage = waitForMessage(matchingSocket)
            const result = await stub.deliverRealtimeFrame(
                frame,
                new TextEncoder().encode(frame).byteLength,
                { kind: 'role', roles: ['operator'] },
                leafScope,
                'TARGET-A',
            )

            expect(result).toMatchObject({ deliveredCount: 1 })
            await expect(matchingMessage).resolves.toBe(frame)
            matchingSocket.close(1000, 'Test complete.')
            wrongRoleSocket.close(1000, 'Test complete.')
            wrongTargetSocket.close(1000, 'Test complete.')
        })

        it('combines multiple revocations with delivery filtering and exact counters in one leaf pass.', async () => {
            const registry = createRealtimeRegistry({
                streams: [
                    defineRealtimeStream({
                        authorizationPolicy: 'synthetic_member',
                        events: {},
                        idleRetentionMs: 0,
                        kind: 'dedicated',
                        metricsLabel: 'synthetic',
                        recoveryPolicy: 'synthetic_queries',
                        targetSchema: z.string(),
                        wireName: 'SYNTHETIC',
                    }),
                ],
            })
            const scope: TRealtimeLeafScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}RevocationDeliveryPass`,
                shardIndex: 23,
                stream: 'SYNTHETIC',
                surface: 'public',
                topology: 'leaf',
            }
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(scope, scope.shardIndex),
            )

            await runInDurableObject(stub, (instance) => {
                ;(
                    instance as unknown as TRealtimeLeafTestHarness
                ).getRealtimeRegistry = () => registry
            })

            const connect = async (input: {
                authorizationVersion: string
                connectionId: string
                identityId: string
                roles: string[]
                target: string
            }) => {
                const response = await fetchRealtimeSocket({
                    ...scope,
                    ...input,
                    wireVersion: REALTIME_WIRE_VERSION,
                    sessionExpiresAt: Date.now() + 60_000,
                })
                const client = response.webSocket as WebSocket
                const ready = waitForMessage(client)
                client.accept()
                await ready

                return client
            }
            const activeAuthorizationVersion =
                '0198ef86-e6ab-7da4-98d3-57e3101779a4'
            const expiredAuthorizationVersion =
                '0198ef86-e6ab-7da4-98d3-57e3101779a5'
            const otherAuthorizationVersion =
                '0198ef86-e6ab-7da4-98d3-57e3101779a6'
            const clients = {
                corrupt: await connect({
                    authorizationVersion: otherAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779b4',
                    identityId: 'TESTPhase3CorruptIdentity',
                    roles: ['operator'],
                    target: 'TARGET-A',
                }),
                delivered: await connect({
                    authorizationVersion: otherAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779b5',
                    identityId: 'TESTPhase3DeliveredIdentity',
                    roles: ['operator'],
                    target: 'TARGET-A',
                }),
                expiredRevocation: await connect({
                    authorizationVersion: expiredAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779b6',
                    identityId: 'TESTPhase3ExpiredRevocationIdentity',
                    roles: ['operator'],
                    target: 'TARGET-A',
                }),
                expiredSession: await connect({
                    authorizationVersion: otherAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779b7',
                    identityId: 'TESTPhase3ExpiredSessionIdentity',
                    roles: ['operator'],
                    target: 'TARGET-A',
                }),
                revoked: await connect({
                    authorizationVersion: activeAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779b8',
                    identityId: 'TESTPhase3RevokedIdentity',
                    roles: ['operator'],
                    target: 'TARGET-A',
                }),
                slow: await connect({
                    authorizationVersion: otherAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779b9',
                    identityId: 'TESTPhase3SlowIdentity',
                    roles: ['operator'],
                    target: 'TARGET-A',
                }),
                wrongRole: await connect({
                    authorizationVersion: otherAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779ba',
                    identityId: 'TESTPhase3WrongRoleIdentity',
                    roles: ['viewer'],
                    target: 'TARGET-A',
                }),
                wrongTarget: await connect({
                    authorizationVersion: otherAuthorizationVersion,
                    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779bb',
                    identityId: 'TESTPhase3WrongTargetIdentity',
                    roles: ['operator'],
                    target: 'TARGET-B',
                }),
            }
            const closeEvents = {
                corrupt: waitForClose(clients.corrupt),
                expiredRevocation: waitForClose(clients.expiredRevocation),
                expiredSession: waitForClose(clients.expiredSession),
                revoked: waitForClose(clients.revoked),
                slow: waitForClose(clients.slow),
            }
            const activeDirective = {
                authorizationVersion: activeAuthorizationVersion,
                expiresAt: Date.now() + 60_000,
                identityId: 'TESTPhase3RevokedIdentity',
                operationId: '0198ef86-e6ab-7da4-98d3-57e3101779c4',
                organizationId: scope.organizationId,
            }
            const expiredDirective = {
                authorizationVersion: expiredAuthorizationVersion,
                expiresAt: Date.now() - 1,
                identityId: 'TESTPhase3ExpiredRevocationIdentity',
                operationId: '0198ef86-e6ab-7da4-98d3-57e3101779c5',
                organizationId: scope.organizationId,
            }
            const laterDirective = {
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779a7',
                expiresAt: Date.now() + 120_000,
                identityId: 'TESTPhase3LaterRevocationIdentity',
                operationId: '0198ef86-e6ab-7da4-98d3-57e3101779c6',
                organizationId: scope.organizationId,
            }

            await runInDurableObject(stub, (instance, state) => {
                const leaf = instance as unknown as TRealtimeLeafTestHarness
                let slowSocket: WebSocket | undefined

                for (const socket of state.getWebSockets()) {
                    const attachment = socket.deserializeAttachment()

                    if (!isRealtimeTransportAttachment(attachment)) continue

                    if (attachment.identityId === 'TESTPhase3CorruptIdentity') {
                        socket.serializeAttachment({ invalid: true })
                    } else if (
                        attachment.identityId ===
                        'TESTPhase3ExpiredSessionIdentity'
                    ) {
                        socket.serializeAttachment({
                            ...attachment,
                            sessionExpiresAt: Date.now() - 1,
                        })
                    } else if (
                        attachment.identityId === 'TESTPhase3SlowIdentity'
                    ) {
                        slowSocket = socket
                    }
                }

                leaf.getSocketBufferedAmount = (socket) =>
                    socket === slowSocket ? 65_536 : 0
            })

            const frame = '{"phase":3}'
            const deliveredMessage = waitForMessage(clients.delivered)
            const result = await stub.deliverRealtimeFrame(
                frame,
                new TextEncoder().encode(frame).byteLength,
                { kind: 'role', roles: ['operator'] },
                scope,
                'TARGET-A',
                [
                    {
                        directive: activeDirective,
                        scope,
                    },
                    {
                        directive: activeDirective,
                        scope,
                    },
                    {
                        directive: expiredDirective,
                        scope,
                    },
                    {
                        directive: laterDirective,
                        scope,
                    },
                ],
            )

            expect(result).toEqual({
                deliveredCount: 1,
                expiredSocketCount: 1,
                revokedSocketCount: 3,
                sendFailureCount: 0,
                slowSocketCount: 1,
            })
            await expect(deliveredMessage).resolves.toBe(frame)
            await expect(closeEvents.corrupt).resolves.toMatchObject({
                code: 1008,
                reason: 'Realtime authorization refresh required.',
            })
            await expect(closeEvents.expiredRevocation).resolves.toMatchObject({
                code: 1008,
                reason: 'Realtime authorization revoked.',
            })
            await expect(closeEvents.expiredSession).resolves.toMatchObject({
                code: 1008,
                reason: 'Session expired.',
            })
            await expect(closeEvents.revoked).resolves.toMatchObject({
                code: 1008,
                reason: 'Realtime authorization revoked.',
            })
            await expect(closeEvents.slow).resolves.toMatchObject({
                code: 1013,
                reason: 'Client is too slow.',
            })
            expect(clients.wrongRole.readyState).toBe(WebSocket.OPEN)
            expect(clients.wrongTarget.readyState).toBe(WebSocket.OPEN)

            const persisted = await runInDurableObject(
                stub,
                async (_instance, state) => ({
                    active: await state.storage.get(
                        `realtimeRevokedVersion:${encodeURIComponent(
                            activeDirective.identityId,
                        )}:${activeDirective.authorizationVersion}`,
                    ),
                    alarm: await state.storage.getAlarm(),
                    expired: await state.storage.get(
                        `realtimeRevokedVersion:${encodeURIComponent(
                            expiredDirective.identityId,
                        )}:${expiredDirective.authorizationVersion}`,
                    ),
                    later: await state.storage.get(
                        `realtimeRevokedVersion:${encodeURIComponent(
                            laterDirective.identityId,
                        )}:${laterDirective.authorizationVersion}`,
                    ),
                }),
            )

            expect(persisted).toEqual({
                active: activeDirective,
                alarm: activeDirective.expiresAt,
                expired: undefined,
                later: laterDirective,
            })
            clients.delivered.close(1000, 'Test complete.')
            clients.wrongRole.close(1000, 'Test complete.')
            clients.wrongTarget.close(1000, 'Test complete.')
        })

        it('strips unknown revocation properties before persistence.', async () => {
            const scope = {
                organizationId: `${TEST_ORGANIZATION_ID}CanonicalLeafRevocation`,
                shardIndex: 13,
                stream: 'APP',
                surface: 'public',
                topology: 'leaf',
                storageVersion: 1,
            } as const
            const directive = {
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                expiresAt: Date.now() + 60_000,
                identityId: 'TESTCanonicalRevocationIdentity',
                operationId: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                organizationId: scope.organizationId,
            }
            const rawInput = {
                directive: {
                    ...directive,
                    unexpectedDirectiveProperty: true,
                },
                scope: {
                    ...scope,
                    unexpectedScopeProperty: true,
                },
                unexpectedInputProperty: true,
            }
            const originalInput = structuredClone(rawInput)
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(scope, scope.shardIndex),
            )
            const result = await stub.applyRealtimeRevocation(
                rawInput as unknown as TRealtimeLeafRevocationInput,
            )
            const stored = await runInDurableObject(
                stub,
                async (_instance, state) => ({
                    directive: await state.storage.get(
                        `realtimeRevokedVersion:${encodeURIComponent(
                            directive.identityId,
                        )}:${directive.authorizationVersion}`,
                    ),
                    scope: await state.storage.get('scope'),
                }),
            )

            expect(rawInput).toEqual(originalInput)
            expect(result).toEqual({
                closedSocketCount: 0,
                replayed: false,
            })
            expect(stored).toEqual({
                directive,
                scope,
            })
        })

        it('durably revokes only the exact authorization version after Hibernation.', async () => {
            const brokerScope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}VersionedRevocation`,
                stream: 'APP',
                surface: 'public',
            }
            const shardIndex = 17
            const revokedAuthorizationVersion =
                '0198ef86-e6ab-7da4-98d3-57e3101779e4'
            const replacementAuthorizationVersion =
                '0198ef86-e6ab-7da4-98d3-57e3101779e5'
            const baseAttachment = {
                ...brokerScope,
                topology: 'leaf',
                shardIndex,
                identityId: 'TESTRealtimeVersionedIdentity',
                wireVersion: REALTIME_WIRE_VERSION,
                roles: ['member'],
                sessionExpiresAt: Date.now() + 60_000,
                target: null,
            } as const
            const revokedResponse = await fetchRealtimeSocket({
                ...baseAttachment,
                authorizationVersion: revokedAuthorizationVersion,
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779eb',
            })
            const replacementResponse = await fetchRealtimeSocket({
                ...baseAttachment,
                authorizationVersion: replacementAuthorizationVersion,
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779ec',
            })

            expect(revokedResponse.status).toBe(101)
            expect(replacementResponse.status).toBe(101)

            const revokedSocket = revokedResponse.webSocket as WebSocket
            const replacementSocket = replacementResponse.webSocket as WebSocket
            revokedSocket.accept()
            replacementSocket.accept()
            const revokedClose = waitForClose(revokedSocket)
            const stub = env.LOANMSPUB_DO_WSS.getByName(
                createRealtimeLeafObjectName(brokerScope, shardIndex),
            )

            await evictDurableObject(stub)

            const directive = {
                authorizationVersion: revokedAuthorizationVersion,
                expiresAt: Date.now() + 60_000,
                identityId: baseAttachment.identityId,
                operationId: '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                organizationId: brokerScope.organizationId,
            }
            const firstResult = await stub.applyRealtimeRevocation({
                directive,
                scope: baseAttachment,
            })

            expect(firstResult).toMatchObject({
                closedSocketCount: 1,
                replayed: false,
            })
            await expect(revokedClose).resolves.toMatchObject({
                code: 1008,
                reason: 'Realtime authorization revoked.',
            })
            expect(replacementSocket.readyState).toBe(WebSocket.OPEN)

            const replay = await stub.applyRealtimeRevocation({
                directive,
                scope: baseAttachment,
            })
            expect(replay).toMatchObject({
                closedSocketCount: 0,
                replayed: true,
            })

            const staleAdmission = await fetchRealtimeSocket({
                ...baseAttachment,
                authorizationVersion: revokedAuthorizationVersion,
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779ed',
            })

            expect(staleAdmission.status).toBe(403)
            expect(staleAdmission.headers.get('X-WS-Admission')).toBe('revoked')
            replacementSocket.close(1000, 'Test complete.')
        })

        it('durably schedules broker revocations, retries only failed leaves, and preserves completed replay.', async () => {
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}RevocationRetry`,
                stream: 'APP',
                surface: 'public',
            }
            const brokerStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const attempts = Array.from({ length: WS_LEAF_COUNT }, () => 0)
            const input: TBrokerRealtimeRevocationInput = {
                directive: {
                    authorizationVersion:
                        '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                    expiresAt: Date.now() + 120_000,
                    identityId: 'TESTRealtimeRetryIdentity',
                    operationId: '0198ef86-e6ab-7da4-98d3-57e3101779e8',
                    organizationId: scope.organizationId,
                },
                scope,
            }
            const results = await runInDurableObject(
                brokerStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness
                    const initialFanOutStarted = Promise.withResolvers<void>()
                    const releaseInitialFanOut = Promise.withResolvers<void>()
                    let blockInitialFanOut = true

                    broker.createRealtimeTargets = () =>
                        attempts.map((_, shardIndex) => ({
                            objectName: `TESTRevocationLeaf${shardIndex}`,
                            stub: {
                                applyRealtimeRevocation:
                                    async (): Promise<TRealtimeLeafRevocationResult> => {
                                        attempts[shardIndex] += 1

                                        if (blockInitialFanOut) {
                                            initialFanOutStarted.resolve()
                                            await releaseInitialFanOut.promise
                                        }

                                        if (
                                            shardIndex === 0 &&
                                            attempts[shardIndex] === 1
                                        ) {
                                            throw new Error(
                                                'Injected leaf failure.',
                                            )
                                        }

                                        return {
                                            closedSocketCount: 0,
                                            replayed: false,
                                        }
                                    },
                            },
                        })) as never

                    const initialRequest =
                        broker.revokeRealtimeAuthorization(input)
                    await initialFanOutStarted.promise

                    const key = `realtimeRevocation:${input.directive.operationId}`
                    const initialAlarm = await state.storage.getAlarm()
                    const initiallyStored =
                        await state.storage.get<unknown>(key)

                    blockInitialFanOut = false
                    releaseInitialFanOut.resolve()

                    const initial = await initialRequest
                    const retryAlarm = await state.storage.getAlarm()
                    await broker.alarm()
                    const completedAlarm = await state.storage.getAlarm()
                    const completedStored =
                        await state.storage.get<unknown>(key)
                    const replay =
                        await broker.revokeRealtimeAuthorization(input)
                    const replayAlarm = await state.storage.getAlarm()

                    return {
                        completedAlarm,
                        completedStored,
                        initial,
                        initialAlarm,
                        initiallyStored,
                        replay,
                        replayAlarm,
                        retryAlarm,
                    }
                },
            )

            expect(results.initialAlarm).toBeTypeOf('number')
            expect(results.initialAlarm).toBeLessThan(input.directive.expiresAt)
            expect(results.initiallyStored).toMatchObject({
                pendingShardIndexes: Array.from(
                    { length: WS_LEAF_COUNT },
                    (_, shardIndex) => shardIndex,
                ),
            })
            expect(results.initial).toMatchObject({
                accepted: false,
                failedLeafCount: 1,
                successfulLeafCount: WS_LEAF_COUNT - 1,
            })
            expect(results.retryAlarm).toBeTypeOf('number')
            expect(results.retryAlarm).toBeLessThan(input.directive.expiresAt)
            expect(results.completedStored).toMatchObject({
                pendingShardIndexes: [],
            })
            expect(results.completedAlarm).toBe(input.directive.expiresAt)
            expect(results.replay).toMatchObject({
                accepted: true,
                failedLeafCount: 0,
                successfulLeafCount: WS_LEAF_COUNT,
            })
            expect(results.replayAlarm).toBe(input.directive.expiresAt)
            expect(attempts[0]).toBe(2)
            expect(attempts.slice(1)).toEqual(
                Array.from({ length: WS_LEAF_COUNT - 1 }, () => 1),
            )
        })

        it('deletes expired broker revocations and their alarm when no active work remains.', async () => {
            const scope: TRealtimeBrokerScope = {
                storageVersion: 1,
                organizationId: `${TEST_ORGANIZATION_ID}RevocationExpiry`,
                stream: 'APP',
                surface: 'public',
            }
            const brokerStub = env.LOANMSPUB_DO_WSB.getByName(
                createRealtimeBrokerObjectName(scope),
            )
            const operationId = '0198ef86-e6ab-7da4-98d3-57e3101779f8'
            const key = `realtimeRevocation:${operationId}`
            const cleanup = await runInDurableObject(
                brokerStub,
                async (instance, state) => {
                    const broker =
                        instance as unknown as TRealtimeBrokerTestHarness

                    await state.storage.put(key, {
                        directive: {
                            authorizationVersion:
                                '0198ef86-e6ab-7da4-98d3-57e3101779f7',
                            expiresAt: Date.now() - 1,
                            identityId: 'TESTRealtimeExpiredIdentity',
                            operationId,
                            organizationId: scope.organizationId,
                        },
                        pendingShardIndexes: [0],
                        scope,
                    })
                    await state.storage.setAlarm(Date.now())
                    await broker.alarm()

                    return {
                        alarm: await state.storage.getAlarm(),
                        stored: await state.storage.get(key),
                    }
                },
            )

            expect(cleanup).toEqual({
                alarm: null,
                stored: undefined,
            })
        })

        it('recovers due rows and suppresses retries until their backoff expires.', async () => {
            const operationId = '0198ef86-e6ab-7da4-98d3-57e3101779e9'
            const db = dbClient(env.LOANMSPUB_D1)
            let brokerCallCount = 0
            let shouldAccept = false
            const namespace = {
                getByName: () => ({
                    revokeRealtimeAuthorization: async () => {
                        brokerCallCount += 1

                        return shouldAccept
                            ? {
                                  accepted: true,
                                  closedSocketCount: 0,
                                  failedLeafCount: 0,
                                  successfulLeafCount: WS_LEAF_COUNT,
                              }
                            : {
                                  accepted: false,
                                  closedSocketCount: 0,
                                  code: 'FANOUT_UNAVAILABLE',
                                  failedLeafCount: 1,
                                  successfulLeafCount: 0,
                              }
                    },
                }),
            } as unknown as typeof env.LOANMSPUB_DO_WSB

            try {
                await db.insert(dbSchema.websocketRevocationOperation).values({
                    id: operationId,
                    organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    reason: 'SCHEDULED_RECOVERY_TEST',
                    retainUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
                    revokedAuthorizationVersion:
                        '0198ef86-e6ab-7da4-98d3-57e3101779ea',
                    userId: TEST_OWNER_USER_ID,
                })
                await db.insert(dbSchema.websocketRevocationDelivery).values({
                    delivery: 'local',
                    nextAttemptAt: new Date(Date.now() - 1_000),
                    operationId,
                    organizationId: TEST_PRIMARY_ORGANIZATION_ID,
                    surface: 'public',
                })

                await expect(
                    recoverPublicRealtimeRevocations({
                        client: db,
                        limit: 1,
                        namespace,
                    }),
                ).resolves.toEqual({
                    processedCount: 1,
                    purgedCount: 0,
                })
                await expect(
                    recoverPublicRealtimeRevocations({
                        client: db,
                        limit: 1,
                        namespace,
                    }),
                ).resolves.toEqual({
                    processedCount: 0,
                    purgedCount: 0,
                })
                const brokerCallCountDuringFailure = brokerCallCount

                expect(
                    (
                        await db
                            .select()
                            .from(dbSchema.websocketRevocationDelivery)
                            .where(
                                eq(
                                    dbSchema.websocketRevocationDelivery
                                        .operationId,
                                    operationId,
                                ),
                            )
                    )[0],
                ).toMatchObject({
                    acceptedAt: null,
                    attemptCount: 1,
                    lastAttemptAt: expect.any(Date),
                    nextAttemptAt: expect.any(Date),
                })

                await db
                    .update(dbSchema.websocketRevocationDelivery)
                    .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
                    .where(
                        eq(
                            dbSchema.websocketRevocationDelivery.operationId,
                            operationId,
                        ),
                    )
                shouldAccept = true

                await expect(
                    recoverPublicRealtimeRevocations({
                        client: db,
                        limit: 1,
                        namespace,
                    }),
                ).resolves.toEqual({
                    processedCount: 1,
                    purgedCount: 0,
                })
                expect(brokerCallCount).toBeGreaterThan(
                    brokerCallCountDuringFailure,
                )

                expect(
                    (
                        await db
                            .select()
                            .from(dbSchema.websocketRevocationDelivery)
                            .where(
                                eq(
                                    dbSchema.websocketRevocationDelivery
                                        .operationId,
                                    operationId,
                                ),
                            )
                    )[0],
                ).toMatchObject({
                    acceptedAt: expect.any(Date),
                    attemptCount: 2,
                })
            } finally {
                await db
                    .delete(dbSchema.websocketRevocationOperation)
                    .where(
                        eq(
                            dbSchema.websocketRevocationOperation.id,
                            operationId,
                        ),
                    )
            }
        })
    })

    describe('Authentication Guard', () => {
        it('Unauthenticated request should return 401.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(401)
            expect(responseData).toHaveProperty('error')
            expect(responseData.error.code).toBe('UNAUTHORIZED')
        })
    })

    /**
     * @description
     * Unregistered Route
     *
     * Only APP and registered dedicated stream routes are admitted.
     * Requests to unregistered routes should return 404.
     */
    describe('Unregistered Route', () => {
        it('Request to an unregistered route should return 404.', async () => {
            const response = await app.request(
                '/api/ws/TESTUnregisteredChannel',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )
            const responseBody = await response.text()

            expect(response.status).toBe(404)
            expect(responseBody).toBe('404 Not Found')
        })
    })

    /**
     * @description
     * WebSocket Upgrade Guard
     *
     * Request must include a valid `Upgrade: websocket` header.
     */
    describe('WebSocket Upgrade Guard', () => {
        it('Request without Upgrade header should return 426.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                    },
                },
                env,
            )

            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(426)
            expect(responseData).toHaveProperty('error')
            expect(responseData.error.code).toBe('WEBSOCKET_UPGRADE_REQUIRED')
            expect(responseData.error.message).toBe(
                'Expected Upgrade: websocket',
            )
        })

        it('Request with incorrect Upgrade value should return 426.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'h2c',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(426)
            expect(responseData).toHaveProperty('error')
            expect(responseData.error.code).toBe('WEBSOCKET_UPGRADE_REQUIRED')
            expect(responseData.error.message).toBe(
                'Expected Upgrade: websocket',
            )
        })
    })

    /**
     * @description
     * WebSocket Origin Guard
     *
     * WebSocket upgrade requests must come from the configured frontend origin.
     */
    describe('WebSocket Origin Guard', () => {
        it('Request without Origin header should return 400.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(400)
            expect(responseData).toHaveProperty('error')
            expect(responseData.error.code).toBe('BAD_REQUEST')
            expect(responseData.error.message).toBe(
                'Missing Origin request header.',
            )
        })

        it('Request with invalid Origin header should return 403.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: 'https://example.invalid',
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            const responseData = await response.json<TApiResponseError>()

            expect(response.status).toBe(403)
            expect(responseData).toHaveProperty('error')
            expect(responseData.error.code).toBe('FORBIDDEN')
            expect(responseData.error.message).toBe('Invalid request origin.')
        })
    })

    /**
     * @description
     * Permission Guard & WebSocket Connection
     *
     * - All tested roles have ws.listen and should successfully upgrade to
     *   WebSocket (101).
     */
    describe('Permission Guard', () => {
        it('Owner with ws.listen connecting should return 101.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: privilegedCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            expect(response.status).toBe(101)
        })

        it('Member with ws.listen connecting should return 101.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: standardCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            expect(response.status).toBe(101)
        })

        it('Admin with ws.listen connecting should return 101.', async () => {
            const response = await app.request(
                '/api/ws/app',
                {
                    method: 'GET',
                    headers: {
                        origin: env.URL_FRONTEND,
                        cookie: administratorCookie,
                        upgrade: 'websocket',
                        'sec-websocket-protocol': REALTIME_WIRE_VERSION,
                    },
                },
                env,
            )

            expect(response.status).toBe(101)
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
