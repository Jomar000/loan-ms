import { defineError } from '../publicCodes.js'

export const realtimeErrors = {
    realtimeMembershipRequired: defineError(
        'REALTIME_MEMBERSHIP_REQUIRED',
        'UNAUTHORIZED',
        'Active membership is required for realtime access.',
    ),
    realtimeRevocationDeliveryConflict: defineError(
        'REALTIME_REVOCATION_DELIVERY_CONFLICT',
        'REALTIME_REVOCATION_DELIVERY_CONFLICT',
        'Realtime revocation delivery is already complete or no longer exists.',
    ),
    realtimeRevocationInvalidInput: defineError(
        'REALTIME_REVOCATION_INVALID_INPUT',
        'REALTIME_REVOCATION_INVALID_INPUT',
        'Realtime revocation input is invalid.',
    ),
    realtimeRevocationMembershipConflict: defineError(
        'REALTIME_REVOCATION_MEMBERSHIP_CONFLICT',
        'REALTIME_REVOCATION_MEMBERSHIP_CONFLICT',
        'Membership not found for WebSocket revocation.',
    ),
    realtimeRevocationOperationConflict: defineError(
        'REALTIME_REVOCATION_OPERATION_CONFLICT',
        'REALTIME_REVOCATION_OPERATION_CONFLICT',
        'WebSocket revocation operation ID was reused with different input.',
    ),
    realtimeTargetForbidden: defineError(
        'REALTIME_TARGET_FORBIDDEN',
        'REALTIME_TARGET_FORBIDDEN',
        'You are not allowed to access this realtime target.',
    ),
    realtimeTargetInvalid: defineError(
        'REALTIME_TARGET_INVALID',
        'REALTIME_TARGET_INVALID',
        'Invalid realtime target.',
    ),
    realtimeTargetRequired: defineError(
        'REALTIME_TARGET_REQUIRED',
        'REALTIME_TARGET_REQUIRED',
        'Invalid realtime target.',
    ),
    realtimeTargetUnexpected: defineError(
        'REALTIME_TARGET_UNEXPECTED',
        'REALTIME_TARGET_UNEXPECTED',
        'Invalid realtime target.',
    ),
    realtimeUnknownStream: defineError(
        'REALTIME_UNKNOWN_STREAM',
        'REALTIME_UNKNOWN_STREAM',
        'Realtime stream was not found.',
    ),
    websocketCapacityUnavailable: defineError(
        'WEBSOCKET_CAPACITY_UNAVAILABLE',
        'WEBSOCKET_CAPACITY_UNAVAILABLE',
        'WebSocket capacity is temporarily unavailable.',
    ),
    websocketProtocolRequired: defineError(
        'WEBSOCKET_PROTOCOL_REQUIRED',
        'WEBSOCKET_PROTOCOL_REQUIRED',
        'Expected WebSocket wire version: realtime.events.v1',
    ),
    websocketShardUnavailable: defineError(
        'WEBSOCKET_SHARD_UNAVAILABLE',
        'WEBSOCKET_SHARD_UNAVAILABLE',
        'WebSocket shards are temporarily unavailable.',
    ),
    websocketUpgradeRequired: defineError(
        'WEBSOCKET_UPGRADE_REQUIRED',
        'WEBSOCKET_UPGRADE_REQUIRED',
        'Expected Upgrade: websocket',
    ),
} as const
