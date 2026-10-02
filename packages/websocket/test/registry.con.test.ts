import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
    APP_REALTIME_STREAM,
    createRealtimeRegistry,
    createRealtimeTargetAuthorizer,
    defineRealtimeEvent,
    defineRealtimeStream,
    resolveRealtimeAdmission,
    type TRealtimeAdmissionContext,
} from '../src/registry.js'

const admissionContext: TRealtimeAdmissionContext = {
    authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e5',
    connectionId: '0198ef86-e6ab-7da4-98d3-57e3101779e4',
    identityId: 'identity-a',
    organizationId: 'organization-a',
    roles: ['member'],
    sessionExpiresAt: Date.now() + 60_000,
    surface: 'public',
}

const createTestRegistry = () =>
    createRealtimeRegistry({
        appEvents: {
            APP_UPDATED: defineRealtimeEvent({
                audiences: [
                    'organization',
                    'identity',
                ],
                delivery: 'organization',
                payloadSchema: z.object({
                    value: z.string().trim(),
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
                            value: z.number(),
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

describe('realtime stream registry', () => {
    it('always provides APP and supports typed dedicated extensions.', () => {
        const registry = createTestRegistry()

        expect(registry.getStream(' app ')).toMatchObject({
            kind: 'app',
            wireName: APP_REALTIME_STREAM,
        })
        expect(registry.getEvent('APP', 'APP_UPDATED')).toBeDefined()
        expect(registry.getStream('game')).toMatchObject({
            authorizationPolicy: 'game_member',
            kind: 'dedicated',
            metricsLabel: 'game',
            recoveryPolicy: 'game_queries',
            wireName: 'GAME',
        })
    })

    it('fails startup when a dedicated authorization policy is unwired.', () => {
        const registry = createTestRegistry()

        expect(() => createRealtimeTargetAuthorizer(registry, {})).toThrow(
            /missing realtime target authorization policy "game_member"/i,
        )
        expect(() =>
            createRealtimeTargetAuthorizer(registry, {
                game_member: () => true,
            }),
        ).not.toThrow()
    })

    it('normalizes dedicated targets through the stream schema.', () => {
        const registry = createTestRegistry()

        expect(registry.normalizeTarget('game', ' game-a ')).toEqual({
            success: true,
            target: 'GAME-A',
        })
        expect(registry.normalizeTarget('GAME', ' game-b ')).toEqual({
            success: true,
            target: 'GAME-B',
        })
        expect(registry.normalizeTarget('APP', 'game-a')).toEqual({
            success: false,
        })

        const invalidOutputRegistry = createRealtimeRegistry({
            streams: [
                defineRealtimeStream({
                    authorizationPolicy: 'game_member',
                    events: {},
                    idleRetentionMs: 0,
                    kind: 'dedicated',
                    metricsLabel: 'game',
                    recoveryPolicy: 'game_queries',
                    targetSchema: z.string().transform(() => ''),
                    wireName: 'GAME',
                }),
            ],
        })

        expect(invalidOutputRegistry.normalizeTarget('GAME', 'game-a')).toEqual(
            { success: false },
        )
    })

    it('rejects invalid and duplicate registry definitions.', () => {
        expect(() =>
            createRealtimeRegistry({
                streams: [
                    defineRealtimeStream({
                        authorizationPolicy: 'game_member',
                        events: {},
                        idleRetentionMs: 0,
                        kind: 'dedicated',
                        metricsLabel: 'game',
                        recoveryPolicy: 'game_queries',
                        targetSchema: z.string(),
                        wireName: 'APP',
                    }),
                ],
            }),
        ).toThrow(/reserved/i)
        expect(() =>
            createRealtimeRegistry({
                streams: [
                    defineRealtimeStream({
                        authorizationPolicy: 'game_member',
                        events: {},
                        idleRetentionMs: 0,
                        kind: 'dedicated',
                        metricsLabel: 'game',
                        recoveryPolicy: 'game_queries',
                        targetSchema: z.string(),
                        wireName: 'GAME',
                    }),
                    defineRealtimeStream({
                        authorizationPolicy: 'game_member',
                        events: {},
                        idleRetentionMs: 0,
                        kind: 'dedicated',
                        metricsLabel: 'game_secondary',
                        recoveryPolicy: 'game_queries',
                        targetSchema: z.string(),
                        wireName: 'GAME',
                    }),
                ],
            }),
        ).toThrow(/duplicate/i)
        expect(() =>
            createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: defineRealtimeEvent({
                        audiences: [
                            'organization',
                            'organization',
                        ],
                        delivery: 'organization',
                        payloadSchema: z.unknown(),
                    }),
                },
            }),
        ).toThrow(/invalid audiences/i)
        expect(() =>
            createRealtimeRegistry({
                streams: [
                    defineRealtimeStream({
                        authorizationPolicy: 'game_member',
                        events: {},
                        idleRetentionMs: -1,
                        kind: 'dedicated',
                        metricsLabel: 'game',
                        recoveryPolicy: 'game_queries',
                        targetSchema: z.string(),
                        wireName: 'GAME',
                    }),
                ],
            }),
        ).toThrow(/invalid idle retention/i)
    })

    it('fails fast for malformed runtime event and target schemas.', () => {
        expect(() =>
            createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: {
                        audiences: ['organization'],
                        delivery: 'invalid',
                        payloadSchema: z.unknown(),
                    },
                } as never,
            }),
        ).toThrow(/invalid delivery/i)
        expect(() =>
            createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: {
                        audiences: ['organization'],
                        delivery: 'organization',
                    },
                } as never,
            }),
        ).toThrow(/invalid payload schema/i)
        expect(() =>
            createRealtimeRegistry({
                appEvents: {
                    APP_UPDATED: {
                        audiences: ['organization'],
                        delivery: 'organization',
                        payloadSchema: {
                            safeParse: () => ({ success: true }),
                        },
                    },
                } as never,
            }),
        ).toThrow(/invalid payload schema/i)
        expect(() =>
            createRealtimeRegistry({
                streams: [
                    {
                        authorizationPolicy: 'game_member',
                        events: {},
                        idleRetentionMs: 0,
                        kind: 'dedicated',
                        metricsLabel: 'game',
                        recoveryPolicy: 'game_queries',
                        targetSchema: {
                            safeParse: () => ({ success: true }),
                        },
                        wireName: 'GAME',
                    },
                ] as never,
            }),
        ).toThrow(/invalid target schema/i)
    })

    it('allows organization-delivery APP events with every audience kind.', () => {
        const registry = createRealtimeRegistry({
            appEvents: {
                APP_SCOPED: defineRealtimeEvent({
                    audiences: [
                        'organization',
                        'identity',
                        'role',
                    ],
                    delivery: 'organization',
                    payloadSchema: z.unknown(),
                }),
            },
        })

        expect(registry.getEvent('APP', 'APP_SCOPED')).toMatchObject({
            audiences: [
                'organization',
                'identity',
                'role',
            ],
            delivery: 'organization',
        })
    })

    it('rejects APP events with target delivery.', () => {
        for (const delivery of [
            'target',
            'both',
        ] as const) {
            expect(() =>
                createRealtimeRegistry({
                    appEvents: {
                        APP_TARGETED: defineRealtimeEvent({
                            audiences: ['organization'],
                            delivery,
                            payloadSchema: z.unknown(),
                        }),
                    },
                }),
            ).toThrow('APP realtime events must use organization delivery.')
        }
    })

    it('admits APP only from trusted context without a target.', async () => {
        const registry = createTestRegistry()

        await expect(
            resolveRealtimeAdmission({
                context: admissionContext,
                registry,
                stream: 'app',
            }),
        ).resolves.toMatchObject({
            success: true,
            context: admissionContext,
            stream: {
                wireName: 'APP',
            },
            target: null,
        })
        await expect(
            resolveRealtimeAdmission({
                context: admissionContext,
                registry,
                stream: 'APP',
                target: 'unexpected',
            }),
        ).resolves.toEqual({
            success: false,
            code: 'REALTIME_TARGET_UNEXPECTED',
        })
    })

    it('normalizes and authorizes dedicated targets after stream lookup.', async () => {
        const registry = createTestRegistry()
        const authorizeTarget = vi.fn(() => true)

        await expect(
            resolveRealtimeAdmission({
                authorizeTarget,
                context: admissionContext,
                registry,
                stream: 'game',
                target: ' game-a ',
            }),
        ).resolves.toMatchObject({
            success: true,
            target: 'GAME-A',
        })
        expect(authorizeTarget).toHaveBeenCalledWith(
            expect.objectContaining({
                context: admissionContext,
                target: 'GAME-A',
            }),
        )
        await expect(
            resolveRealtimeAdmission({
                context: admissionContext,
                registry,
                stream: 'UNKNOWN',
                target: 'game-a',
            }),
        ).resolves.toEqual({
            success: false,
            code: 'REALTIME_UNKNOWN_STREAM',
        })
        await expect(
            resolveRealtimeAdmission({
                context: admissionContext,
                registry,
                stream: 'GAME',
                target: 'game-a',
            }),
        ).resolves.toEqual({
            success: false,
            code: 'REALTIME_TARGET_FORBIDDEN',
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
