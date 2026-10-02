import { refinement } from '@loanms/validator/shared'
import { z } from 'zod'

import {
    BROKER_PUBLISH_FAILURE_CODES,
    REALTIME_AUDIENCE_KINDS,
    REALTIME_AUDIENCE_VALUES_MAX_LENGTH,
    REALTIME_EVENT_NAME_MAX_LENGTH,
    REALTIME_IDENTIFIER_MAX_LENGTH,
    REALTIME_PUBLICATION_REJECTION_CODES,
    REALTIME_ROLE_MAX_LENGTH,
    REALTIME_ROLES_MAX_LENGTH,
    REALTIME_STORAGE_VERSION,
    REALTIME_STREAM_NAME_MAX_LENGTH,
    REALTIME_SURFACES,
    REALTIME_TARGET_MAX_LENGTH,
    REALTIME_TOPOLOGY_DIRECTIONS,
    REALTIME_WIRE_VERSION,
    WS_LEAF_COUNT,
} from './constants.js'

// Topology

export const realtimeSurfaceSchema = z.enum(REALTIME_SURFACES)

export const realtimeTopologyProfileSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('local-only'),
        surface: realtimeSurfaceSchema,
    }),
    z.object({
        kind: z.literal('independent-surfaces'),
    }),
    z.object({
        kind: z.literal('shared-auth-security-only'),
    }),
    z.object({
        direction: z.enum(REALTIME_TOPOLOGY_DIRECTIONS),
        kind: z.literal('shared-auth-events'),
    }),
])

// Registry fields

export const realtimeAudienceKindSchema = z.enum(REALTIME_AUDIENCE_KINDS)

export const realtimeEventNameSchema = z
    .string()
    .min(1)
    .max(REALTIME_EVENT_NAME_MAX_LENGTH)
    .regex(/^[A-Z][A-Z0-9_]*$/)

export const realtimeMetricsLabelSchema = z
    .string()
    .min(1)
    .max(REALTIME_STREAM_NAME_MAX_LENGTH)
    .regex(/^[a-z][a-z0-9_]*$/)

export const realtimeStreamNameSchema = z
    .string()
    .min(1)
    .max(REALTIME_STREAM_NAME_MAX_LENGTH)
    .regex(/^[A-Z][A-Z0-9_]*$/)

export const realtimeTargetSchema = z
    .string()
    .min(1)
    .max(REALTIME_TARGET_MAX_LENGTH)

export const realtimeEventAudiencesSchema = z
    .array(realtimeAudienceKindSchema)
    .min(1)
    .check((ctx) =>
        refinement.uniqueArrayValues(ctx, {
            message: 'Realtime event audiences must be unique.',
            values: ctx.value,
        }),
    )

export const realtimeIdleRetentionSchema = z.number().int().nonnegative()

// Transport

export const realtimeOpaqueIdentifierSchema = z
    .string()
    .min(1)
    .max(REALTIME_IDENTIFIER_MAX_LENGTH)

export const realtimeRoleSchema = z
    .string()
    .min(1)
    .max(REALTIME_ROLE_MAX_LENGTH)

export const realtimeRolesSchema = z
    .array(realtimeRoleSchema)
    .min(1)
    .max(REALTIME_ROLES_MAX_LENGTH)
    .check((ctx) =>
        refinement.uniqueArrayValues(ctx, {
            message: 'Realtime roles must be unique.',
            values: ctx.value,
        }),
    )

export const realtimeIdentityAudienceValuesSchema = z
    .array(realtimeOpaqueIdentifierSchema)
    .min(1)
    .max(REALTIME_AUDIENCE_VALUES_MAX_LENGTH)
    .check((ctx) =>
        refinement.uniqueArrayValues(ctx, {
            message: 'Realtime audience identity IDs must be unique.',
            values: ctx.value,
        }),
    )

export const realtimeRoleAudienceValuesSchema = z
    .array(realtimeRoleSchema)
    .min(1)
    .max(REALTIME_AUDIENCE_VALUES_MAX_LENGTH)
    .check((ctx) =>
        refinement.uniqueArrayValues(ctx, {
            message: 'Realtime audience roles must be unique.',
            values: ctx.value,
        }),
    )

export const realtimeBrokerScopeSchema = z.object({
    organizationId: realtimeOpaqueIdentifierSchema,
    storageVersion: z.literal(REALTIME_STORAGE_VERSION),
    stream: realtimeStreamNameSchema,
    surface: realtimeSurfaceSchema,
})

export const realtimeLeafScopeSchema = realtimeBrokerScopeSchema.extend({
    shardIndex: z
        .number()
        .int()
        .min(0)
        .max(WS_LEAF_COUNT - 1),
    topology: z.literal('leaf'),
})

export const realtimeAudienceSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('organization'),
    }),
    z.object({
        identityIds: realtimeIdentityAudienceValuesSchema,
        kind: z.literal('identity'),
    }),
    z.object({
        kind: z.literal('role'),
        roles: realtimeRoleAudienceValuesSchema,
    }),
])

export const realtimeTransportAttachmentSchema = realtimeLeafScopeSchema.extend(
    {
        authorizationVersion: z.uuid(),
        connectionId: z.uuid(),
        identityId: realtimeOpaqueIdentifierSchema,
        roles: realtimeRolesSchema,
        sessionExpiresAt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        target: realtimeTargetSchema.nullable(),
        wireVersion: z.literal(REALTIME_WIRE_VERSION),
    },
)

export const realtimeRevocationDirectiveSchema = z.object({
    authorizationVersion: z.uuid(),
    expiresAt: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    identityId: realtimeOpaqueIdentifierSchema,
    operationId: z.uuidv7(),
    organizationId: realtimeOpaqueIdentifierSchema,
})

