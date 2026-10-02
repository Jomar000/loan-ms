export const REALTIME_SURFACES = [
    'public',
    'backoffice',
] as const

export const REALTIME_TOPOLOGY_DIRECTIONS = [
    'backoffice-to-public',
    'bidirectional',
    'public-to-backoffice',
] as const

export const REALTIME_AUDIENCE_KINDS = [
    'identity',
    'organization',
    'role',
] as const

export const APP_REALTIME_STREAM = 'APP' as const

export const REALTIME_STREAM_NAME_MAX_LENGTH = 32
export const REALTIME_EVENT_NAME_MAX_LENGTH = 64
export const REALTIME_TARGET_MAX_LENGTH = 256
export const REALTIME_IDENTIFIER_MAX_LENGTH = 256
export const REALTIME_ROLE_MAX_LENGTH = 64
export const REALTIME_ROLES_MAX_LENGTH = 8
export const REALTIME_AUDIENCE_VALUES_MAX_LENGTH = 64

/**
 * Controls WebSocket negotiation, shared frame envelopes, serialization,
 * sequencing representation, and wire limits. Bump when clients and servers
 * must negotiate a new on-the-wire contract.
 */
export const REALTIME_WIRE_VERSION = 'realtime.events.v1' as const

/**
 * Controls persisted Durable Object scopes and Hibernation socket
 * attachments. Bump when stored realtime state requires a new schema.
 */
export const REALTIME_STORAGE_VERSION = 1 as const

/**
 * Controls Durable Object identities and deterministic shard-probe routing.
 * Bump when objects or connections must be routed into a new transport epoch.
 */
export const REALTIME_TRANSPORT_VERSION = 1 as const

export const REALTIME_SERVER_FRAME_MAX_BYTES = 8192
export const REALTIME_JSON_MAX_DEPTH = 16
export const REALTIME_JSON_MAX_MEMBERS = 256

export const WS_BROKER_FAN_OUT_CONCURRENCY = 6
export const WS_BROKER_FAN_OUT_DEADLINE_MS = 5000
export const WS_BROKER_PUBLICATION_BURST = 5
export const WS_BROKER_PUBLICATION_RATE_PER_SECOND = 2
export const WS_LEAF_COUNT = 64
export const WS_LEAF_SOFT_CAP = 8192
export const WS_SLOW_CLIENT_MAX_BUFFERED_BYTES = 65536

export const BROKER_PUBLISH_FAILURE_CODES = [
    'FANOUT_UNAVAILABLE',
    'FRAME_INVALID',
    'FRAME_TOO_LARGE',
    'RATE_LIMITED',
] as const

export const REALTIME_PUBLICATION_REJECTION_CODES = [
    'DESTINATION_MISMATCH',
    'FRAME_INVALID',
    'INVALID_AUDIENCE',
    'INVALID_DESTINATION',
    'INVALID_EVENT',
    'INVALID_EVENT_ID',
    'INVALID_ORGANIZATION',
    'INVALID_SOURCE',
    'INVALID_STREAM',
    'INVALID_TARGET',
    'INVALID_TIMESTAMP',
    'ROUTE_NOT_ALLOWED',
    'SOURCE_MISMATCH',
] as const
