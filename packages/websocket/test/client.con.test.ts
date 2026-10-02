import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
    createAppRealtimeLifecycle,
    createWsClientManager,
    type TRealtimeClientTelemetryEvent,
} from '../src/client.js'
import { REALTIME_WIRE_VERSION } from '../src/protocol.js'
import {
    createRealtimeRegistry,
    defineRealtimeEvent,
    defineRealtimeStream,
} from '../src/registry.js'

class MockWebSocket extends EventTarget {
    static readonly CLOSED = 3
    static readonly CLOSING = 2
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static instances: MockWebSocket[] = []

    readonly closeCalls: Array<{ code?: number; reason?: string }> = []
    readonly protocols?: string | string[]
    readyState = MockWebSocket.CONNECTING
    readonly sent: Array<Parameters<WebSocket['send']>[0]> = []

    constructor(
        readonly url: string,
        protocols?: string | string[],
    ) {
        super()
        this.protocols = protocols
        MockWebSocket.instances.push(this)
    }

    close(code?: number, reason?: string) {
        this.closeCalls.push({ code, reason })
        this.readyState = MockWebSocket.CLOSED
        this.dispatchEvent(new Event('close'))
    }

    disconnect() {
        this.readyState = MockWebSocket.CLOSED
        this.dispatchEvent(new Event('close'))
    }

    emitMessage(data: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data }))
    }

    open() {
        this.readyState = MockWebSocket.OPEN
        this.dispatchEvent(new Event('open'))
    }

    send(data: Parameters<WebSocket['send']>[0]) {
        this.sent.push(data)
    }
}

const createTestRegistry = (idleRetentionMs = 0) =>
    createRealtimeRegistry({
        appEvents: {
            APP_UPDATED: defineRealtimeEvent({
                audiences: ['organization'],
                delivery: 'organization',
                payloadSchema: z.object({
                    value: z.number(),
                }),
            }),
        },
        streams: [
            defineRealtimeStream({
                authorizationPolicy: 'game_member',
                events: {
                    GAME_ORGANIZATION_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: z.object({
                            value: z.number(),
                        }),
                    }),
                    GAME_UPDATED: defineRealtimeEvent({
                        audiences: ['organization'],
                        delivery: 'target',
                        payloadSchema: z.object({
                            value: z.number(),
                        }),
                    }),
                },
                idleRetentionMs,
                kind: 'dedicated',
                metricsLabel: 'game',
                recoveryPolicy: 'game_queries',
                targetSchema: z.string().trim().toUpperCase(),
                wireName: 'GAME',
            }),
        ],
    })

const createEventFrame = (input: {
    eventId: string
    sequence?: string
    value: number
}) =>
    JSON.stringify({
        event: 'APP_UPDATED',
        eventId: input.eventId,
        occurredAt: '2026-07-27T12:00:00.000+08:00',
        payload: {
            value: input.value,
        },
        ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
        stream: 'APP',
        type: 'EVENT',
    })

const createReadyFrame = (connectionId: string) =>
    JSON.stringify({
        authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
        connectionId,
        wireVersion: 'realtime.events.v1',
        stream: 'APP',
        type: 'READY',
    })

const createGapFrame = () =>
    JSON.stringify({
        expected: '2',
        received: '4',
        stream: 'APP',
        type: 'GAP',
    })

