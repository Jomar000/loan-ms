import {
    APP_REALTIME_STREAM,
    REALTIME_JSON_MAX_DEPTH,
    REALTIME_JSON_MAX_MEMBERS,
    REALTIME_SERVER_FRAME_MAX_BYTES,
    REALTIME_WIRE_VERSION,
} from './constants.js'
import { normalizeRealtimeStreamName } from './registry.js'
import { realtimeServerFrameSchema } from './schemas.js'
import type {
    TCanonicalRealtimeFrame,
    TRealtimeFrameParseResult,
    TRealtimeGapFrame,
    TRealtimeRegistry,
    TRealtimeServerFrame,
} from './types.js'

export {
    REALTIME_JSON_MAX_DEPTH,
    REALTIME_JSON_MAX_MEMBERS,
    REALTIME_SERVER_FRAME_MAX_BYTES,
    REALTIME_WIRE_VERSION,
} from './constants.js'
export {
    realtimeErrorFrameSchema,
    realtimeEventFrameSchema,
    realtimeGapFrameSchema,
    realtimeReadyFrameSchema,
    realtimeSequenceSchema,
    realtimeServerFrameSchema,
} from './schemas.js'
export type {
    TCanonicalRealtimeFrame,
    TRealtimeErrorFrame,
    TRealtimeEventFrame,
    TRealtimeFrameParseResult,
    TRealtimeGapFrame,
    TRealtimeReadyFrame,
    TRealtimeServerFrame,
} from './types.js'

const textEncoder = new TextEncoder()

const isJsonComplexityValid = (value: unknown) => {
    const queue = [
        {
            depth: 0,
            value,
        },
    ]
    let memberCount = 0

    while (queue.length > 0) {
        const current = queue.pop()

        if (!current) break
        if (current.depth > REALTIME_JSON_MAX_DEPTH) return false
        if (!current.value || typeof current.value !== 'object') continue

        const values = Array.isArray(current.value)
            ? current.value
            : Object.values(current.value)
        memberCount += values.length

        if (memberCount > REALTIME_JSON_MAX_MEMBERS) return false

        for (const nestedValue of values) {
            queue.push({
                depth: current.depth + 1,
                value: nestedValue,
            })
        }
    }

    return true
}

const validateFrameRegistryContract = (
    registry: TRealtimeRegistry,
    frame: TRealtimeServerFrame,
): TRealtimeFrameParseResult => {
    if (frame.type === 'ERROR') {
        return {
            success: true,
            data: frame,
        }
    }

    const stream = registry.getStream(frame.stream)

    if (!stream) {
        return {
            success: false,
            error: 'UNKNOWN_STREAM',
        }
    }

    let normalizedTarget: string | undefined

    if (stream.kind === 'app') {
        if (frame.target !== undefined) {
            return {
                success: false,
                error: 'FRAME_INVALID',
            }
        }
    } else if (frame.target !== undefined) {
        const target = registry.normalizeTarget(stream.wireName, frame.target)

        if (!target.success) {
            return {
                success: false,
                error: 'FRAME_INVALID',
            }
        }

        normalizedTarget = target.target
    } else if (frame.type !== 'EVENT') {
        return {
            success: false,
            error: 'FRAME_INVALID',
        }
    }

    if (frame.type !== 'EVENT') {
        return {
            success: true,
            data: {
                ...frame,
                stream: stream.wireName,
                ...(normalizedTarget === undefined
                    ? {}
                    : { target: normalizedTarget }),
            },
        }
    }

    const event = registry.getEvent(stream.wireName, frame.event)

    if (!event) {
        return {
            success: false,
            error: 'UNKNOWN_EVENT',
        }
    }

    if (
        (event.delivery === 'organization' && frame.target !== undefined) ||
        (event.delivery === 'target' && frame.target === undefined)
    ) {
        return {
            success: false,
            error: 'FRAME_INVALID',
        }
    }

    const payload = event.payloadSchema.safeParse(frame.payload)

    if (!payload.success) {
        return {
            success: false,
            error: 'FRAME_INVALID',
        }
    }

    return {
        success: true,
        data: {
            ...frame,
            payload: payload.data,
            stream: stream.wireName,
            ...(normalizedTarget === undefined
                ? {}
                : { target: normalizedTarget }),
        },
    }
}

export const validateRealtimeServerFrame = (
    registry: TRealtimeRegistry,
    input: unknown,
): TRealtimeFrameParseResult => {
    if (!isJsonComplexityValid(input)) {
        return {
            success: false,
            error: 'FRAME_COMPLEXITY_EXCEEDED',
        }
    }

    const frame = realtimeServerFrameSchema.safeParse(input)

    if (!frame.success) {
        return {
            success: false,
            error: 'FRAME_INVALID',
        }
    }

    return validateFrameRegistryContract(registry, frame.data)
}

export const parseRealtimeServerFrame = (
    registry: TRealtimeRegistry,
    serializedFrame: string,
): TRealtimeFrameParseResult => {
    if (
        textEncoder.encode(serializedFrame).byteLength >
        REALTIME_SERVER_FRAME_MAX_BYTES
    ) {
        return {
            success: false,
            error: 'FRAME_TOO_LARGE',
        }
    }

    let input: unknown

    try {
        input = JSON.parse(serializedFrame)
    } catch {
        return {
            success: false,
            error: 'FRAME_INVALID',
        }
    }

    return validateRealtimeServerFrame(registry, input)
}

export const serializeRealtimeServerFrame = (
    registry: TRealtimeRegistry,
    input: unknown,
): TCanonicalRealtimeFrame => {
    const parsedFrame = validateRealtimeServerFrame(registry, input)

    if (!parsedFrame.success) {
        throw new Error(`Invalid realtime frame: ${parsedFrame.error}.`)
    }

    return serializeValidatedRealtimeServerFrame(parsedFrame.data)
}

export const serializeValidatedRealtimeServerFrame = (
    frame: TRealtimeServerFrame,
): TCanonicalRealtimeFrame => {
    const serializedFrame = JSON.stringify(frame)
    const frameBytes = textEncoder.encode(serializedFrame).byteLength

    if (frameBytes > REALTIME_SERVER_FRAME_MAX_BYTES) {
        throw new Error('Realtime frame exceeds the server frame limit.')
    }

    return {
        frame,
        frameBytes,
        serializedFrame,
    }
}

export const hasRealtimeWireVersion = (headerValue: string | null) =>
    headerValue
        ?.split(',')
        .some((wireVersion) => wireVersion.trim() === REALTIME_WIRE_VERSION) ??
    false

export const createRealtimeGapFrame = (input: {
    expected: bigint
    received: bigint
    stream: string
    target?: string
}): TRealtimeGapFrame => ({
    expected: input.expected.toString(),
    received: input.received.toString(),
    stream: normalizeRealtimeStreamName(input.stream),
    ...(input.target === undefined ? {} : { target: input.target }),
    type: 'GAP',
})

export const isAppRealtimeFrame = (frame: TRealtimeServerFrame) =>
    frame.type === 'ERROR' ||
    ('stream' in frame && frame.stream === APP_REALTIME_STREAM)
