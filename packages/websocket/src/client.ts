import { z } from 'zod'

import { APP_REALTIME_STREAM, REALTIME_WIRE_VERSION } from './constants.js'
import { createRealtimeGapFrame, parseRealtimeServerFrame } from './protocol.js'
import { builtInRealtimeRegistry } from './registry.js'
import type {
    TAppRealtimeLifecycle,
    TAppRealtimeLifecycleOptions,
    TRealtimeClientTelemetryEvent,
    TRealtimeEventFrame,
    TRealtimeRecoveryCallbacks,
    TRealtimeRecoveryContext,
    TRealtimeServerFrame,
    TRealtimeStreamDefinition,
    TRealtimeSubscription,
    TWsClientManagerOptions,
} from './types.js'

export type {
    TAppRealtimeLifecycle,
    TAppRealtimeLifecycleOptions,
    TRealtimeClientTelemetryEvent,
    TRealtimeRecoveryCallbacks,
    TRealtimeRecoveryContext,
    TRealtimeServerFrame,
    TRealtimeSubscription,
    TWsClientManagerOptions,
} from './types.js'

const DEFAULT_CONNECTION_TIMEOUT_MS = 15000
const DEFAULT_RECONNECT_BASE_DELAY_MS = 2000
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000
const DEFAULT_RECONNECT_STABILITY_MS = 30000
const RECENT_EVENT_ID_LIMIT = 256
const realtimeOrganizationKeySchema = z.string().trim().min(1)
const realtimeTextFrameSchema = z.string()

type TManagedSocketEntry = {
    connectionTimer: ReturnType<typeof setTimeout> | null
    disconnectIdleTimer: ReturnType<typeof setTimeout> | null
    eventIds: Set<string>
    eventIdOrder: string[]
    generation: number
    idleRetentionMs: number
    key: string
    lastReadyConnectionId: string | null
    lastSequence: bigint | null
    recoveryCallbacks: Set<TRealtimeRecoveryCallbacks>
    recoveryReadySeen: boolean
    reconnectAttempts: number
    reconnectTimer: ReturnType<typeof setTimeout> | null
    recoveryPolicy: string
    refs: number
    socket: WebSocket | null
    stabilityTimer: ReturnType<typeof setTimeout> | null
    stream: string
    subscribers: Set<(frame: TRealtimeServerFrame) => void>
    target: string | null
    userClosed: boolean
}

const createRealtimeKey = (stream: string, target: string | null) =>
    JSON.stringify([
        'realtime',
        stream,
        target,
    ])

