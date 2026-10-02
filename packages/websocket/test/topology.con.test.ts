import { describe, expect, it } from 'vitest'

import {
    getRealtimeEventDestinations,
    getRealtimeRevocationDestinations,
    validateRealtimeTopologyCapabilities,
    type TRealtimeTopologyProfile,
} from '../src/topology.js'

describe('Realtime topology', () => {
    it.each([
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'public',
                },
            ],
            profile: {
                kind: 'local-only',
                surface: 'public',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'public',
                },
            ],
            profile: {
                kind: 'independent-surfaces',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'public',
                },
                {
                    delivery: 'remote',
                    surface: 'backoffice',
                },
            ],
            profile: {
                direction: 'public-to-backoffice',
                kind: 'shared-auth-events',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'public',
                },
                {
                    delivery: 'remote',
                    surface: 'backoffice',
                },
            ],
            profile: {
                direction: 'backoffice-to-public',
                kind: 'shared-auth-events',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'public',
                },
                {
                    delivery: 'remote',
                    surface: 'backoffice',
                },
            ],
            profile: {
                direction: 'bidirectional',
                kind: 'shared-auth-events',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'public',
                },
                {
                    delivery: 'remote',
                    surface: 'backoffice',
                },
            ],
            profile: {
                kind: 'shared-auth-security-only',
            },
        },
    ] satisfies Array<{
        expected: ReturnType<typeof getRealtimeRevocationDestinations>
        profile: TRealtimeTopologyProfile
    }>)(
        'derives revocation deliveries for $profile.kind.',
        ({ expected, profile }) => {
            expect(
                getRealtimeRevocationDestinations(profile, 'public'),
            ).toEqual(expected)
        },
    )

    it.each([
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'backoffice',
                },
            ],
            profile: {
                kind: 'local-only',
                surface: 'backoffice',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'backoffice',
                },
            ],
            profile: {
                kind: 'independent-surfaces',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'backoffice',
                },
                {
                    delivery: 'remote',
                    surface: 'public',
                },
            ],
            profile: {
                kind: 'shared-auth-security-only',
            },
        },
        {
            expected: [
                {
                    delivery: 'local',
                    surface: 'backoffice',
                },
                {
                    delivery: 'remote',
                    surface: 'public',
                },
            ],
            profile: {
                direction: 'bidirectional',
                kind: 'shared-auth-events',
            },
        },
    ] satisfies Array<{
        expected: ReturnType<typeof getRealtimeRevocationDestinations>
        profile: TRealtimeTopologyProfile
    }>)(
        'derives backoffice revocation deliveries for $profile.kind.',
        ({ expected, profile }) => {
            expect(
                getRealtimeRevocationDestinations(profile, 'backoffice'),
            ).toEqual(expected)
        },
    )

    it('derives only configured outgoing cross-surface event deliveries.', () => {
        const oneWay: TRealtimeTopologyProfile = {
            direction: 'public-to-backoffice',
            kind: 'shared-auth-events',
        }
        const bidirectional: TRealtimeTopologyProfile = {
            direction: 'bidirectional',
            kind: 'shared-auth-events',
        }

        expect(getRealtimeEventDestinations(oneWay, 'public')).toEqual([
            'backoffice',
        ])
        expect(getRealtimeEventDestinations(oneWay, 'backoffice')).toEqual([])
        expect(getRealtimeEventDestinations(bidirectional, 'public')).toEqual([
            'backoffice',
        ])
        expect(
            getRealtimeEventDestinations(bidirectional, 'backoffice'),
        ).toEqual(['public'])
    })

    it('keeps omitted capabilities valid for standalone profiles.', () => {
        expect(() =>
            validateRealtimeTopologyCapabilities({
                profile: {
                    kind: 'local-only',
                    surface: 'public',
                },
                surface: 'public',
            }),
        ).not.toThrow()
        expect(() =>
            validateRealtimeTopologyCapabilities({
                profile: {
                    kind: 'independent-surfaces',
                },
                surface: 'backoffice',
            }),
        ).not.toThrow()
    })

    it('fails when shared authorization enables a missing remote broker.', () => {
        expect(() =>
            validateRealtimeTopologyCapabilities({
                profile: {
                    kind: 'shared-auth-security-only',
                },
                surface: 'public',
            }),
        ).toThrow(/remote broker capability/i)
    })

    it('fails when an outgoing event edge enables a missing publisher.', () => {
        expect(() =>
            validateRealtimeTopologyCapabilities({
                capabilities: {
                    remoteBroker: {},
                },
                profile: {
                    direction: 'public-to-backoffice',
                    kind: 'shared-auth-events',
                },
                surface: 'public',
            }),
        ).toThrow(/realtime publisher capability/i)

        expect(() =>
            validateRealtimeTopologyCapabilities({
                capabilities: {
                    remoteBroker: {},
                },
                profile: {
                    direction: 'public-to-backoffice',
                    kind: 'shared-auth-events',
                },
                surface: 'backoffice',
            }),
        ).not.toThrow()
    })

    it('accepts every capability required by a linked surface.', () => {
        expect(() =>
            validateRealtimeTopologyCapabilities({
                capabilities: {
                    realtimePublisher: {},
                    remoteBroker: {},
                },
                profile: {
                    direction: 'bidirectional',
                    kind: 'shared-auth-events',
                },
                surface: 'public',
            }),
        ).not.toThrow()
    })

    it('rejects a surface excluded by a local-only profile.', () => {
        expect(() =>
            getRealtimeRevocationDestinations(
                {
                    kind: 'local-only',
                    surface: 'public',
                },
                'backoffice',
            ),
        ).toThrow(/does not enable/i)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
