import { defineError } from '../publicCodes.js'

export const commonErrors = {
    dataValidation: defineError(
        'COMMON_DATA_VALIDATION',
        'DATA_VALIDATION',
        'An error occurred while validating input data.',
    ),
    featureNotFound: defineError(
        'COMMON_FEATURE_NOT_FOUND',
        'NOT_FOUND',
        'Not Found',
    ),
    httpBadRequest: defineError(
        'HTTP_BAD_REQUEST',
        'BAD_REQUEST',
        'Bad Request',
    ),
    httpConflict: defineError('HTTP_CONFLICT', 'CONFLICT', 'Conflict'),
    httpForbidden: defineError('HTTP_FORBIDDEN', 'FORBIDDEN', 'Forbidden'),
    httpLocked: defineError('HTTP_LOCKED', 'LOCKED', 'Locked'),
    httpNotFound: defineError('HTTP_NOT_FOUND', 'NOT_FOUND', 'Not Found'),
    httpRateLimited: defineError(
        'HTTP_RATE_LIMITED',
        'RATE_LIMITED',
        'Too Many Requests',
    ),
    httpUnauthorized: defineError(
        'HTTP_UNAUTHORIZED',
        'UNAUTHORIZED',
        'Unauthorized',
    ),
    httpUnprocessableContent: defineError(
        'HTTP_UNPROCESSABLE_CONTENT',
        'UNPROCESSABLE_CONTENT',
        'Unprocessable Content',
    ),
    httpUpgradeRequired: defineError(
        'HTTP_UPGRADE_REQUIRED',
        'WEBSOCKET_UPGRADE_REQUIRED',
        'Upgrade Required',
    ),
    internalServerError: defineError(
        'COMMON_INTERNAL_SERVER_ERROR',
        'INTERNAL_SERVER_ERROR',
        'An unknown error occurred, please try again later.',
    ),
    serviceUnavailable: defineError(
        'COMMON_SERVICE_UNAVAILABLE',
        'SERVICE_UNAVAILABLE',
        'Service Unavailable',
    ),
} as const
