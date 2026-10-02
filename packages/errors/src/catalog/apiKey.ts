import { defineError } from '../publicCodes.js'

export const apiKeyErrors = {
    apiKeyAuthorizationUnavailable: defineError(
        'API_KEY_AUTHORIZATION_UNAVAILABLE',
        'API_KEY_UNAVAILABLE',
        'API key authorization is temporarily unavailable.',
    ),
    apiKeyInvalid: defineError(
        'API_KEY_INVALID',
        'UNAUTHORIZED',
        'Invalid API key.',
    ),
    apiKeyRateLimited: defineError(
        'API_KEY_RATE_LIMITED',
        'RATE_LIMITED',
        'Too many API requests. Please try again later.',
    ),
    apiKeyVerificationUnavailable: defineError(
        'API_KEY_VERIFICATION_UNAVAILABLE',
        'API_KEY_UNAVAILABLE',
        'API key verification is temporarily unavailable.',
    ),
    credentialCreationConfirmationUnavailable: defineError(
        'API_KEY_CREATION_CONFIRMATION_UNAVAILABLE',
        'API_KEY_UNAVAILABLE',
        'Credential creation could not be confirmed.',
    ),
    credentialCreationRollbackUnavailable: defineError(
        'API_KEY_CREATION_ROLLBACK_UNAVAILABLE',
        'API_KEY_UNAVAILABLE',
        'Credential creation could not be safely rolled back.',
    ),
    credentialIssuePrincipalChanged: defineError(
        'API_KEY_ISSUE_PRINCIPAL_CHANGED',
        'CONFLICT',
        'The service principal changed while the credential was being issued.',
    ),
    credentialIssuePrincipalDisabled: defineError(
        'API_KEY_ISSUE_PRINCIPAL_DISABLED',
        'CONFLICT',
        'Credentials cannot be issued for a disabled service principal.',
    ),
    credentialIssuanceFailed: defineError(
        'API_KEY_ISSUANCE_FAILED',
        'CONFLICT',
        'This credential issuance attempt failed and cannot be retried.',
    ),
    credentialIssuanceIdempotencyConflict: defineError(
        'API_KEY_ISSUANCE_IDEMPOTENCY_CONFLICT',
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was already used for a different credential request.',
    ),
    credentialIssuancePending: defineError(
        'API_KEY_ISSUANCE_PENDING',
        'CONFLICT',
        'This credential issuance attempt is already pending.',
    ),
    credentialLinkUnavailable: defineError(
        'API_KEY_LINK_UNAVAILABLE',
        'API_KEY_UNAVAILABLE',
        'The credential could not be linked to its service principal.',
    ),
    credentialManagementBadRequest: defineError(
        'API_KEY_MANAGEMENT_BAD_REQUEST',
        'BAD_REQUEST',
        'The credential operation could not be completed.',
    ),
    credentialManagementForbidden: defineError(
        'API_KEY_MANAGEMENT_FORBIDDEN',
        'FORBIDDEN',
        'The credential operation could not be completed.',
    ),
    credentialManagementNotFound: defineError(
        'API_KEY_MANAGEMENT_NOT_FOUND',
        'NOT_FOUND',
        'The credential operation could not be completed.',
    ),
    credentialManagementUnavailable: defineError(
        'API_KEY_MANAGEMENT_UNAVAILABLE',
        'API_KEY_UNAVAILABLE',
        'Credential management is temporarily unavailable.',
    ),
    credentialNotFound: defineError(
        'API_KEY_CREDENTIAL_NOT_FOUND',
        'NOT_FOUND',
        'Credential not found.',
    ),
    servicePrincipalAlreadyDisabled: defineError(
        'API_KEY_SERVICE_PRINCIPAL_ALREADY_DISABLED',
        'CONFLICT',
        'Service principal is already disabled.',
    ),
    servicePrincipalAlreadyEnabled: defineError(
        'API_KEY_SERVICE_PRINCIPAL_ALREADY_ENABLED',
        'CONFLICT',
        'Service principal is already enabled.',
    ),
    servicePrincipalDeleteRequiresDisabled: defineError(
        'API_KEY_SERVICE_PRINCIPAL_DELETE_REQUIRES_DISABLED',
        'CONFLICT',
        'Disable the service principal before deleting it.',
    ),
    servicePrincipalIdempotencyConflict: defineError(
        'API_KEY_SERVICE_PRINCIPAL_IDEMPOTENCY_CONFLICT',
        'IDEMPOTENCY_CONFLICT',
        'The idempotency key was already used for a different request.',
    ),
    servicePrincipalInvalidPermissions: defineError(
        'API_KEY_SERVICE_PRINCIPAL_INVALID_PERMISSIONS',
        'DATA_VALIDATION',
        'Invalid service principal permissions.',
    ),
    servicePrincipalMaxCredentials: defineError(
        'API_KEY_SERVICE_PRINCIPAL_MAX_CREDENTIALS',
        'CONFLICT',
        'A service principal may have at most two active credentials.',
    ),
    servicePrincipalNotFound: defineError(
        'API_KEY_SERVICE_PRINCIPAL_NOT_FOUND',
        'NOT_FOUND',
        'Service principal not found.',
    ),
} as const
