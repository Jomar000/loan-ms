import { describe, expect, it } from 'vitest'

import {
    validateBackofficeRealtimeConfiguration,
    validateBackofficeRealtimeStartupConfiguration,
} from '../../../src/services/realtime/configuration.js'

const linkedProfile = {
    direction: 'bidirectional',
    kind: 'shared-auth-events',
} as const

describe('Backoffice realtime configuration', () => {
    it('accepts omitted optional capabilities for standalone profiles.', () => {
        expect(() => validateBackofficeRealtimeConfiguration({})).not.toThrow()
        expect(() =>
            validateBackofficeRealtimeConfiguration(
                {},
                { kind: 'local-only', surface: 'backoffice' },
            ),
        ).not.toThrow()
    })

    it('rejects every enabled capability that is missing.', () => {
        expect(() =>
            validateBackofficeRealtimeConfiguration(
                {},
                { kind: 'shared-auth-security-only' },
            ),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validateBackofficeRealtimeConfiguration(
                { HYPERIONBOFC_DO_WSB_REMOTE_PUB: {} },
                {
                    direction: 'backoffice-to-public',
                    kind: 'shared-auth-events',
                },
            ),
        ).toThrow(/realtime publisher capability/)
        expect(() =>
            validateBackofficeRealtimeConfiguration(
                {
                    HYPERIONBOFC_DO_WSB_REMOTE_PUB: {},
                    HYPERIONBOFC_REALTIME_PUBLISHER_PUB: {},
                },
                {
                    direction: 'backoffice-to-public',
                    kind: 'shared-auth-events',
                },
            ),
        ).not.toThrow()
    })

    it('skips startup validation only while explicitly down.', () => {
        expect(() =>
            validateBackofficeRealtimeStartupConfiguration(
                { STATUS: 'down' },
                linkedProfile,
            ),
        ).not.toThrow()
        expect(() =>
            validateBackofficeRealtimeStartupConfiguration(
                { STATUS: 'up' },
                linkedProfile,
            ),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validateBackofficeRealtimeStartupConfiguration({}, linkedProfile),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validateBackofficeRealtimeStartupConfiguration(
                { STATUS: 'maintenance' },
                linkedProfile,
            ),
        ).toThrow(/remote broker capability/)
        expect(() =>
            validateBackofficeRealtimeStartupConfiguration(
                {
                    HYPERIONBOFC_DO_WSB_REMOTE_PUB: {},
                    HYPERIONBOFC_REALTIME_PUBLISHER_PUB: {},
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