describe('createWsClientManager', () => {
    beforeEach(() => {
        MockWebSocket.instances = []
        vi.useFakeTimers()
        vi.spyOn(Math, 'random').mockReturnValue(0)
        vi.stubGlobal('WebSocket', MockWebSocket)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('opens APP only when acquired and negotiates the wire protocol.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })

        expect(MockWebSocket.instances).toHaveLength(0)

        const subscription = manager.connectApp()
        const socket = MockWebSocket.instances[0]

        expect(MockWebSocket.instances).toHaveLength(1)
        expect(socket?.protocols).toBe(REALTIME_WIRE_VERSION)
        expect(subscription.readyState).toBe(WebSocket.CONNECTING)

        socket?.open()

        expect(subscription.readyState).toBe(WebSocket.OPEN)

        subscription.release()

        expect(subscription.readyState).toBe(WebSocket.CLOSED)
    })

    it('classifies first READY, reconnect READY, and GAP recovery callbacks.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const subscription = manager.connectApp()
        const onFirstReady = vi.fn()
        const onGap = vi.fn()
        const onReconnectReady = vi.fn()
        const firstReady = createReadyFrame(
            '0198ef86-e6ab-7da4-98d3-57e3101779e4',
        )
        const reconnectReady = createReadyFrame(
            '0198ef86-e6ab-7da4-98d3-57e3101779e5',
        )

        subscription.subscribeRecovery({
            onFirstReady,
            onGap,
            onReconnectReady,
        })
        MockWebSocket.instances[0]?.emitMessage(firstReady)
        MockWebSocket.instances[0]?.emitMessage(firstReady)
        MockWebSocket.instances[0]?.emitMessage(reconnectReady)
        MockWebSocket.instances[0]?.emitMessage(createGapFrame())

        expect(onFirstReady).toHaveBeenCalledOnce()
        expect(onFirstReady).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                type: 'READY',
            }),
            {
                recoveryPolicy: 'active_tenant',
                stream: 'APP',
                target: null,
            },
        )
        expect(onReconnectReady).toHaveBeenCalledOnce()
        expect(onReconnectReady).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                type: 'READY',
            }),
            {
                recoveryPolicy: 'active_tenant',
                stream: 'APP',
                target: null,
            },
        )
        expect(onGap).toHaveBeenCalledOnce()
        expect(onGap).toHaveBeenCalledWith(
            expect.objectContaining({
                expected: '2',
                received: '4',
                type: 'GAP',
            }),
            {
                recoveryPolicy: 'active_tenant',
                stream: 'APP',
                target: null,
            },
        )
    })

    it('isolates every recovery callback from other callbacks and frame subscribers.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const subscription = manager.connectApp()
        const subscriber = vi.fn()
        const retainedOnFirstReady = vi.fn()
        const retainedOnGap = vi.fn()
        const retainedOnReconnectReady = vi.fn()
        const throwInjectedFailure = () => {
            throw new Error('Injected recovery callback failure.')
        }

        subscription.subscribe(subscriber)
        subscription.subscribeRecovery({
            onFirstReady: throwInjectedFailure,
            onGap: throwInjectedFailure,
            onReconnectReady: throwInjectedFailure,
        })
        subscription.subscribeRecovery({
            onFirstReady: retainedOnFirstReady,
            onGap: retainedOnGap,
            onReconnectReady: retainedOnReconnectReady,
        })

        MockWebSocket.instances[0]?.emitMessage(
            createReadyFrame('0198ef86-e6ab-7da4-98d3-57e3101779e4'),
        )
        MockWebSocket.instances[0]?.emitMessage(
            createReadyFrame('0198ef86-e6ab-7da4-98d3-57e3101779e6'),
        )
        MockWebSocket.instances[0]?.emitMessage(createGapFrame())

        expect(retainedOnFirstReady).toHaveBeenCalledOnce()
        expect(retainedOnReconnectReady).toHaveBeenCalledOnce()
        expect(retainedOnGap).toHaveBeenCalledOnce()
        expect(subscriber).toHaveBeenCalledTimes(3)
    })

    it('isolates telemetry failures from connection lifecycle behavior.', async () => {
        const telemetry = vi.fn((event: TRealtimeClientTelemetryEvent) => {
            throw new Error(`Injected telemetry failure for ${event.type}.`)
        })
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            reconnectBaseDelayMs: 100,
            registry: createTestRegistry(),
            telemetry,
        })
        const subscription = manager.connectApp()
        const firstSocket = MockWebSocket.instances[0]

        firstSocket?.disconnect()
        await vi.advanceTimersByTimeAsync(50)

        expect(MockWebSocket.instances).toHaveLength(2)

        subscription.release()

        expect(telemetry.mock.calls.map(([event]) => event.type)).toEqual([
            'WS_CLIENT_CONNECTION_ACQUIRED',
            'WS_CLIENT_CONNECTION_CONNECTING',
            'WS_CLIENT_CONNECTION_RECONNECT_SCHEDULED',
            'WS_CLIENT_CONNECTION_CONNECTING',
            'WS_CLIENT_CONNECTION_RELEASED',
        ])
    })

    it('dispatches only frames matching their physical stream and target.', () => {
        const manager = createWsClientManager({
            getUrl: (stream, target) =>
                `wss://example.test/api/ws/${stream}/${target}`,
            registry: createTestRegistry(),
        })
        const subscription = manager.connect('GAME', 'game-a')
        const listener = vi.fn()
        const socket = MockWebSocket.instances[0]
        const baseEvent = {
            occurredAt: '2026-07-27T12:00:00.000+08:00',
            payload: { value: 1 },
            stream: 'GAME',
            type: 'EVENT',
        }

        subscription.subscribe(listener)
        socket?.emitMessage(
            JSON.stringify({
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
                wireVersion: 'realtime.events.v1',
                stream: 'APP',
                type: 'READY',
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                wireVersion: 'realtime.events.v1',
                stream: 'GAME',
                target: 'GAME-B',
                type: 'READY',
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                expected: '2',
                received: '4',
                stream: 'GAME',
                target: 'GAME-B',
                type: 'GAP',
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                ...baseEvent,
                event: 'GAME_UPDATED',
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                target: 'GAME-B',
            }),
        )
        socket?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e8',
                value: 1,
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
                connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e9',
                wireVersion: 'realtime.events.v1',
                stream: 'GAME',
                target: 'GAME-A',
                type: 'READY',
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                expected: '2',
                received: '4',
                stream: 'GAME',
                target: 'GAME-A',
                type: 'GAP',
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                ...baseEvent,
                event: 'GAME_ORGANIZATION_UPDATED',
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779ea',
            }),
        )
        socket?.emitMessage(
            JSON.stringify({
                ...baseEvent,
                event: 'GAME_UPDATED',
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779eb',
                target: 'GAME-A',
            }),
        )

        expect(listener).toHaveBeenCalledTimes(4)
        expect(listener.mock.calls.map(([frame]) => frame.type)).toEqual([
            'READY',
            'GAP',
            'EVENT',
            'EVENT',
        ])
        expect(listener.mock.calls[2]?.[0]).toMatchObject({
            event: 'GAME_ORGANIZATION_UPDATED',
        })
        expect(listener.mock.calls[2]?.[0]).not.toHaveProperty('target')
        expect(listener.mock.calls[3]?.[0]).toMatchObject({
            event: 'GAME_UPDATED',
            target: 'GAME-A',
        })
    })

    it('owns one APP acquisition and replaces it across a tenant boundary.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const lifecycle = createAppRealtimeLifecycle({
            manager,
        })

        lifecycle.activate(' organization-a ')
        lifecycle.activate('organization-a')

        const firstSocket = MockWebSocket.instances[0]

        expect(MockWebSocket.instances).toHaveLength(1)

        lifecycle.activate('organization-b')

        const secondSocket = MockWebSocket.instances[1]

        expect(MockWebSocket.instances).toHaveLength(2)
        expect(firstSocket?.closeCalls).toEqual([
            { code: 1000, reason: 'Tenant changed.' },
        ])

        lifecycle.deactivate()

        expect(secondSocket?.closeCalls).toEqual([
            { code: 1000, reason: 'Authentication lost.' },
        ])
    })

    it('cancels an old tenant reconnect before opening the replacement APP.', async () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const lifecycle = createAppRealtimeLifecycle({
            manager,
        })

        lifecycle.activate('organization-a')
        MockWebSocket.instances[0]?.disconnect()
        lifecycle.activate('organization-b')
        MockWebSocket.instances[1]?.open()
        await vi.advanceTimersByTimeAsync(30000)

        expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('delivers APP frames through the lifecycle and detaches on deactivate.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const onFrame = vi.fn()
        const lifecycle = createAppRealtimeLifecycle({ manager, onFrame })

        lifecycle.activate('organization-a')
        const socket = MockWebSocket.instances[0]
        socket?.open()
        socket?.emitMessage(
            createReadyFrame('0198ef86-e6ab-7da4-98d3-57e3101779e4'),
        )
        socket?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                value: 42,
            }),
        )

        expect(onFrame).toHaveBeenCalledTimes(2)
        expect(onFrame.mock.calls[1]?.[0]).toMatchObject({
            event: 'APP_UPDATED',
            payload: { value: 42 },
        })

        lifecycle.deactivate()
        socket?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e8',
                value: 99,
            }),
        )

        expect(onFrame).toHaveBeenCalledTimes(2)
    })

    it('does not subscribe to APP frames without an onFrame listener.', () => {
        const subscription = {
            readyState: 1,
            release: vi.fn(),
            subscribe: vi.fn(() => vi.fn()),
            subscribeRecovery: vi.fn(() => vi.fn()),
        }
        const lifecycle = createAppRealtimeLifecycle({
            manager: {
                connectApp: () => subscription,
                disconnectAll: vi.fn(),
            },
        })

        lifecycle.activate('organization-a')

        expect(subscription.subscribe).not.toHaveBeenCalled()
        expect(subscription.subscribeRecovery).toHaveBeenCalledTimes(1)
    })

    it('reattaches the frame listener to the replacement APP lease after a tenant change.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const onFrame = vi.fn()
        const lifecycle = createAppRealtimeLifecycle({ manager, onFrame })

        lifecycle.activate('organization-a')
        lifecycle.activate('organization-b')

        const firstSocket = MockWebSocket.instances[0]
        const secondSocket = MockWebSocket.instances[1]

        firstSocket?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                value: 1,
            }),
        )

        expect(onFrame).not.toHaveBeenCalled()

        secondSocket?.open()
        secondSocket?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e8',
                value: 2,
            }),
        )

        expect(onFrame).toHaveBeenCalledTimes(1)
        expect(onFrame.mock.calls[0]?.[0]).toMatchObject({
            payload: { value: 2 },
        })
    })

    it('drops APP events the browser registry does not define.', () => {
        const eventFrame = createEventFrame({
            eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e7',
            value: 1,
        })
        const defaultManager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
        })
        const defaultOnFrame = vi.fn()

        createAppRealtimeLifecycle({
            manager: defaultManager,
            onFrame: defaultOnFrame,
        }).activate('organization-a')
        MockWebSocket.instances[0]?.open()
        MockWebSocket.instances[0]?.emitMessage(eventFrame)

        expect(defaultOnFrame).not.toHaveBeenCalled()

        const registeredOnFrame = vi.fn()

        createAppRealtimeLifecycle({
            manager: createWsClientManager({
                getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
                registry: createTestRegistry(),
            }),
            onFrame: registeredOnFrame,
        }).activate('organization-a')
        MockWebSocket.instances[1]?.open()
        MockWebSocket.instances[1]?.emitMessage(eventFrame)

        expect(registeredOnFrame).toHaveBeenCalledTimes(1)
    })

    it('disposes the APP lifecycle idempotently and prevents reactivation.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const lifecycle = createAppRealtimeLifecycle({ manager })

        lifecycle.activate('organization-a')
        lifecycle.dispose()
        lifecycle.dispose()

        expect(MockWebSocket.instances[0]?.closeCalls).toEqual([
            { code: 1000, reason: 'Session provider disposed.' },
        ])
        expect(() => lifecycle.activate('organization-a')).toThrow(
            'The APP realtime lifecycle was disposed.',
        )
    })

    it('shares normalized dedicated keys with reference counting.', () => {
        const manager = createWsClientManager({
            getUrl: (stream, target) =>
                `wss://example.test/api/ws/${stream}/${target}`,
            registry: createTestRegistry(),
        })
        const first = manager.connect('game', ' game-a ')
        const second = manager.connect('GAME', 'GAME-A')

        expect(MockWebSocket.instances).toHaveLength(1)
        expect(first).not.toHaveProperty('socket')
        expect(second).not.toHaveProperty('socket')
        expect(MockWebSocket.instances[0]?.url).toBe(
            'wss://example.test/api/ws/GAME/GAME-A',
        )

        first.release()
        expect(MockWebSocket.instances[0]?.closeCalls).toHaveLength(0)

        second.release()
        expect(MockWebSocket.instances[0]?.closeCalls).toHaveLength(1)
    })

    it('creates a new physical socket after a zero-retention final release.', () => {
        const manager = createWsClientManager({
            getUrl: (stream, target) =>
                `wss://example.test/api/ws/${stream}/${target}`,
            registry: createTestRegistry(),
        })
        const first = manager.connect('GAME', 'GAME-A')
        const firstSocket = MockWebSocket.instances[0]

        first.release()

        expect(firstSocket?.closeCalls).toHaveLength(1)

        const second = manager.connect('GAME', 'GAME-A')

        expect(MockWebSocket.instances).toHaveLength(2)
        expect(MockWebSocket.instances[1]).not.toBe(firstSocket)

        second.release()
    })

    it('reconnects physically while retaining logical subscribers.', async () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            reconnectBaseDelayMs: 100,
            registry: createTestRegistry(),
        })
        const subscription = manager.connectApp()
        const listener = vi.fn()

        subscription.subscribe(listener)
        MockWebSocket.instances[0]?.disconnect()
        await vi.advanceTimersByTimeAsync(50)

        expect(MockWebSocket.instances).toHaveLength(2)

        MockWebSocket.instances[1]?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779ec',
                value: 1,
            }),
        )

        expect(listener).toHaveBeenCalledOnce()

        subscription.release()
    })

    it('rejects unknown streams and invalid dedicated targets.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })

        expect(() => manager.connect('UNKNOWN', 'target')).toThrow(
            'Unknown dedicated realtime stream "UNKNOWN".',
        )
        expect(() => manager.connect('GAME', '   ')).toThrow(
            'Invalid target for realtime stream "GAME".',
        )
        expect(MockWebSocket.instances).toHaveLength(0)
    })

    it('parses each frame once, deduplicates events, and emits sequence gaps.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const subscription = manager.connectApp()
        const listener = vi.fn()
        const parseSpy = vi.spyOn(JSON, 'parse')
        const firstEvent = createEventFrame({
            eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
            sequence: '1',
            value: 1,
        })
        const thirdEvent = createEventFrame({
            eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
            sequence: '3',
            value: 3,
        })

        subscription.subscribe(listener)
        MockWebSocket.instances[0]?.emitMessage(firstEvent)
        MockWebSocket.instances[0]?.emitMessage(firstEvent)
        MockWebSocket.instances[0]?.emitMessage(thirdEvent)

        expect(parseSpy).toHaveBeenCalledTimes(3)
        expect(listener).toHaveBeenCalledTimes(3)
        expect(listener.mock.calls[1]?.[0]).toEqual({
            expected: '2',
            received: '3',
            stream: 'APP',
            type: 'GAP',
        })
        expect(listener.mock.calls[2]?.[0]).toMatchObject({
            eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
            sequence: '3',
            type: 'EVENT',
        })
    })

    it('retains only the latest 256 event IDs for deduplication.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const subscription = manager.connectApp()
        const listener = vi.fn()
        const eventIds = Array.from(
            { length: 257 },
            (_, index) =>
                `0198ef86-e6ab-7da4-98d3-${index
                    .toString(16)
                    .padStart(12, '0')}`,
        )

        subscription.subscribe(listener)

        eventIds.forEach((eventId, value) => {
            MockWebSocket.instances[0]?.emitMessage(
                createEventFrame({ eventId, value }),
            )
        })
        MockWebSocket.instances[0]?.emitMessage(
            createEventFrame({ eventId: eventIds[256]!, value: 256 }),
        )
        MockWebSocket.instances[0]?.emitMessage(
            createEventFrame({ eventId: eventIds[0]!, value: 0 }),
        )

        expect(listener).toHaveBeenCalledTimes(258)
        expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({
            eventId: eventIds[0],
            payload: { value: 0 },
        })
    })

    it('isolates subscriber failures and removes unsubscribed callbacks.', () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(),
        })
        const subscription = manager.connectApp()
        const failingListener = vi.fn(() => {
            throw new Error('Injected subscriber failure.')
        })
        const retainedListener = vi.fn()
        const unsubscribe = subscription.subscribe(failingListener)

        subscription.subscribe(retainedListener)
        MockWebSocket.instances[0]?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e6',
                value: 1,
            }),
        )
        unsubscribe()
        MockWebSocket.instances[0]?.emitMessage(
            createEventFrame({
                eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e7',
                value: 2,
            }),
        )

        expect(failingListener).toHaveBeenCalledOnce()
        expect(retainedListener).toHaveBeenCalledTimes(2)
    })

    it('closes a connection that never opens and reconnects with a new generation.', async () => {
        const manager = createWsClientManager({
            connectionTimeoutMs: 100,
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            reconnectBaseDelayMs: 50,
            registry: createTestRegistry(),
        })

        manager.connectApp()
        await vi.advanceTimersByTimeAsync(100)

        expect(MockWebSocket.instances[0]?.closeCalls).toEqual([
            { code: 1013, reason: 'Connection timed out.' },
        ])

        await vi.advanceTimersByTimeAsync(24)

        expect(MockWebSocket.instances).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(1)

        expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('retains configured dedicated sockets only until their idle deadline.', async () => {
        const manager = createWsClientManager({
            getUrl: (stream) => `wss://example.test/api/ws/${stream}`,
            registry: createTestRegistry(500),
        })
        const first = manager.connect('GAME', 'GAME-A')
        const socket = MockWebSocket.instances[0]

        first.release()
        await vi.advanceTimersByTimeAsync(499)

        const replacement = manager.connect('GAME', 'GAME-A')

        expect(MockWebSocket.instances).toHaveLength(1)

        replacement.release()
        await vi.advanceTimersByTimeAsync(500)

        expect(socket?.closeCalls).toHaveLength(1)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
