import { realtimeEventNameSchema } from '@hyperion/websocket/registry'
import { describe, expect, it } from 'vitest'

import { EXTENSION_APP_REALTIME_REGISTRY } from '$lib/utilities/wsClientManager/registry.extension'
import { EXTENSION_APP_REALTIME_INVALIDATION_EVENTS } from './appRealtime.extension'

describe('APP realtime invalidation events', () => {
    it('lists unique, valid realtime event names', () => {
        for (const event of EXTENSION_APP_REALTIME_INVALIDATION_EVENTS) {
            expect(realtimeEventNameSchema.safeParse(event).success).toBe(true)
        }

        expect(new Set(EXTENSION_APP_REALTIME_INVALIDATION_EVENTS).size).toBe(
            EXTENSION_APP_REALTIME_INVALIDATION_EVENTS.length,
        )
    })

    it('lists only events the browser registry defines', () => {
        if (EXTENSION_APP_REALTIME_REGISTRY === undefined) {
            // The built-in registry defines no APP events, so the browser
            // would drop every listed event as UNKNOWN_EVENT.
            expect(EXTENSION_APP_REALTIME_INVALIDATION_EVENTS).toEqual([])
            return
        }

        for (const event of EXTENSION_APP_REALTIME_INVALIDATION_EVENTS) {
            expect(
                EXTENSION_APP_REALTIME_REGISTRY.getEvent('APP', event),
            ).toBeDefined()
        }
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
