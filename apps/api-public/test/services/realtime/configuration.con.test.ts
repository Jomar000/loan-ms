import { describe, expect, it } from 'vitest'

import {
    validatePublicRealtimeConfiguration,
    validatePublicRealtimeStartupConfiguration,
} from '../../../src/services/realtime/configuration.js'

const linkedProfile = {
    direction: 'bidirectional',
    kind: 'shared-auth-events',
} as const

describe('Public realtime configuration', () => {
    it('accepts omitted optional capabilities for standalone profiles.', () => {
        expect(() => validatePublicRealtimeConfiguration({})).not.toThrow()
        expect(() =>
            validatePublicRealtimeConfiguration(
                {},
                { kind: 'local-only', surface: 'public' },
            ),
        ).not.toThrow()
    })

    it('rejects every enabled capability that is missing.', () => {
        expect(() =>
            validatePublicRealtimeConfiguration(
                {},
                { kind: 'shared-auth-security-only' },
            ),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validatePublicRealtimeConfiguration(
                { HYPERIONPUB_DO_WSB_REMOTE_BOFC: {} },
                {
                    direction: 'public-to-backoffice',
                    kind: 'shared-auth-events',
                },
            ),
        ).toThrow(/realtime publisher capability/)
        expect(() =>
            validatePublicRealtimeConfiguration(
                {
                    HYPERIONPUB_DO_WSB_REMOTE_BOFC: {},
                    HYPERIONPUB_REALTIME_PUBLISHER_BOFC: {},
                },
                {
                    direction: 'public-to-backoffice',
                    kind: 'shared-auth-events',
                },
            ),
        ).not.toThrow()
    })

    it('skips startup validation only while explicitly down.', () => {
        expect(() =>
            validatePublicRealtimeStartupConfiguration(
                { STATUS: 'down' },
                linkedProfile,
            ),
        ).not.toThrow()
        expect(() =>
            validatePublicRealtimeStartupConfiguration(
                { STATUS: 'up' },
                linkedProfile,
            ),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validatePublicRealtimeStartupConfiguration({}, linkedProfile),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validatePublicRealtimeStartupConfiguration(
                { STATUS: 'maintenance' },
                linkedProfile,
            ),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validatePublicRealtimeStartupConfiguration(
                {
                    HYPERIONPUB_DO_WSB_REMOTE_BOFC: {},
                    HYPERIONPUB_REALTIME_PUBLISHER_BOFC: {},
                    STATUS: 'up',
                },
                linkedProfile,
            ),
        ).not.toThrow()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
