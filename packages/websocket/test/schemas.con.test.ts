import { describe, expect, it } from 'vitest'

import type { TRealtimePublicationDescriptor } from '../src/publisher.js'
import {
    brokerPublishResultSchema,
    brokerRealtimePublishInputSchema,
    brokerRealtimeRevocationInputSchema,
    brokerRealtimeRevocationResultSchema,
    realtimeAudienceSchema,
    realtimeBrokerScopeSchema,
    realtimeEventFrameSchema,
    realtimeEventNameSchema,
    realtimeLeafDeliveryInputSchema,
    realtimeLeafDeliveryResultSchema,
    realtimeLeafRevocationInputSchema,
    realtimeLeafRevocationResultSchema,
    realtimeLeafScopeSchema,
    realtimeMetricsLabelSchema,
    realtimePublicationDeliveryResultSchema,
    realtimePublicationDescriptorSchema,
    realtimeReadyFrameSchema,
    realtimeRevocationDeliveryResultSchema,
    realtimeRevocationDirectiveSchema,
    realtimeSequenceSchema,
    realtimeServerFrameSchema,
    realtimeStreamNameSchema,
    realtimeSurfaceSchema,
    realtimeTargetSchema,
    realtimeTopologyProfileSchema,
    realtimeTransportAttachmentSchema,
} from '../src/schemas.js'
import type { TRealtimeTransportAttachment } from '../src/transport.js'

const uuidV4 = '550e8400-e29b-41d4-a716-446655440000'
const uuidV7 = '0198ef86-e6ab-7da4-98d3-57e3101779e4'

const brokerScope = {
    organizationId: 'organization-a',
    stream: 'APP',
    surface: 'public',
    storageVersion: 1,
} as const

const leafScope = {
    ...brokerScope,
    shardIndex: 63,
    topology: 'leaf',
} as const

const revocationDirective = {
    authorizationVersion: uuidV4,
    expiresAt: 1,
    identityId: 'identity-a',
    operationId: uuidV7,
    organizationId: brokerScope.organizationId,
}

