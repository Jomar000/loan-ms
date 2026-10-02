import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
    createRealtimeGapFrame,
    hasRealtimeWireVersion,
    isAppRealtimeFrame,
    parseRealtimeServerFrame,
    REALTIME_SERVER_FRAME_MAX_BYTES,
    REALTIME_WIRE_VERSION,
    serializeRealtimeServerFrame,
    validateRealtimeServerFrame,
} from '../src/protocol.js'
import {
    createRealtimeRegistry,
    defineRealtimeEvent,
    defineRealtimeStream,
} from '../src/registry.js'

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
    streams: [
        defineRealtimeStream({
            authorizationPolicy: 'game_member',
            events: {
                GAME_UPDATED: defineRealtimeEvent({
                    audiences: ['organization'],
                    delivery: 'target',
                    payloadSchema: z.object({
                        score: z.number().int(),
                    }),
                }),
            },
            idleRetentionMs: 30_000,
            kind: 'dedicated',
            metricsLabel: 'game',
            recoveryPolicy: 'game_queries',
            targetSchema: z.string().trim().toUpperCase(),
            wireName: 'GAME',
        }),
    ],
})

const baseEvent = {
    eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
    occurredAt: '2026-07-27T12:00:00.000+08:00',
    type: 'EVENT' as const,
}

describe('realtime wire protocol', () => {
    it('negotiates only the explicitly offered registered wire version.', () => {
        expect(hasRealtimeWireVersion(REALTIME_WIRE_VERSION)).toBe(true)
        expect(
            hasRealtimeWireVersion(`other.protocol, ${REALTIME_WIRE_VERSION}`),
        ).toBe(true)
        expect(hasRealtimeWireVersion('other.protocol')).toBe(false)
        expect(hasRealtimeWireVersion('hyperion.realtime.v1')).toBe(false)
        expect(hasRealtimeWireVersion(null)).toBe(false)
    })

    it('validates READY, EVENT, GAP, and ERROR frames.', () => {
        const frames = [
            {
                authorizationVersion: baseEvent.eventId,
                connectionId: baseEvent.eventId,
                wireVersion: REALTIME_WIRE_VERSION,
                stream: 'APP',
                type: 'READY',
            },
            {
                ...baseEvent,
                event: 'APP_UPDATED',
                payload: { label: 'ready' },
                sequence: '1',
                stream: 'APP',
            },
            createRealtimeGapFrame({
                expected: 2n,
                received: 3n,
                stream: 'APP',
            }),
            {
                code: 'RECOVERY_REQUIRED',
                recoverable: true,
                type: 'ERROR',
            },
        ]

        frames.forEach((frame) => {
            expect(validateRealtimeServerFrame(registry, frame)).toMatchObject({
                success: true,
            })
        })
    })

    it('classifies APP and transport-wide ERROR frames.', () => {
        expect(
            isAppRealtimeFrame({
                code: 'RECOVERY_REQUIRED',
                recoverable: true,
                type: 'ERROR',
            }),
        ).toBe(true)
        expect(
            isAppRealtimeFrame({
                ...baseEvent,
                event: 'APP_UPDATED',
                payload: { label: 'ready' },
                stream: 'APP',
            }),
        ).toBe(true)
        expect(
            isAppRealtimeFrame({
                ...baseEvent,
                event: 'GAME_UPDATED',
                payload: { score: 7 },
                stream: 'GAME',
                target: 'GAME-A',
            }),
        ).toBe(false)
    })

    it('requires authorization continuity and UUIDv7 event IDs.', () => {
        expect(
            validateRealtimeServerFrame(registry, {
                connectionId: baseEvent.eventId,
                wireVersion: REALTIME_WIRE_VERSION,
                stream: 'APP',
                type: 'READY',
            }),
        ).toEqual({
            success: false,
            error: 'FRAME_INVALID',
        })
        expect(
            validateRealtimeServerFrame(registry, {
                authorizationVersion: baseEvent.eventId,
                connectionId: baseEvent.eventId,
                protocol: 1,
                stream: 'APP',
                type: 'READY',
            }),
        ).toEqual({
            success: false,
            error: 'FRAME_INVALID',
        })
        expect(
            validateRealtimeServerFrame(registry, {
                ...baseEvent,
                event: 'APP_UPDATED',
                eventId: '8cb3f04c-2d42-4a4f-b3e9-414c3268f73f',
                payload: { label: 'ready' },
                stream: 'APP',
            }),
        ).toEqual({
            success: false,
            error: 'FRAME_INVALID',
        })
    })

    it('canonicalizes stream, target, and transformed payload exactly once.', () => {
        const canonical = serializeRealtimeServerFrame(registry, {
            ...baseEvent,
            event: 'GAME_UPDATED',
            payload: { score: 7 },
            stream: 'GAME',
            target: ' game-a ',
        })

        expect(canonical.frame).toEqual({
            ...baseEvent,
            event: 'GAME_UPDATED',
            payload: { score: 7 },
            stream: 'GAME',
            target: 'GAME-A',
        })
        expect(canonical.serializedFrame).toBe(JSON.stringify(canonical.frame))
        expect(
            new TextEncoder().encode(canonical.serializedFrame),
        ).toHaveLength(canonical.frameBytes)
    })

    it('rejects unknown streams, unknown events, and delivery mismatches.', () => {
        expect(
            validateRealtimeServerFrame(registry, {
                ...baseEvent,
                event: 'APP_UPDATED',
                payload: { label: 'ready' },
                stream: 'UNKNOWN',
            }),
        ).toEqual({
            success: false,
            error: 'UNKNOWN_STREAM',
        })
        expect(
            validateRealtimeServerFrame(registry, {
                ...baseEvent,
                event: 'UNKNOWN_EVENT',
                payload: {},
                stream: 'APP',
            }),
        ).toEqual({
            success: false,
            error: 'UNKNOWN_EVENT',
        })
        expect(
            validateRealtimeServerFrame(registry, {
                ...baseEvent,
                event: 'GAME_UPDATED',
                payload: { score: 7 },
                stream: 'GAME',
            }),
        ).toEqual({
            success: false,
            error: 'FRAME_INVALID',
        })
    })

    it('bounds serialized bytes and JSON complexity before dispatch.', () => {
        expect(
            parseRealtimeServerFrame(
                registry,
                'x'.repeat(REALTIME_SERVER_FRAME_MAX_BYTES + 1),
            ),
        ).toEqual({
            success: false,
            error: 'FRAME_TOO_LARGE',
        })

        let nested: unknown = 'value'

        for (let depth = 0; depth < 18; depth += 1) {
            nested = { nested }
        }

        expect(validateRealtimeServerFrame(registry, nested)).toEqual({
            success: false,
            error: 'FRAME_COMPLEXITY_EXCEEDED',
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
