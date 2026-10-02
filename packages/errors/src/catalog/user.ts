import { defineError } from '../publicCodes.js'

export const userErrors = {
    accountCredentialNotFound: defineError(
        'USER_ACCOUNT_CREDENTIAL_NOT_FOUND',
        'ACCOUNT_CREDENTIAL_NOT_FOUND',
        'Credential account not found.',
    ),
    accountCredentialUpdateConflict: defineError(
        'USER_ACCOUNT_CREDENTIAL_UPDATE_CONFLICT',
        'ACCOUNT_CREDENTIAL_UPDATE_CONFLICT',
        'Credential account was not updated.',
    ),
    addressNotFound: defineError(
        'USER_ADDRESS_NOT_FOUND',
        'ADDRESS_NOT_FOUND',
        'Address was not found.',
    ),
    passwordResetFailed: defineError(
        'USER_PASSWORD_RESET_FAILED',
        'PASSWORD_RESET_FAILED',
        'Password reset failed.',
    ),
    profileListRetrievalFailed: defineError(
        'USER_PROFILE_LIST_RETRIEVAL_FAILED',
        'PROFILE_LIST_RETRIEVAL_FAILED',
        'Profile list retrieval failed.',
    ),
    profileRetrievalFailed: defineError(
        'USER_PROFILE_RETRIEVAL_FAILED',
        'PROFILE_RETRIEVAL_FAILED',
        'Profile retrieval failed.',
    ),
    profileUpdateFailed: defineError(
        'USER_PROFILE_UPDATE_FAILED',
        'PROFILE_UPDATE_FAILED',
        'Profile update failed.',
    ),
    userNotFound: defineError(
        'USER_NOT_FOUND',
        'NOT_FOUND',
        'User ID not found.',
    ),
    userUpdateNotFound: defineError(
        'USER_UPDATE_NOT_FOUND',
        'NOT_FOUND',
        'User ID not found, nothing to update.',
    ),
} as const
