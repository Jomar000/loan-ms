export const errorCategories = [
    'validation',
    'authentication',
    'authorization',
    'not_found',
    'conflict',
    'rate_limit',
    'protocol',
    'configuration',
    'dependency',
    'lifecycle',
    'internal',
] as const

export type TErrorCategory = (typeof errorCategories)[number]

type TPublicCodeClassification = {
    category: TErrorCategory
    retryable: boolean
    status: number
}

export const publicCodeRegistry = {
    AUDIT_TRAIL_LIST_FAILED: classification(500, 'internal', true),
    AUDIT_TRAIL_NOT_FOUND: classification(404, 'not_found', false),
    AUDIT_TRAIL_RECORD_PREPARATION_FAILED: classification(
        500,
        'internal',
        false,
    ),
    AUDIT_TRAIL_SUMMARY_FAILED: classification(500, 'internal', true),
    AUDIT_TRAIL_WRITE_FAILED: classification(500, 'internal', true),
    ACCOUNT_CREDENTIAL_NOT_FOUND: classification(404, 'not_found', false),
    ACCOUNT_CREDENTIAL_UPDATE_CONFLICT: classification(409, 'conflict', false),
    ADDRESS_NOT_FOUND: classification(404, 'not_found', false),
    API_KEY_UNAVAILABLE: classification(503, 'dependency', true),
    AUTHENTICATION_UNAVAILABLE: classification(503, 'dependency', true),
    AUTH_RATE_LIMIT_CONFIGURATION_ERROR: classification(
        503,
        'configuration',
        false,
    ),
    AUTH_RATE_LIMIT_UNAVAILABLE: classification(503, 'dependency', true),
    BAD_REQUEST: classification(400, 'validation', false),
    CONFLICT: classification(409, 'conflict', false),
    DATA_VALIDATION: classification(400, 'validation', false),
    DOWNLOAD_LIST_RETRIEVAL_FAILED: classification(500, 'internal', true),
    FORBIDDEN: classification(403, 'authorization', false),
    IDEMPOTENCY_CONFLICT: classification(409, 'conflict', false),
    IDEMPOTENCY_KEY_CONFLICT: classification(409, 'conflict', false),
    INTERNAL_SERVER_ERROR: classification(500, 'internal', true),
    LOCKED: classification(423, 'authentication', false),
    NOTIFICATION_ALREADY_READ: classification(409, 'conflict', false),
    NOTIFICATION_CURSOR_INVALID: classification(400, 'validation', false),
    NOTIFICATION_EVENT_CONFLICT: classification(409, 'conflict', false),
    NOTIFICATION_LIST_FETCH_FAILED: classification(500, 'internal', true),
    NOTIFICATION_MARK_READ_FAILED: classification(500, 'internal', true),
    NOTIFICATION_NOT_FOUND: classification(404, 'not_found', false),
    NOTIFICATION_RECIPIENTS_REQUIRED: classification(400, 'validation', false),
    NOTIFICATION_UNREAD_COUNT_FETCH_FAILED: classification(
        500,
        'internal',
        true,
    ),
    NOT_FOUND: classification(404, 'not_found', false),
    PASSWORD_RESET_FAILED: classification(500, 'internal', true),
    PROFILE_LIST_RETRIEVAL_FAILED: classification(500, 'internal', true),
    PROFILE_RETRIEVAL_FAILED: classification(500, 'internal', true),
    PROFILE_UPDATE_FAILED: classification(500, 'internal', true),
    RATE_LIMITED: classification(429, 'rate_limit', true),
    REALTIME_REVOCATION_DELIVERY_CONFLICT: classification(
        409,
        'conflict',
        false,
    ),
    REALTIME_REVOCATION_INVALID_INPUT: classification(500, 'internal', false),
    REALTIME_REVOCATION_MEMBERSHIP_CONFLICT: classification(
        409,
        'conflict',
        false,
    ),
    REALTIME_REVOCATION_OPERATION_CONFLICT: classification(
        409,
        'conflict',
        false,
    ),
    REALTIME_TARGET_FORBIDDEN: classification(403, 'authorization', false),
    REALTIME_TARGET_INVALID: classification(400, 'protocol', false),
    REALTIME_TARGET_REQUIRED: classification(400, 'protocol', false),
    REALTIME_TARGET_UNEXPECTED: classification(400, 'protocol', false),
    REALTIME_UNKNOWN_STREAM: classification(404, 'not_found', false),
    SERVICE_UNAVAILABLE: classification(503, 'lifecycle', true),
    UNAUTHORIZED: classification(401, 'authentication', false),
    UNPROCESSABLE_CONTENT: classification(422, 'validation', false),
    UPLOAD_ALREADY_COMMITTED: classification(409, 'conflict', false),
    UPLOAD_ATTACHMENTS_ALREADY_COMMITTED: classification(
        409,
        'conflict',
        false,
    ),
    UPLOAD_ATTACHMENTS_NOT_COMMITTED: classification(409, 'conflict', false),
    UPLOAD_ATTACHMENTS_NOT_FOUND: classification(404, 'not_found', false),
    UPLOAD_ATTACHMENT_ADDITION_FAILED: classification(500, 'internal', true),
    UPLOAD_ATTACHMENT_COMMIT_FAILED: classification(500, 'internal', true),
    UPLOAD_COMMIT_FAILED: classification(500, 'internal', true),
    UPLOAD_ID_CREATION_FAILED: classification(500, 'internal', true),
    WEBSOCKET_CAPACITY_UNAVAILABLE: classification(503, 'dependency', true),
    WEBSOCKET_PROTOCOL_REQUIRED: classification(426, 'protocol', false),
    WEBSOCKET_SHARD_UNAVAILABLE: classification(503, 'dependency', true),
    WEBSOCKET_UPGRADE_REQUIRED: classification(426, 'protocol', false),
} as const satisfies Record<string, TPublicCodeClassification>

export type TPublicCode = keyof typeof publicCodeRegistry
export type TPublicStatus = (typeof publicCodeRegistry)[TPublicCode]['status']

export type TErrorDefinition<TCode extends TPublicCode = TPublicCode> = {
    [Code in TCode]: Readonly<
        {
            code: Code
            id: string
            message: string
        } & (typeof publicCodeRegistry)[Code]
    >
}[TCode]

export const defineError = <TCode extends TPublicCode>(
    id: string,
    code: TCode,
    message: string,
): TErrorDefinition<TCode> =>
    ({
        id,
        code,
        message,
        ...publicCodeRegistry[code],
    }) as TErrorDefinition<TCode>

function classification<
    TStatus extends number,
    TCategory extends TErrorCategory,
    TRetryable extends boolean,
>(status: TStatus, category: TCategory, retryable: TRetryable) {
    return { category, retryable, status } as const
}
