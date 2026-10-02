import type { z } from 'zod'

import type { REALTIME_PUBLICATION_REJECTION_CODES } from './constants.js'
import type {
    brokerPublishResultSchema,
    brokerRealtimePublishInputSchema,
    brokerRealtimeRevocationInputSchema,
    brokerRealtimeRevocationResultSchema,
    realtimeAudienceKindSchema,
    realtimeAudienceSchema,
    realtimeBrokerScopeSchema,
    realtimeErrorFrameSchema,
    realtimeEventFrameSchema,
    realtimeGapFrameSchema,
    realtimeLeafDeliveryResultSchema,
    realtimeLeafRevocationInputSchema,
    realtimeLeafRevocationResultSchema,
    realtimePublicationAudienceSchema,
    realtimePublicationDeliveryResultSchema,
    realtimePublicationDescriptorSchema,
    realtimeReadyFrameSchema,
    realtimeRevocationDeliveryResultSchema,
    realtimeRevocationDirectiveSchema,
    realtimeServerFrameSchema,
    realtimeSurfaceSchema,
    realtimeTopologyProfileSchema,
    realtimeTransportAttachmentSchema,
    realtimeLeafScopeSchema,
} from './schemas.js'

// Topology

export type TRealtimeSurface = z.infer<typeof realtimeSurfaceSchema>
export type TRealtimeTopologyProfile = z.infer<
    typeof realtimeTopologyProfileSchema
>

export type TRealtimeTopologyCapabilities = {
    realtimePublisher?: unknown
    remoteBroker?: unknown
}

export type TRealtimeRevocationDestination = {
    delivery: 'local' | 'remote'
    surface: TRealtimeSurface
}

// Registry

export type TRealtimeAudienceKind = z.infer<typeof realtimeAudienceKindSchema>

export type TRealtimeEventDefinition = {
    audiences: readonly TRealtimeAudienceKind[]
    delivery: 'both' | 'organization' | 'target'
    payloadSchema: z.ZodType
}

export type TRealtimeEventDefinitions = Record<string, TRealtimeEventDefinition>

export type TRealtimeAppStreamDefinition = {
    events: TRealtimeEventDefinitions
    idleRetentionMs: number
    kind: 'app'
    metricsLabel: string
    recoveryPolicy: string
    wireName: 'APP'
}

export type TRealtimeDedicatedStreamDefinition = {
    authorizationPolicy: string
    events: TRealtimeEventDefinitions
    idleRetentionMs: number
    kind: 'dedicated'
    metricsLabel: string
    recoveryPolicy: string
    targetSchema: z.ZodType<string>
    wireName: string
}

export type TRealtimeStreamDefinition =
    TRealtimeAppStreamDefinition | TRealtimeDedicatedStreamDefinition

export type TRealtimeRegistry = {
    getEvent: (
        stream: string,
        event: string,
    ) => TRealtimeEventDefinition | undefined
    getStream: (stream: string) => TRealtimeStreamDefinition | undefined
    normalizeTarget: (
        stream: string,
        target: string,
    ) =>
        | {
              success: true
              target: string
          }
        | {
              success: false
          }
    streams: readonly TRealtimeStreamDefinition[]
}

export type TRealtimeAdmissionContext = {
    authorizationVersion: string
    connectionId: string
    identityId: string
    organizationId: string
    roles: string[]
    sessionExpiresAt: number
    surface: TRealtimeSurface
}

export type TRealtimeAdmission =
    | {
          success: true
          context: TRealtimeAdmissionContext
          stream: TRealtimeStreamDefinition
          target: string | null
      }
    | {
          success: false
          code:
              | 'REALTIME_TARGET_FORBIDDEN'
              | 'REALTIME_TARGET_INVALID'
              | 'REALTIME_TARGET_REQUIRED'
              | 'REALTIME_TARGET_UNEXPECTED'
              | 'REALTIME_UNKNOWN_STREAM'
      }

export type TAuthorizeRealtimeTarget = (input: {
    context: TRealtimeAdmissionContext
    stream: TRealtimeDedicatedStreamDefinition
    target: string
}) => boolean | Promise<boolean>

export type TRealtimeTargetAuthorizationHandler = TAuthorizeRealtimeTarget

export type TRealtimeTargetAuthorizationHandlers = Readonly<
    Record<string, TRealtimeTargetAuthorizationHandler>
>

// Transport

export type TRealtimeBrokerScope = z.infer<typeof realtimeBrokerScopeSchema>
export type TRealtimeLeafScope = z.infer<typeof realtimeLeafScopeSchema>
export type TRealtimeAudience = z.infer<typeof realtimeAudienceSchema>
export type TRealtimeTransportAttachment = Omit<
    z.infer<typeof realtimeTransportAttachmentSchema>,
    'roles'
> & {
    roles: readonly string[]
}
export type TRealtimeRevocationDirective = z.infer<
    typeof realtimeRevocationDirectiveSchema
>

export type TWebSocketAdmissionFailure = {
    code: 'WEBSOCKET_CAPACITY_UNAVAILABLE' | 'WEBSOCKET_SHARD_UNAVAILABLE'
    message: string
}

export type TBoundedTaskResult<T> =
    | {
          status: 'fulfilled'
          value: T
      }
    | {
          status: 'rejected'
          reason: unknown
      }

// Protocol