describe('centralized WebSocket schemas', () => {
    it('validates topology, registry names, targets, and sequences.', () => {
        expect(realtimeSurfaceSchema.safeParse('public').success).toBe(true)
        expect(realtimeSurfaceSchema.safeParse('admin').success).toBe(false)
        expect(
            realtimeTopologyProfileSchema.safeParse({
                direction: 'bidirectional',
                kind: 'shared-auth-events',
            }).success,
        ).toBe(true)
        expect(
            realtimeTopologyProfileSchema.safeParse({
                direction: 'sideways',
                kind: 'shared-auth-events',
            }).success,
        ).toBe(false)

        for (const schema of [
            realtimeEventNameSchema,
            realtimeStreamNameSchema,
        ]) {
            expect(schema.safeParse('VALID_NAME').success).toBe(true)
            expect(schema.safeParse('invalid-name').success).toBe(false)
        }

        expect(realtimeMetricsLabelSchema.safeParse('valid_name').success).toBe(
            true,
        )
        expect(realtimeMetricsLabelSchema.safeParse('INVALID').success).toBe(
            false,
        )
        expect(realtimeTargetSchema.safeParse('target-a').success).toBe(true)
        expect(realtimeTargetSchema.safeParse('').success).toBe(false)
        expect(realtimeTargetSchema.safeParse('x'.repeat(257)).success).toBe(
            false,
        )

        expect(realtimeSequenceSchema.safeParse('1').success).toBe(true)
        expect(
            realtimeSequenceSchema.safeParse(
                (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
            ).success,
        ).toBe(true)
        expect(realtimeSequenceSchema.safeParse('0').success).toBe(false)
        expect(realtimeSequenceSchema.safeParse('01').success).toBe(false)
    })

    it('validates bounded scopes, audiences, attachments, and revocations.', () => {
        expect(realtimeBrokerScopeSchema.safeParse(brokerScope).success).toBe(
            true,
        )
        expect(realtimeLeafScopeSchema.safeParse(leafScope).success).toBe(true)
        expect(
            realtimeLeafScopeSchema.safeParse({
                ...leafScope,
                shardIndex: 64,
            }).success,
        ).toBe(false)

        expect(
            realtimeAudienceSchema.safeParse({
                identityIds: ['identity-a'],
                kind: 'identity',
            }).success,
        ).toBe(true)
        expect(
            realtimeAudienceSchema.safeParse({
                kind: 'role',
                roles: [],
            }).success,
        ).toBe(false)

        const attachment = {
            ...leafScope,
            authorizationVersion: uuidV4,
            connectionId: uuidV4,
            identityId: 'identity-a',
            wireVersion: 'realtime.events.v1',
            roles: ['member'],
            sessionExpiresAt: 1,
            target: null,
        } satisfies TRealtimeTransportAttachment

        expect(
            realtimeTransportAttachmentSchema.safeParse(attachment).success,
        ).toBe(true)
        expect(
            realtimeTransportAttachmentSchema.safeParse({
                ...attachment,
                connectionId: 'connection-a',
            }).success,
        ).toBe(false)
        expect(
            realtimeTransportAttachmentSchema.safeParse({
                ...attachment,
                roles: [
                    'member',
                    'member',
                ],
            }).success,
        ).toBe(false)

        expect(
            realtimeRevocationDirectiveSchema.safeParse(revocationDirective)
                .success,
        ).toBe(true)
        expect(
            realtimeRevocationDirectiveSchema.safeParse({
                ...revocationDirective,
                operationId: uuidV4,
            }).success,
        ).toBe(false)
    })

    it('requires unique bounded identity and role audience values.', () => {
        expect(
            realtimeAudienceSchema.safeParse({
                identityIds: ['i'.repeat(256)],
                kind: 'identity',
            }).success,
        ).toBe(true)
        expect(
            realtimeAudienceSchema.safeParse({
                kind: 'role',
                roles: ['r'.repeat(64)],
            }).success,
        ).toBe(true)
        expect(
            realtimeAudienceSchema.safeParse({
                identityIds: Array.from(
                    { length: 64 },
                    (_, index) => `identity-${index}`,
                ),
                kind: 'identity',
            }).success,
        ).toBe(true)
        expect(
            realtimeAudienceSchema.safeParse({
                kind: 'role',
                roles: Array.from(
                    { length: 64 },
                    (_, index) => `role-${index}`,
                ),
            }).success,
        ).toBe(true)

        for (const audience of [
            {
                identityIds: [
                    'identity-a',
                    'identity-a',
                ],
                kind: 'identity',
            },
            {
                kind: 'role',
                roles: [
                    'operator',
                    'operator',
                ],
            },
            {
                identityIds: ['i'.repeat(257)],
                kind: 'identity',
            },
            {
                kind: 'role',
                roles: ['r'.repeat(65)],
            },
            {
                identityIds: Array.from(
                    { length: 65 },
                    (_, index) => `identity-${index}`,
                ),
                kind: 'identity',
            },
            {
                kind: 'role',
                roles: Array.from(
                    { length: 65 },
                    (_, index) => `role-${index}`,
                ),
            },
        ]) {
            expect(realtimeAudienceSchema.safeParse(audience).success).toBe(
                false,
            )
        }
    })

    it('validates protocol frames and UUIDv7 event IDs.', () => {
        expect(
            realtimeReadyFrameSchema.safeParse({
                authorizationVersion: uuidV4,
                connectionId: uuidV4,
                wireVersion: 'realtime.events.v1',
                stream: 'APP',
                type: 'READY',
            }).success,
        ).toBe(true)

        const eventFrame = {
            event: 'RESOURCE_CHANGED',
            eventId: uuidV7,
            occurredAt: '2026-07-27T12:00:00.000+08:00',
            payload: {},
            sequence: '1',
            stream: 'APP',
            type: 'EVENT',
        } as const

        expect(realtimeEventFrameSchema.safeParse(eventFrame).success).toBe(
            true,
        )
        expect(realtimeServerFrameSchema.safeParse(eventFrame).success).toBe(
            true,
        )
        expect(
            realtimeEventFrameSchema.safeParse({
                ...eventFrame,
                eventId: uuidV4,
            }).success,
        ).toBe(false)
        expect(
            realtimeEventFrameSchema.safeParse({
                ...eventFrame,
                occurredAt: 'yesterday',
            }).success,
        ).toBe(false)
    })

    it('validates every Durable Object RPC input and result contract.', () => {
        const leafRevocationInput = {
            directive: revocationDirective,
            scope: leafScope,
        }
        const leafDeliveryInput = {
            audience: { kind: 'organization' },
            frameBytes: 1,
            revocations: [leafRevocationInput],
            scope: leafScope,
            serializedFrame: '{}',
            target: null,
        }
        const brokerPublishInput = {
            audience: { kind: 'organization' },
            event: 'RESOURCE_CHANGED',
            eventId: uuidV7,
            occurredAt: '2026-07-27T12:00:00.000+08:00',
            payload: {},
            scope: brokerScope,
            target: null,
        }

        expect(
            realtimeLeafRevocationInputSchema.safeParse(leafRevocationInput)
                .success,
        ).toBe(true)
        expect(
            realtimeLeafRevocationResultSchema.safeParse({
                closedSocketCount: 0,
                replayed: false,
            }).success,
        ).toBe(true)
        expect(
            realtimeLeafDeliveryInputSchema.safeParse(leafDeliveryInput)
                .success,
        ).toBe(true)
        expect(
            realtimeLeafDeliveryResultSchema.safeParse({
                deliveredCount: 0,
                expiredSocketCount: 0,
                revokedSocketCount: 0,
                sendFailureCount: 0,
                slowSocketCount: 0,
            }).success,
        ).toBe(true)
        expect(
            realtimeLeafDeliveryResultSchema.safeParse({
                deliveredCount: -1,
                expiredSocketCount: 0,
                revokedSocketCount: 0,
                sendFailureCount: 0,
                slowSocketCount: 0,
            }).success,
        ).toBe(false)
        expect(
            brokerRealtimePublishInputSchema.safeParse(brokerPublishInput)
                .success,
        ).toBe(true)
        expect(
            brokerPublishResultSchema.safeParse({
                accepted: false,
                code: 'FANOUT_UNAVAILABLE',
            }).success,
        ).toBe(true)
        expect(
            brokerRealtimeRevocationInputSchema.safeParse({
                directive: revocationDirective,
                scope: brokerScope,
            }).success,
        ).toBe(true)
        expect(
            brokerRealtimeRevocationResultSchema.safeParse({
                accepted: true,
                closedSocketCount: 0,
                failedLeafCount: 0,
                successfulLeafCount: 64,
            }).success,
        ).toBe(true)
        expect(
            realtimeRevocationDeliveryResultSchema.safeParse({
                accepted: false,
                error: 'unavailable',
            }).success,
        ).toBe(true)
    })

    it('validates cross-surface publication contracts.', () => {
        const descriptor = {
            audience: { kind: 'organization' },
            destinationSurface: 'backoffice',
            event: 'RESOURCE_CHANGED',
            eventId: uuidV7,
            occurredAt: '2026-07-27T12:00:00.000+08:00',
            organizationId: 'organization-a',
            payload: {},
            sourceSurface: 'public',
            stream: 'APP',
            target: null,
        } satisfies TRealtimePublicationDescriptor

        expect(
            realtimePublicationDescriptorSchema.safeParse(descriptor).success,
        ).toBe(true)
        expect(
            realtimePublicationDeliveryResultSchema.safeParse({
                accepted: false,
                code: 'INVALID_TARGET',
            }).success,
        ).toBe(true)
        expect(
            realtimePublicationDeliveryResultSchema.safeParse({
                accepted: false,
                code: 'UNKNOWN_FAILURE',
            }).success,
        ).toBe(false)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