export function createWsClientManager(options: TWsClientManagerOptions) {
    const connectionTimeoutMs =
        options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS
    const reconnectBaseDelayMs =
        options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS
    const reconnectMaxDelayMs =
        options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
    const reconnectStabilityMs =
        options.reconnectStabilityMs ?? DEFAULT_RECONNECT_STABILITY_MS
    const registry = options.registry ?? builtInRealtimeRegistry
    const entries = new Map<string, TManagedSocketEntry>()
    const emitTelemetry = (
        entry: TManagedSocketEntry,
        type: TRealtimeClientTelemetryEvent['type'],
    ) => {
        try {
            options.telemetry?.({
                generation: entry.generation,
                stream: entry.stream,
                target: entry.target,
                type,
            })
        } catch {
            // Telemetry must not change connection behavior.
        }
    }

    const clearTimer = (
        entry: TManagedSocketEntry,
        timer:
            | 'connectionTimer'
            | 'disconnectIdleTimer'
            | 'reconnectTimer'
            | 'stabilityTimer',
    ) => {
        if (entry[timer] !== null) clearTimeout(entry[timer])
        entry[timer] = null
    }

    const getReconnectDelay = (attempt: number) => {
        const cappedDelay = Math.min(
            reconnectBaseDelayMs * 2 ** attempt,
            reconnectMaxDelayMs,
        )
        const halfDelay = Math.floor(cappedDelay / 2)

        return (
            halfDelay +
            Math.floor(Math.random() * (cappedDelay - halfDelay + 1))
        )
    }

    const dispatchRealtimeRecovery = (
        entry: TManagedSocketEntry,
        frame: TRealtimeServerFrame,
    ) => {
        const context: TRealtimeRecoveryContext = {
            recoveryPolicy: entry.recoveryPolicy,
            stream: entry.stream,
            target: entry.target,
        }

        if (frame.type === 'GAP') {
            emitTelemetry(entry, 'WS_CLIENT_RECOVERY')
            for (const callbacks of entry.recoveryCallbacks) {
                try {
                    callbacks.onGap?.(frame, context)
                } catch {
                    // Recovery callbacks are isolated from frame delivery.
                }
            }
            return
        }

        if (
            frame.type !== 'READY' ||
            frame.connectionId === entry.lastReadyConnectionId
        ) {
            return
        }

        entry.lastReadyConnectionId = frame.connectionId
        emitTelemetry(entry, 'WS_CLIENT_RECOVERY')

        for (const callbacks of entry.recoveryCallbacks) {
            try {
                if (entry.recoveryReadySeen) {
                    callbacks.onReconnectReady?.(frame, context)
                } else {
                    callbacks.onFirstReady?.(frame, context)
                }
            } catch {
                // Recovery callbacks are isolated from frame delivery.
            }
        }

        entry.recoveryReadySeen = true
    }

    const hasRealtimeFrameAffinity = (
        entry: TManagedSocketEntry,
        frame: TRealtimeServerFrame,
    ) => {
        if (frame.type === 'ERROR') return true
        if (frame.stream !== entry.stream) return false

        if (frame.type === 'EVENT' && frame.target === undefined) {
            return true
        }

        return (frame.target ?? null) === entry.target
    }

    const dispatchRealtimeFrame = (
        entry: TManagedSocketEntry,
        frame: TRealtimeServerFrame,
    ) => {
        dispatchRealtimeRecovery(entry, frame)

        for (const subscriber of entry.subscribers) {
            try {
                subscriber(frame)
            } catch {
                // One application callback must not block the other subscribers.
            }
        }
    }

    const rememberEventId = (
        entry: TManagedSocketEntry,
        frame: TRealtimeEventFrame,
    ) => {
        if (entry.eventIds.has(frame.eventId)) return false

        entry.eventIds.add(frame.eventId)
        entry.eventIdOrder.push(frame.eventId)

        if (entry.eventIdOrder.length > RECENT_EVENT_ID_LIMIT) {
            const expiredEventId = entry.eventIdOrder.shift()

            if (expiredEventId !== undefined) {
                entry.eventIds.delete(expiredEventId)
            }
        }

        return true
    }

    const processRealtimeFrame = (
        entry: TManagedSocketEntry,
        serializedFrame: string,
    ) => {
        const parsed = parseRealtimeServerFrame(registry, serializedFrame)

        if (!parsed.success) return

        const frame = parsed.data

        if (!hasRealtimeFrameAffinity(entry, frame)) return

        if (frame.type !== 'EVENT') {
            dispatchRealtimeFrame(entry, frame)
            return
        }

        if (!rememberEventId(entry, frame)) return

        if (frame.sequence !== undefined) {
            const received = BigInt(frame.sequence)

            if (entry.lastSequence !== null && received <= entry.lastSequence) {
                return
            }

            if (
                entry.lastSequence !== null &&
                received > entry.lastSequence + 1n
            ) {
                dispatchRealtimeFrame(
                    entry,
                    createRealtimeGapFrame({
                        expected: entry.lastSequence + 1n,
                        received,
                        stream: entry.stream,
                        ...(entry.target === null
                            ? {}
                            : { target: entry.target }),
                    }),
                )
            }

            entry.lastSequence = received
        }

        dispatchRealtimeFrame(entry, frame)
    }

    const scheduleReconnect = (entry: TManagedSocketEntry) => {
        if (
            entry.refs <= 0 ||
            entry.userClosed ||
            entry.reconnectTimer !== null ||
            entry.socket?.readyState === WebSocket.CONNECTING ||
            entry.socket?.readyState === WebSocket.OPEN
        ) {
            return
        }

        const delay = getReconnectDelay(entry.reconnectAttempts)
        entry.reconnectAttempts += 1
        emitTelemetry(entry, 'WS_CLIENT_CONNECTION_RECONNECT_SCHEDULED')
        const generation = entry.generation
        entry.reconnectTimer = setTimeout(() => {
            entry.reconnectTimer = null

            if (generation !== entry.generation || entry.userClosed) return

            connectEntry(entry)
        }, delay)
    }

    const connectEntry = (entry: TManagedSocketEntry) => {
        if (entry.refs <= 0 || entry.userClosed) return
        if (
            entry.socket?.readyState === WebSocket.CONNECTING ||
            entry.socket?.readyState === WebSocket.OPEN
        ) {
            return
        }

        entry.generation += 1
        const generation = entry.generation
        const url = options.getUrl(
            entry.stream,
            entry.target === null ? undefined : entry.target,
        )
        const socket = new WebSocket(url, REALTIME_WIRE_VERSION)
        entry.socket = socket
        emitTelemetry(entry, 'WS_CLIENT_CONNECTION_CONNECTING')

        clearTimer(entry, 'connectionTimer')
        entry.connectionTimer = setTimeout(() => {
            if (
                generation !== entry.generation ||
                socket.readyState !== WebSocket.CONNECTING
            ) {
                return
            }

            socket.close(1013, 'Connection timed out.')
        }, connectionTimeoutMs)

        socket.addEventListener('open', () => {
            if (generation !== entry.generation) return

            clearTimer(entry, 'connectionTimer')
            clearTimer(entry, 'stabilityTimer')
            entry.stabilityTimer = setTimeout(() => {
                if (generation === entry.generation) {
                    entry.reconnectAttempts = 0
                }
            }, reconnectStabilityMs)
        })

        socket.addEventListener('message', (event) => {
            const frame = realtimeTextFrameSchema.safeParse(event.data)

            if (generation !== entry.generation || !frame.success) return

            processRealtimeFrame(entry, frame.data)
        })

        socket.addEventListener('close', () => {
            if (generation !== entry.generation) return

            clearTimer(entry, 'connectionTimer')
            clearTimer(entry, 'stabilityTimer')

            if (entry.socket === socket) entry.socket = null

            scheduleReconnect(entry)
        })

        socket.addEventListener('error', () => {
            if (generation === entry.generation) socket.close()
        })
    }

    const createEntry = (input: {
        idleRetentionMs: number
        key: string
        recoveryPolicy: string
        stream: string
        target: string | null
    }): TManagedSocketEntry => ({
        connectionTimer: null,
        disconnectIdleTimer: null,
        eventIds: new Set(),
        eventIdOrder: [],
        generation: 0,
        idleRetentionMs: input.idleRetentionMs,
        key: input.key,
        lastReadyConnectionId: null,
        lastSequence: null,
        recoveryCallbacks: new Set(),
        recoveryReadySeen: false,
        reconnectAttempts: 0,
        reconnectTimer: null,
        recoveryPolicy: input.recoveryPolicy,
        refs: 0,
        socket: null,
        stabilityTimer: null,
        stream: input.stream,
        subscribers: new Set(),
        target: input.target,
        userClosed: false,
    })

    const acquireEntry = (key: string, create: () => TManagedSocketEntry) => {
        const entry = entries.get(key) ?? create()

        entry.refs += 1
        entry.userClosed = false
        clearTimer(entry, 'disconnectIdleTimer')
        entries.set(key, entry)
        emitTelemetry(entry, 'WS_CLIENT_CONNECTION_ACQUIRED')
        connectEntry(entry)

        return entry
    }

    const closeEntry = (
        entry: TManagedSocketEntry,
        code?: number,
        reason?: string,
    ) => {
        entry.userClosed = true
        entry.generation += 1
        clearTimer(entry, 'connectionTimer')
        clearTimer(entry, 'disconnectIdleTimer')
        clearTimer(entry, 'reconnectTimer')
        clearTimer(entry, 'stabilityTimer')
        entry.socket?.close(code, reason)
        entry.socket = null
        entries.delete(entry.key)
    }

    const releaseEntry = (entry: TManagedSocketEntry) => {
        entry.refs -= 1
        emitTelemetry(entry, 'WS_CLIENT_CONNECTION_RELEASED')

        if (entry.refs > 0) return

        clearTimer(entry, 'reconnectTimer')

        if (entry.idleRetentionMs === 0) {
            closeEntry(entry)
            return
        }

        entry.disconnectIdleTimer = setTimeout(() => {
            entry.disconnectIdleTimer = null

            if (entry.refs === 0) closeEntry(entry)
        }, entry.idleRetentionMs)
    }

    const connectRealtime = (
        stream: TRealtimeStreamDefinition,
        target: string | null,
    ): TRealtimeSubscription => {
        const key = createRealtimeKey(stream.wireName, target)
        const entry = acquireEntry(key, () =>
            createEntry({
                idleRetentionMs: stream.idleRetentionMs,
                key,
                recoveryPolicy: stream.recoveryPolicy,
                stream: stream.wireName,
                target,
            }),
        )
        const clientSubscribers = new Set<
            (frame: TRealtimeServerFrame) => void
        >()
        const clientRecoveryCallbacks = new Set<TRealtimeRecoveryCallbacks>()
        let released = false

        const subscribe = (
            subscriber: (frame: TRealtimeServerFrame) => void,
        ) => {
            if (released) {
                throw new Error('Realtime subscription was released.')
            }

            clientSubscribers.add(subscriber)
            entry.subscribers.add(subscriber)

            return () => {
                clientSubscribers.delete(subscriber)
                entry.subscribers.delete(subscriber)
            }
        }

        return {
            get readyState() {
                return entry.socket?.readyState ?? WebSocket.CLOSED
            },
            release: () => {
                if (released) return
                released = true

                clientSubscribers.forEach((subscriber) => {
                    entry.subscribers.delete(subscriber)
                })
                clientSubscribers.clear()
                clientRecoveryCallbacks.forEach((callbacks) => {
                    entry.recoveryCallbacks.delete(callbacks)
                })
                clientRecoveryCallbacks.clear()
                releaseEntry(entry)
            },
            subscribe,
            subscribeRecovery: (callbacks) => {
                if (released) {
                    throw new Error('Realtime subscription was released.')
                }

                clientRecoveryCallbacks.add(callbacks)
                entry.recoveryCallbacks.add(callbacks)

                return () => {
                    clientRecoveryCallbacks.delete(callbacks)
                    entry.recoveryCallbacks.delete(callbacks)
                }
            },
        }
    }

    const connect = (stream: string, target: string) => {
        const definition = registry.getStream(stream)

        if (!definition || definition.kind !== 'dedicated') {
            throw new Error(`Unknown dedicated realtime stream "${stream}".`)
        }

        const normalizedTarget = registry.normalizeTarget(
            definition.wireName,
            target,
        )

        if (!normalizedTarget.success) {
            throw new Error(
                `Invalid target for realtime stream "${definition.wireName}".`,
            )
        }

        return connectRealtime(definition, normalizedTarget.target)
    }

    const connectApp = () => {
        const stream = registry.getStream(APP_REALTIME_STREAM)

        if (!stream || stream.kind !== 'app') {
            throw new Error('The APP realtime stream is not registered.')
        }

        return connectRealtime(stream, null)
    }

    const disconnectAll = (reason = 'Session boundary changed.') => {
        for (const entry of [...entries.values()]) {
            closeEntry(entry, 1000, reason)
        }
    }

    return {
        connect,
        connectApp,
        disconnectAll,
    }
}

