import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
    isRealtimePublicationRouteAllowed,
    resolveRealtimePublication,
    type TRealtimePublicationDescriptor,
} from '../src/publisher.js'
import {
    createRealtimeRegistry,
    defineRealtimeEvent,
    defineRealtimeStream,
} from '../src/registry.js'
import type {
    TRealtimeSurface,
    TRealtimeTopologyProfile,
} from '../src/topology.js'

const registry = createRealtimeRegistry({
    appEvents: {
        SYNTHETIC_CHANGED: defineRealtimeEvent({
            audiences: ['organization'],
            delivery: 'organization',
            payloadSchema: z.object({
                visibleLabel: z.string(),
            }),
        }),
        SYNTHETIC_RAW: defineRealtimeEvent({
            audiences: ['organization'],
            delivery: 'organization',
            payloadSchema: z.unknown(),
        }),
        SYNTHETIC_SCOPED: defineRealtimeEvent({
            audiences: [
                'identity',
                'role',
            ],
            delivery: 'organization',
            payloadSchema: z.object({
                value: z.number(),
            }),
        }),
    },
    streams: [
        defineRealtimeStream({
            authorizationPolicy: 'synthetic_member',
            events: {
                SYNTHETIC_TARGET_CHANGED: defineRealtimeEvent({
                    audiences: [
                        'organization',
                        'identity',
                        'role',
                    ],
                    delivery: 'target',
                    payloadSchema: z.object({
                        value: z.number().int(),
                    }),
                }),
            },
            idleRetentionMs: 0,
            kind: 'dedicated',
            metricsLabel: 'synthetic',
            recoveryPolicy: 'synthetic_queries',
            targetSchema: z.string().trim().toUpperCase(),
            wireName: 'SYNTHETIC',
        }),
    ],
})

const profile = {
    direction: 'bidirectional',
    kind: 'shared-auth-events',
} as const satisfies TRealtimeTopologyProfile

const descriptor: TRealtimePublicationDescriptor = {
    audience: { kind: 'organization' },
    destinationSurface: 'backoffice',
    event: 'SYNTHETIC_CHANGED',
    eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
    occurredAt: '2026-07-27T12:00:00.000+08:00',
    organizationId: 'organization-1',
    payload: { visibleLabel: 'projected for backoffice' },
    sourceSurface: 'public',
    stream: 'APP',
    target: null,
}