// Protocol frames

export const realtimeSequenceSchema = z.string().regex(/^[1-9]\d*$/)

export const realtimeReadyFrameSchema = z.object({
    authorizationVersion: z.uuid(),
    connectionId: z.uuid(),
    stream: realtimeStreamNameSchema,
    target: realtimeTargetSchema.optional(),
    type: z.literal('READY'),
    wireVersion: z.literal(REALTIME_WIRE_VERSION),
})

export const realtimeEventFrameSchema = z.object({
    event: realtimeEventNameSchema,
    eventId: z.uuidv7(),
    occurredAt: z.iso.datetime({ offset: true }),
    payload: z.unknown(),
    sequence: realtimeSequenceSchema.optional(),
    stream: realtimeStreamNameSchema,
    target: realtimeTargetSchema.optional(),
    type: z.literal('EVENT'),
})

export const realtimeGapFrameSchema = z.object({
    expected: realtimeSequenceSchema,
    received: realtimeSequenceSchema,
    stream: realtimeStreamNameSchema,
    target: realtimeTargetSchema.optional(),
    type: z.literal('GAP'),
})

export const realtimeErrorFrameSchema = z.object({
    code: realtimeEventNameSchema,
    recoverable: z.boolean(),
    type: z.literal('ERROR'),
})

export const realtimeServerFrameSchema = z.discriminatedUnion('type', [
    realtimeReadyFrameSchema,
    realtimeEventFrameSchema,
    realtimeGapFrameSchema,
    realtimeErrorFrameSchema,
])

// Durable Object RPC

const realtimeResultCountSchema = z.number().int().nonnegative()

export const realtimeLeafRevocationInputSchema = z.object({
    directive: realtimeRevocationDirectiveSchema,
    scope: realtimeLeafScopeSchema,
})

export const realtimeLeafRevocationResultSchema = z.object({
    closedSocketCount: realtimeResultCountSchema,
    replayed: z.boolean(),
})

export const realtimeLeafDeliveryInputSchema = z.object({
    audience: realtimeAudienceSchema,
    frameBytes: z.number().int().positive(),
    revocations: z.array(realtimeLeafRevocationInputSchema),
    scope: realtimeLeafScopeSchema,
    serializedFrame: z.string().min(1),
    target: realtimeTargetSchema.nullable(),
})

export const realtimeLeafDeliveryResultSchema = z.object({
    deliveredCount: realtimeResultCountSchema,
    expiredSocketCount: realtimeResultCountSchema,
    revokedSocketCount: realtimeResultCountSchema,
    sendFailureCount: realtimeResultCountSchema,
    slowSocketCount: realtimeResultCountSchema,
})

export const brokerRealtimePublishInputSchema = z.object({
    audience: realtimeAudienceSchema,
    event: realtimeEventNameSchema,
    eventId: z.uuidv7(),
    occurredAt: z.iso.datetime({ offset: true }),
    payload: z.unknown(),
    scope: realtimeBrokerScopeSchema,
    target: realtimeTargetSchema.nullable(),
})

export const brokerPublishResultSchema = z.discriminatedUnion('accepted', [
    z.object({
        accepted: z.literal(true),
        deliveredCount: realtimeResultCountSchema,
        failedTargetCount: realtimeResultCountSchema,
        successfulTargetCount: realtimeResultCountSchema,
    }),
    z.object({
        accepted: z.literal(false),
        code: z.enum(BROKER_PUBLISH_FAILURE_CODES),
    }),
])

export const brokerRealtimeRevocationInputSchema = z.object({
    directive: realtimeRevocationDirectiveSchema,
    scope: realtimeBrokerScopeSchema,
})

export const brokerRealtimeRevocationResultSchema = z.discriminatedUnion(
    'accepted',
    [
        z.object({
            accepted: z.literal(true),
            closedSocketCount: realtimeResultCountSchema,
            failedLeafCount: z.literal(0),
            successfulLeafCount: realtimeResultCountSchema,
        }),
        z.object({
            accepted: z.literal(false),
            closedSocketCount: realtimeResultCountSchema,
            code: z.literal('FANOUT_UNAVAILABLE'),
            failedLeafCount: realtimeResultCountSchema,
            successfulLeafCount: realtimeResultCountSchema,
        }),
    ],
)

export const realtimeRevocationDeliveryResultSchema = z.object({
    accepted: z.boolean(),
    error: z.string().optional(),
})

// Cross-surface publication

export const realtimePublicationAudienceSchema = realtimeAudienceSchema

export const realtimePublicationOrganizationSchema = z
    .string()
    .min(1)
    .max(REALTIME_IDENTIFIER_MAX_LENGTH)
export const realtimePublicationStreamSchema = z.string()
export const realtimePublicationTargetInputSchema = z.string().nullable()

export const realtimePublicationDescriptorSchema = z.object({
    audience: realtimePublicationAudienceSchema,
    destinationSurface: realtimeSurfaceSchema,
    event: realtimeEventNameSchema,
    eventId: realtimeEventFrameSchema.shape.eventId,
    occurredAt: realtimeEventFrameSchema.shape.occurredAt,
    organizationId: realtimePublicationOrganizationSchema,
    payload: z.unknown(),
    sourceSurface: realtimeSurfaceSchema,
    stream: realtimePublicationStreamSchema,
    target: realtimePublicationTargetInputSchema,
})

export const realtimePublicationDeliveryResultSchema = z.union([
    brokerPublishResultSchema,
    z.object({
        accepted: z.literal(false),
        code: z.enum(REALTIME_PUBLICATION_REJECTION_CODES),
    }),
])