export type TRealtimeReadyFrame = z.infer<typeof realtimeReadyFrameSchema>
export type TRealtimeEventFrame = z.infer<typeof realtimeEventFrameSchema>
export type TRealtimeGapFrame = z.infer<typeof realtimeGapFrameSchema>
export type TRealtimeErrorFrame = z.infer<typeof realtimeErrorFrameSchema>
export type TRealtimeServerFrame = z.infer<typeof realtimeServerFrameSchema>

export type TCanonicalRealtimeFrame = {
    frame: TRealtimeServerFrame
    frameBytes: number
    serializedFrame: string
}

export type TRealtimeFrameParseResult =
    | {
          success: true
          data: TRealtimeServerFrame
      }
    | {
          success: false
          error:
              | 'FRAME_COMPLEXITY_EXCEEDED'
              | 'FRAME_INVALID'
              | 'FRAME_TOO_LARGE'
              | 'UNKNOWN_EVENT'
              | 'UNKNOWN_STREAM'
      }

// Durable Object RPC

export type TLeafDeliveryResult = Pick<
    z.infer<typeof realtimeLeafDeliveryResultSchema>,
    'deliveredCount' | 'sendFailureCount' | 'slowSocketCount'
>
export type TRealtimeLeafDeliveryResult = z.infer<
    typeof realtimeLeafDeliveryResultSchema
>
export type TRealtimeLeafRevocationInput = z.infer<
    typeof realtimeLeafRevocationInputSchema
>
export type TRealtimeLeafRevocationResult = z.infer<
    typeof realtimeLeafRevocationResultSchema
>
export type TBrokerRealtimePublishInput = z.infer<
    typeof brokerRealtimePublishInputSchema
>
export type TBrokerPublishResult = z.infer<typeof brokerPublishResultSchema>
export type TBrokerRealtimeRevocationInput = z.infer<
    typeof brokerRealtimeRevocationInputSchema
>
export type TBrokerRealtimeRevocationResult = z.infer<
    typeof brokerRealtimeRevocationResultSchema
>
export type TRealtimeRevocationDeliveryResult = z.infer<
    typeof realtimeRevocationDeliveryResultSchema
>

export type TRealtimeRevocationBroker = {
    deliverRealtimeRevocation(
        directive: TRealtimeRevocationDirective,
    ): Promise<TRealtimeRevocationDeliveryResult>
}

// Cross-surface publication

export type TRealtimePublicationAudience = z.infer<
    typeof realtimePublicationAudienceSchema
>
export type TRealtimePublicationDescriptor = z.infer<
    typeof realtimePublicationDescriptorSchema
>
export type TRealtimePublicationOrigin = 'local' | 'peer'
export type TRealtimePublicationRejectionCode =
    (typeof REALTIME_PUBLICATION_REJECTION_CODES)[number]

export type TRealtimePublicationResolution =
    | {
          accepted: true
          brokerInput: TBrokerRealtimePublishInput
          descriptor: TRealtimePublicationDescriptor
      }
    | {
          accepted: false
          code: TRealtimePublicationRejectionCode
      }

export type TRealtimePublicationDeliveryResult = z.infer<
    typeof realtimePublicationDeliveryResultSchema
>

export type TRealtimePublisher = {
    publishRealtimePublication(
        descriptor: TRealtimePublicationDescriptor,
    ): Promise<TRealtimePublicationDeliveryResult>
}

// Browser client

export type TWsClientManagerOptions = {
    connectionTimeoutMs?: number
    getUrl: (stream: string, target?: string) => string
    reconnectBaseDelayMs?: number
    reconnectMaxDelayMs?: number
    reconnectStabilityMs?: number
    registry?: TRealtimeRegistry
    telemetry?: (event: TRealtimeClientTelemetryEvent) => void
}

export type TRealtimeClientTelemetryEvent = {
    generation: number
    stream: string
    target: string | null
    type:
        | 'WS_CLIENT_CONNECTION_ACQUIRED'
        | 'WS_CLIENT_CONNECTION_CONNECTING'
        | 'WS_CLIENT_CONNECTION_RELEASED'
        | 'WS_CLIENT_CONNECTION_RECONNECT_SCHEDULED'
        | 'WS_CLIENT_RECOVERY'
}

export type TRealtimeSubscription = {
    readonly readyState: number
    release: () => void
    subscribe: (listener: (frame: TRealtimeServerFrame) => void) => () => void
    subscribeRecovery: (callbacks: TRealtimeRecoveryCallbacks) => () => void
}

export type TRealtimeRecoveryCallbacks = {
    onFirstReady?: (
        frame: TRealtimeReadyFrame,
        context: TRealtimeRecoveryContext,
    ) => void
    onGap?: (
        frame: TRealtimeGapFrame,
        context: TRealtimeRecoveryContext,
    ) => void
    onReconnectReady?: (
        frame: TRealtimeReadyFrame,
        context: TRealtimeRecoveryContext,
    ) => void
}

export type TRealtimeRecoveryContext = {
    recoveryPolicy: string
    stream: string
    target: string | null
}

export type TAppRealtimeLifecycleOptions = {
    manager: {
        connectApp: () => TRealtimeSubscription
        disconnectAll: (reason?: string) => void
    }
    onFrame?: (frame: TRealtimeServerFrame) => void
    recoveryCallbacks?: TRealtimeRecoveryCallbacks
}

export type TAppRealtimeLifecycle = {
    activate: (organizationKey: string) => void
    deactivate: (reason?: string) => void
    dispose: () => void
}