describe('Realtime publication contract', () => {
    it('normalizes broker input without mutating the caller descriptor.', () => {
        const callerDescriptor = {
            ...descriptor,
            audience: {
                kind: 'organization',
                unexpectedAudienceProperty: true,
            },
            event: 'SYNTHETIC_TARGET_CHANGED',
            payload: { value: 1 },
            stream: 'synthetic',
            target: ' synthetic-1 ',
            unexpectedDescriptorProperty: true,
        } as TRealtimePublicationDescriptor & {
            unexpectedDescriptorProperty: boolean
        }
        const originalDescriptor = structuredClone(callerDescriptor)
        const result = resolveRealtimePublication({
            descriptor: callerDescriptor,
            localSurface: 'backoffice',
            origin: 'peer',
            profile,
            registry,
        })

        expect(callerDescriptor).toEqual(originalDescriptor)
        expect(result).toEqual({
            accepted: true,
            brokerInput: {
                audience: { kind: 'organization' },
                event: 'SYNTHETIC_TARGET_CHANGED',
                eventId: descriptor.eventId,
                occurredAt: descriptor.occurredAt,
                payload: { value: 1 },
                scope: {
                    organizationId: descriptor.organizationId,
                    stream: 'SYNTHETIC',
                    surface: 'backoffice',
                    storageVersion: 1,
                },
                target: 'SYNTHETIC-1',
            },
            descriptor: {
                audience: { kind: 'organization' },
                destinationSurface: 'backoffice',
                event: 'SYNTHETIC_TARGET_CHANGED',
                eventId: descriptor.eventId,
                occurredAt: descriptor.occurredAt,
                organizationId: descriptor.organizationId,
                payload: { value: 1 },
                sourceSurface: 'public',
                stream: 'SYNTHETIC',
                target: 'SYNTHETIC-1',
            },
        })
    })

    it.each([
        {
            destinationSurface: 'public' as const,
            expected: true,
            profile: {
                kind: 'local-only',
                surface: 'public',
            } as const,
            sourceSurface: 'public' as const,
        },
        {
            destinationSurface: 'public' as const,
            expected: true,
            profile: { kind: 'independent-surfaces' } as const,
            sourceSurface: 'public' as const,
        },
        {
            destinationSurface: 'backoffice' as const,
            expected: true,
            profile: {
                direction: 'public-to-backoffice',
                kind: 'shared-auth-events',
            } as const,
            sourceSurface: 'public' as const,
        },
        {
            destinationSurface: 'public' as const,
            expected: false,
            profile: {
                direction: 'public-to-backoffice',
                kind: 'shared-auth-events',
            } as const,
            sourceSurface: 'backoffice' as const,
        },
        {
            destinationSurface: 'public' as const,
            expected: true,
            profile: {
                direction: 'backoffice-to-public',
                kind: 'shared-auth-events',
            } as const,
            sourceSurface: 'backoffice' as const,
        },
        {
            destinationSurface: 'backoffice' as const,
            expected: false,
            profile: {
                direction: 'backoffice-to-public',
                kind: 'shared-auth-events',
            } as const,
            sourceSurface: 'public' as const,
        },
        {
            destinationSurface: 'public' as const,
            expected: true,
            profile,
            sourceSurface: 'backoffice' as const,
        },
    ])(
        'resolves local and routed topology profiles.',
        ({
            destinationSurface,
            expected,
            profile: topology,
            sourceSurface,
        }) => {
            expect(
                isRealtimePublicationRouteAllowed({
                    destinationSurface,
                    profile: topology,
                    sourceSurface,
                }),
            ).toBe(expected)
        },
    )

    it('enforces the declared local or peer publication origin.', () => {
        expect(
            resolveRealtimePublication({
                descriptor: {
                    ...descriptor,
                    destinationSurface: 'public',
                },
                localSurface: 'public',
                origin: 'local',
                profile: { kind: 'independent-surfaces' },
                registry,
            }),
        ).toMatchObject({ accepted: true })
        expect(
            resolveRealtimePublication({
                descriptor,
                localSurface: 'backoffice',
                origin: 'local',
                profile,
                registry,
            }),
        ).toEqual({ accepted: false, code: 'SOURCE_MISMATCH' })
        expect(
            resolveRealtimePublication({
                descriptor,
                localSurface: 'backoffice',
                origin: 'peer',
                profile,
                registry,
            }),
        ).toMatchObject({ accepted: true })
        expect(
            resolveRealtimePublication({
                descriptor: {
                    ...descriptor,
                    sourceSurface: 'backoffice',
                },
                localSurface: 'backoffice',
                origin: 'peer',
                profile,
                registry,
            }),
        ).toEqual({ accepted: false, code: 'SOURCE_MISMATCH' })
    })

    it.each([
        {
            code: 'INVALID_SOURCE',
            patch: { sourceSurface: 'storefront' },
        },
        {
            code: 'INVALID_DESTINATION',
            patch: { destinationSurface: 'operations' },
        },
        {
            code: 'DESTINATION_MISMATCH',
            localSurface: 'public',
            patch: {},
        },
        {
            code: 'ROUTE_NOT_ALLOWED',
            patch: {},
            topology: { kind: 'independent-surfaces' },
        },
        {
            code: 'INVALID_ORGANIZATION',
            patch: { organizationId: '' },
        },
        {
            code: 'INVALID_STREAM',
            patch: { stream: 'INVENTED' },
        },
        {
            code: 'INVALID_EVENT',
            patch: { event: 'INVENTED_EVENT' },
        },
        {
            code: 'INVALID_AUDIENCE',
            patch: { audience: { kind: 'role', roles: [] } },
        },
        {
            code: 'INVALID_AUDIENCE',
            patch: {
                audience: {
                    kind: 'identity',
                    identityIds: [
                        'identity-1',
                        'identity-1',
                    ],
                },
                event: 'SYNTHETIC_SCOPED',
                payload: { value: 1 },
            },
        },
        {
            code: 'INVALID_AUDIENCE',
            patch: {
                audience: {
                    kind: 'role',
                    roles: [
                        'operator',
                        'operator',
                    ],
                },
                event: 'SYNTHETIC_SCOPED',
                payload: { value: 1 },
            },
        },
        {
            code: 'INVALID_AUDIENCE',
            patch: {
                audience: {
                    kind: 'role',
                    roles: ['r'.repeat(65)],
                },
                event: 'SYNTHETIC_SCOPED',
                payload: { value: 1 },
            },
        },
        {
            code: 'INVALID_AUDIENCE',
            patch: {
                audience: { kind: 'role', roles: ['operator'] },
            },
        },
        {
            code: 'INVALID_TARGET',
            patch: { target: 'unexpected' },
        },
        {
            code: 'INVALID_EVENT_ID',
            patch: { eventId: 'not-a-uuid' },
        },
        {
            code: 'INVALID_EVENT_ID',
            patch: { eventId: '550e8400-e29b-41d4-a716-446655440000' },
        },
        {
            code: 'INVALID_TIMESTAMP',
            patch: { occurredAt: 'yesterday' },
        },
    ])(
        'rejects $code descriptors.',
        ({ code, localSurface = 'backoffice', patch, topology = profile }) => {
            expect(
                resolveRealtimePublication({
                    descriptor: {
                        ...descriptor,
                        ...patch,
                    },
                    localSurface: localSurface as TRealtimeSurface,
                    origin: 'peer',
                    profile: topology as TRealtimeTopologyProfile,
                    registry,
                }),
            ).toEqual({ accepted: false, code })
        },
    )

    it('accepts transport-neutral identity and role audiences.', () => {
        for (const audience of [
            { identityIds: ['identity-1'], kind: 'identity' as const },
            { kind: 'role' as const, roles: ['operator'] },
        ]) {
            const result = resolveRealtimePublication({
                descriptor: {
                    ...descriptor,
                    audience,
                    event: 'SYNTHETIC_SCOPED',
                    payload: { value: 1 },
                },
                localSurface: 'backoffice',
                origin: 'peer',
                profile,
                registry,
            })

            expect(result).toMatchObject({
                accepted: true,
                brokerInput: { audience },
            })
        }
    })

    it('combines a dedicated target with identity and role audiences.', () => {
        for (const audience of [
            { identityIds: ['identity-1'], kind: 'identity' as const },
            { kind: 'role' as const, roles: ['operator'] },
        ]) {
            expect(
                resolveRealtimePublication({
                    descriptor: {
                        ...descriptor,
                        audience,
                        event: 'SYNTHETIC_TARGET_CHANGED',
                        payload: { value: 1 },
                        stream: 'SYNTHETIC',
                        target: ' synthetic-1 ',
                    },
                    localSurface: 'backoffice',
                    origin: 'peer',
                    profile,
                    registry,
                }),
            ).toMatchObject({
                accepted: true,
                brokerInput: {
                    audience,
                    target: 'SYNTHETIC-1',
                },
            })
        }
    })

    it('defers payload complexity validation to the destination broker.', () => {
        let payload: unknown = 'value'

        for (let index = 0; index < 18; index += 1) {
            payload = { nested: payload }
        }

        expect(
            resolveRealtimePublication({
                descriptor: {
                    ...descriptor,
                    event: 'SYNTHETIC_RAW',
                    payload,
                },
                localSurface: 'backoffice',
                origin: 'peer',
                profile,
                registry,
            }),
        ).toMatchObject({ accepted: true })
    })

    it('defers the canonical frame-size check to the destination broker.', () => {
        expect(
            resolveRealtimePublication({
                descriptor: {
                    ...descriptor,
                    event: 'SYNTHETIC_RAW',
                    payload: 'x'.repeat(8192),
                },
                localSurface: 'backoffice',
                origin: 'peer',
                profile,
                registry,
            }),
        ).toMatchObject({ accepted: true })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
