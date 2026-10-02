import { describe, expect, it } from 'vitest'

import {
    createWsClientManager,
    type TRealtimeRecoveryCallbacks,
} from '../src/client.js'
import { createRealtimeBootstrapCoordinator } from '../src/coordination.js'
import {
    realtimeServerFrameSchema,
    type TRealtimeServerFrame,
} from '../src/protocol.js'
import { realtimePublicationDescriptorSchema } from '../src/publisher.js'
import {
    realtimeStreamNameSchema,
    type TRealtimeRegistry,
} from '../src/registry.js'
import type { TBrokerPublishResult } from '../src/server.js'
import {
    realtimeSurfaceSchema,
    type TRealtimeTopologyProfile,
} from '../src/topology.js'
import { realtimeAudienceSchema } from '../src/transport.js'

describe('WebSocket public subpath facades', () => {
    it('re-exports representative runtime contracts and types.', () => {
        const frame: TRealtimeServerFrame = {
            code: 'UNAVAILABLE',
            recoverable: true,
            type: 'ERROR',
        }
        const topology: TRealtimeTopologyProfile = {
            kind: 'independent-surfaces',
        }
        const brokerResult: TBrokerPublishResult = {
            accepted: false,
            code: 'FANOUT_UNAVAILABLE',
        }
        const registry: TRealtimeRegistry | undefined = undefined
        const callbacks: TRealtimeRecoveryCallbacks = {}

        expect(createWsClientManager).toBeTypeOf('function')
        expect(createRealtimeBootstrapCoordinator).toBeTypeOf('function')
        expect(realtimeServerFrameSchema.safeParse(frame).success).toBe(true)
        expect(realtimePublicationDescriptorSchema.safeParse({}).success).toBe(
            false,
        )
        expect(realtimeStreamNameSchema.safeParse('APP').success).toBe(true)
        expect(realtimeSurfaceSchema.safeParse('public').success).toBe(true)
        expect(
            realtimeAudienceSchema.safeParse({ kind: 'organization' }).success,
        ).toBe(true)
        expect(topology).toEqual({ kind: 'independent-surfaces' })
        expect(brokerResult).toEqual({
            accepted: false,
            code: 'FANOUT_UNAVAILABLE',
        })
        expect(registry).toBeUndefined()
        expect(callbacks).toEqual({})
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