export type TWsClientManager = ReturnType<typeof createWsClientManager>

export const createAppRealtimeLifecycle = (
    options: TAppRealtimeLifecycleOptions,
): TAppRealtimeLifecycle => {
    let appSubscription: TRealtimeSubscription | null = null
    let organizationKey: string | null = null
    let removeFrameListener: (() => void) | null = null
    let removeRecoveryCallbacks: (() => void) | null = null
    let disposed = false

    const releaseApp = () => {
        removeFrameListener?.()
        removeFrameListener = null
        removeRecoveryCallbacks?.()
        removeRecoveryCallbacks = null
        appSubscription?.release()
        appSubscription = null
    }

    const disconnectSession = (reason: string) => {
        options.manager.disconnectAll(reason)
        releaseApp()
        organizationKey = null
    }

    return {
        activate: (nextOrganizationKey) => {
            if (disposed) {
                throw new Error('The APP realtime lifecycle was disposed.')
            }

            const normalizedOrganizationKey =
                realtimeOrganizationKeySchema.safeParse(nextOrganizationKey)

            if (!normalizedOrganizationKey.success) {
                disconnectSession('Authentication lost.')
                return
            }

            if (
                organizationKey !== null &&
                organizationKey !== normalizedOrganizationKey.data
            ) {
                disconnectSession('Tenant changed.')
            }

            organizationKey = normalizedOrganizationKey.data

            if (appSubscription !== null) return

            appSubscription = options.manager.connectApp()
            if (options.onFrame) {
                removeFrameListener = appSubscription.subscribe(options.onFrame)
            }
            removeRecoveryCallbacks = appSubscription.subscribeRecovery(
                options.recoveryCallbacks ?? {},
            )
        },
        deactivate: (reason = 'Authentication lost.') => {
            disconnectSession(reason)
        },
        dispose: () => {
            if (disposed) return

            disposed = true
            disconnectSession('Session provider disposed.')
        },
    }
}
