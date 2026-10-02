import { z } from 'zod'

import { APP_REALTIME_STREAM } from './constants.js'
import {
    realtimeEventAudiencesSchema,
    realtimeEventNameSchema,
    realtimeIdleRetentionSchema,
    realtimeMetricsLabelSchema,
    realtimeStreamNameSchema,
    realtimeTargetSchema,
} from './schemas.js'
import type {
    TAuthorizeRealtimeTarget,
    TRealtimeAdmission,
    TRealtimeAdmissionContext,
    TRealtimeAppStreamDefinition,
    TRealtimeDedicatedStreamDefinition,
    TRealtimeEventDefinition,
    TRealtimeEventDefinitions,
    TRealtimeRegistry,
    TRealtimeStreamDefinition,
    TRealtimeTargetAuthorizationHandlers,
} from './types.js'

export {
    APP_REALTIME_STREAM,
    REALTIME_STREAM_NAME_MAX_LENGTH,
    REALTIME_TARGET_MAX_LENGTH,
} from './constants.js'
export {
    realtimeAudienceKindSchema,
    realtimeEventNameSchema,
    realtimeMetricsLabelSchema,
    realtimeStreamNameSchema,
    realtimeTargetSchema,
} from './schemas.js'
export type {
    TAuthorizeRealtimeTarget,
    TRealtimeAdmission,
    TRealtimeAdmissionContext,
    TRealtimeAppStreamDefinition,
    TRealtimeAudienceKind,
    TRealtimeDedicatedStreamDefinition,
    TRealtimeEventDefinition,
    TRealtimeEventDefinitions,
    TRealtimeRegistry,
    TRealtimeStreamDefinition,
    TRealtimeTargetAuthorizationHandler,
    TRealtimeTargetAuthorizationHandlers,
} from './types.js'

type TRealtimeNameSchema = {
    safeParse: (value: unknown) => {
        success: boolean
    }
}

const realtimeEventDeliverySchema = z.enum([
    'both',
    'organization',
    'target',
])

export const normalizeRealtimeStreamName = (stream: string) =>
    stream.trim().toUpperCase()

const assertBoundedName = (
    kind: string,
    value: string,
    schema: TRealtimeNameSchema,
) => {
    if (!schema.safeParse(value).success) {
        throw new Error(`Invalid realtime ${kind} "${value}".`)
    }
}

const assertEventDefinitions = (events: TRealtimeEventDefinitions) => {
    for (const [
        event,
        definition,
    ] of Object.entries(events)) {
        assertBoundedName('event', event, realtimeEventNameSchema)

        if (
            !definition ||
            !realtimeEventDeliverySchema.safeParse(definition.delivery).success
        ) {
            throw new Error(`Realtime event "${event}" has invalid delivery.`)
        }

        if (!(definition.payloadSchema instanceof z.ZodType)) {
            throw new Error(
                `Realtime event "${event}" has an invalid payload schema.`,
            )
        }

        if (
            !realtimeEventAudiencesSchema.safeParse(definition.audiences)
                .success
        ) {
            throw new Error(`Realtime event "${event}" has invalid audiences.`)
        }
    }
}

export const defineRealtimeEvent = <
    const TDefinition extends TRealtimeEventDefinition,
>(
    definition: TDefinition,
) => definition

export const defineRealtimeStream = <
    const TDefinition extends TRealtimeDedicatedStreamDefinition,
>(
    definition: TDefinition,
) => definition

