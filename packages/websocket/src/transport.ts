import { REALTIME_TRANSPORT_VERSION, WS_LEAF_COUNT } from './constants.js'
import {
    realtimeAudienceSchema,
    realtimeBrokerScopeSchema,
    realtimeLeafScopeSchema,
    realtimeRevocationDirectiveSchema,
    realtimeTransportAttachmentSchema,
} from './schemas.js'
import type {
    TBoundedTaskResult,
    TRealtimeAudience,
    TRealtimeBrokerScope,
    TRealtimeLeafScope,
    TRealtimeRevocationDirective,
    TRealtimeTransportAttachment,
    TWebSocketAdmissionFailure,
} from './types.js'

export {
    REALTIME_STORAGE_VERSION,
    REALTIME_TRANSPORT_VERSION,
    WS_BROKER_FAN_OUT_CONCURRENCY,
    WS_BROKER_FAN_OUT_DEADLINE_MS,
    WS_BROKER_PUBLICATION_BURST,
    WS_BROKER_PUBLICATION_RATE_PER_SECOND,
    WS_LEAF_COUNT,
    WS_LEAF_SOFT_CAP,
    WS_SLOW_CLIENT_MAX_BUFFERED_BYTES,
} from './constants.js'
export {
    realtimeAudienceSchema,
    realtimeBrokerScopeSchema,
    realtimeLeafScopeSchema,
    realtimeRevocationDirectiveSchema,
    realtimeTransportAttachmentSchema,
} from './schemas.js'
export type {
    TBoundedTaskResult,
    TRealtimeAudience,
    TRealtimeBrokerScope,
    TRealtimeLeafScope,
    TRealtimeRevocationDirective,
    TRealtimeTransportAttachment,
    TWebSocketAdmissionFailure,
} from './types.js'

export const hashWebSocketValue = (value: string) => {
    let hash = 2166136261

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }

    return hash >>> 0
}

export const getSafeOrganizationIdentity = (organizationId: string) =>
    hashWebSocketValue(
        JSON.stringify([
            'wsOrganizationLog',
            1,
            organizationId,
        ]),
    )
        .toString(16)
        .padStart(8, '0')

export const getSafeWebSocketObjectIdentity = (objectId: string) =>
    hashWebSocketValue(
        JSON.stringify([
            'wsObjectLog',
            1,
            objectId,
        ]),
    )
        .toString(16)
        .padStart(8, '0')

export const createRealtimeLeafProbeOrder = (
    scope: TRealtimeBrokerScope,
    connectionId: string,
) => {
    const hashInput = [
        scope.surface,
        scope.organizationId,
        scope.stream,
        connectionId,
    ]
    const primary =
        hashWebSocketValue(
            JSON.stringify([
                'realtimeLeafAdmissionPrimary',
                REALTIME_TRANSPORT_VERSION,
                ...hashInput,
            ]),
        ) % WS_LEAF_COUNT
    const hashStep = hashWebSocketValue(
        JSON.stringify([
            'realtimeLeafAdmissionStep',
            REALTIME_TRANSPORT_VERSION,
            ...hashInput,
        ]),
    )
    const step = (hashStep % (WS_LEAF_COUNT / 2)) * 2 + 1

    return Array.from(
        { length: WS_LEAF_COUNT },
        (_, attempt) => (primary + attempt * step) % WS_LEAF_COUNT,
    )
}

export const getWebSocketAdmissionFailure = (
    fullLeafCount: number,
    unavailableLeafCount: number,
): TWebSocketAdmissionFailure => {
    if (fullLeafCount === WS_LEAF_COUNT && unavailableLeafCount === 0) {
        return {
            code: 'WEBSOCKET_CAPACITY_UNAVAILABLE',
            message: 'WebSocket capacity is temporarily unavailable.',
        }
    }

    return {
        code: 'WEBSOCKET_SHARD_UNAVAILABLE',
        message: 'WebSocket shards are temporarily unavailable.',
    }
}

export const createRealtimeBrokerObjectName = (scope: TRealtimeBrokerScope) =>
    JSON.stringify([
        'realtimeBroker',
        REALTIME_TRANSPORT_VERSION,
        scope.surface,
        scope.organizationId,
        scope.stream,
    ])

export const createRealtimeLeafObjectName = (
    scope: TRealtimeBrokerScope,
    shardIndex: number,
) =>
    JSON.stringify([
        'realtimeLeaf',
        REALTIME_TRANSPORT_VERSION,
        scope.surface,
        scope.organizationId,
        scope.stream,
        shardIndex,
    ])

export const isRealtimeBrokerScope = (
    value: unknown,
): value is TRealtimeBrokerScope =>
    realtimeBrokerScopeSchema.safeParse(value).success

export const isRealtimeLeafScope = (
    value: unknown,
): value is TRealtimeLeafScope =>
    realtimeLeafScopeSchema.safeParse(value).success

export const isRealtimeTransportAttachment = (
    value: unknown,
): value is TRealtimeTransportAttachment =>
    realtimeTransportAttachmentSchema.safeParse(value).success

export const isRealtimeRevocationDirective = (
    value: unknown,
): value is TRealtimeRevocationDirective =>
    realtimeRevocationDirectiveSchema.safeParse(value).success

export const isRealtimeAudience = (
    value: unknown,
): value is TRealtimeAudience => realtimeAudienceSchema.safeParse(value).success

export const runBoundedTasks = async <T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number,
    deadlineMs: number,
): Promise<Array<TBoundedTaskResult<T>>> => {
    if (!Number.isFinite(concurrency) || !Number.isFinite(deadlineMs)) {
        return tasks.map(() => ({
            status: 'rejected',
            reason: new Error('Invalid WebSocket fan-out configuration.'),
        }))
    }

    const results = new Array<TBoundedTaskResult<T>>(tasks.length)
    const deadlineAt = Date.now() + deadlineMs
    let nextIndex = 0

    const runWithDeadline = async (task: () => Promise<T>) => {
        const remainingMs = deadlineAt - Date.now()

        if (remainingMs <= 0) throw new Error('WebSocket fan-out timed out.')

        let timer: ReturnType<typeof setTimeout> | undefined

        try {
            return await Promise.race([
                task(),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('WebSocket fan-out timed out.')),
                        remainingMs,
                    )
                }),
            ])
        } finally {
            if (timer) clearTimeout(timer)
        }
    }

    const worker = async () => {
        while (nextIndex < tasks.length) {
            const taskIndex = nextIndex
            nextIndex += 1

            try {
                results[taskIndex] = {
                    status: 'fulfilled',
                    value: await runWithDeadline(tasks[taskIndex]),
                }
            } catch (reason) {
                results[taskIndex] = {
                    status: 'rejected',
                    reason,
                }
            }
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(Math.max(1, concurrency), tasks.length) },
            () => worker(),
        ),
    )

    return results
}