export const createRealtimeRegistry = (options?: {
    appEvents?: TRealtimeEventDefinitions
    streams?: readonly TRealtimeDedicatedStreamDefinition[]
}): TRealtimeRegistry => {
    const appStream: TRealtimeAppStreamDefinition = {
        events: options?.appEvents ?? {},
        idleRetentionMs: 0,
        kind: 'app',
        metricsLabel: 'app',
        recoveryPolicy: 'active_tenant',
        wireName: APP_REALTIME_STREAM,
    }
    const streams: TRealtimeStreamDefinition[] = [
        appStream,
        ...(options?.streams ?? []),
    ]
    const streamMap = new Map<string, TRealtimeStreamDefinition>()
    const targetSchemaCache = new WeakMap<
        TRealtimeDedicatedStreamDefinition,
        z.ZodType<string>
    >()

    for (const stream of streams) {
        assertBoundedName('stream', stream.wireName, realtimeStreamNameSchema)
        assertBoundedName(
            'metrics label',
            stream.metricsLabel,
            realtimeMetricsLabelSchema,
        )
        assertBoundedName(
            'recovery policy',
            stream.recoveryPolicy,
            realtimeMetricsLabelSchema,
        )
        assertEventDefinitions(stream.events)

        if (
            stream.kind === 'app' &&
            Object.values(stream.events).some(
                (definition) => definition.delivery !== 'organization',
            )
        ) {
            throw new Error(
                'APP realtime events must use organization delivery.',
            )
        }

        if (
            stream.kind === 'dedicated' &&
            stream.wireName === APP_REALTIME_STREAM
        ) {
            throw new Error('APP is reserved for the built-in realtime stream.')
        }

        if (stream.kind === 'dedicated') {
            if (!(stream.targetSchema instanceof z.ZodType)) {
                throw new Error(
                    `Realtime stream "${stream.wireName}" has an invalid target schema.`,
                )
            }

            assertBoundedName(
                'authorization policy',
                stream.authorizationPolicy,
                realtimeMetricsLabelSchema,
            )
        }

        if (streamMap.has(stream.wireName)) {
            throw new Error(`Duplicate realtime stream "${stream.wireName}".`)
        }

        if (
            !realtimeIdleRetentionSchema.safeParse(stream.idleRetentionMs)
                .success
        ) {
            throw new Error(
                `Realtime stream "${stream.wireName}" has an invalid idle retention.`,
            )
        }

        streamMap.set(stream.wireName, stream)
    }

    return {
        getEvent: (stream, event) =>
            streamMap.get(normalizeRealtimeStreamName(stream))?.events[event],
        getStream: (stream) =>
            streamMap.get(normalizeRealtimeStreamName(stream)),
        normalizeTarget: (streamName, target) => {
            const stream = streamMap.get(
                normalizeRealtimeStreamName(streamName),
            )

            if (!stream || stream.kind !== 'dedicated') {
                return { success: false }
            }

            let targetSchema = targetSchemaCache.get(stream)

            if (!targetSchema) {
                targetSchema = stream.targetSchema.pipe(realtimeTargetSchema)
                targetSchemaCache.set(stream, targetSchema)
            }

            const parsedTarget = targetSchema.safeParse(target)

            if (!parsedTarget.success) {
                return { success: false }
            }

            return {
                success: true,
                target: parsedTarget.data,
            }
        },
        streams,
    }
}

export const builtInRealtimeRegistry = createRealtimeRegistry()

export const createRealtimeTargetAuthorizer = (
    registry: TRealtimeRegistry,
    handlers: TRealtimeTargetAuthorizationHandlers,
): TAuthorizeRealtimeTarget => {
    for (const stream of registry.streams) {
        if (
            stream.kind === 'dedicated' &&
            handlers[stream.authorizationPolicy] === undefined
        ) {
            throw new Error(
                `Missing realtime target authorization policy "${stream.authorizationPolicy}".`,
            )
        }
    }

    return (input) => {
        const handler = handlers[input.stream.authorizationPolicy]

        return handler ? handler(input) : false
    }
}

export const resolveRealtimeAdmission = async (input: {
    authorizeTarget?: TAuthorizeRealtimeTarget
    context: TRealtimeAdmissionContext
    registry: TRealtimeRegistry
    stream: string
    target?: string | null
}): Promise<TRealtimeAdmission> => {
    const stream = input.registry.getStream(input.stream)

    if (!stream) {
        return {
            success: false,
            code: 'REALTIME_UNKNOWN_STREAM',
        }
    }

    if (stream.kind === 'app') {
        if (input.target !== undefined && input.target !== null) {
            return {
                success: false,
                code: 'REALTIME_TARGET_UNEXPECTED',
            }
        }

        return {
            success: true,
            context: input.context,
            stream,
            target: null,
        }
    }

    if (input.target === undefined || input.target === null) {
        return {
            success: false,
            code: 'REALTIME_TARGET_REQUIRED',
        }
    }

    const normalizedTarget = input.registry.normalizeTarget(
        stream.wireName,
        input.target,
    )

    if (!normalizedTarget.success) {
        return {
            success: false,
            code: 'REALTIME_TARGET_INVALID',
        }
    }

    if (
        !input.authorizeTarget ||
        !(await input.authorizeTarget({
            context: input.context,
            stream,
            target: normalizedTarget.target,
        }))
    ) {
        return {
            success: false,
            code: 'REALTIME_TARGET_FORBIDDEN',
        }
    }

    return {
        success: true,
        context: input.context,
        stream,
        target: normalizedTarget.target,
    }
}
