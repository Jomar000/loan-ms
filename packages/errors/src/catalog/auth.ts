import { defineError } from '../publicCodes.js'

export const authErrors = {
    accountLocked: defineError(
        'AUTH_ACCOUNT_LOCKED',
        'LOCKED',
        'Account is currently locked.',
    ),
    authenticationForbidden: defineError(
        'AUTH_ACCESS_FORBIDDEN',
        'FORBIDDEN',
        'You are not allowed to access this resource.',
    ),
    authenticationUnavailable: defineError(
        'AUTH_UNAVAILABLE',
        'AUTHENTICATION_UNAVAILABLE',
        'Authentication is temporarily unavailable.',
    ),
    authRateLimitConfigurationError: defineError(
        'AUTH_RATE_LIMIT_CONFIGURATION_ERROR',
        'AUTH_RATE_LIMIT_CONFIGURATION_ERROR',
        'Authentication rate limiting is unavailable.',
    ),
    authRateLimitUnavailable: defineError(
        'AUTH_RATE_LIMIT_DEPENDENCY_UNAVAILABLE',
        'AUTH_RATE_LIMIT_UNAVAILABLE',
        'Authentication rate limiting is unavailable.',
    ),
    captchaFailed: defineError(
        'AUTH_CAPTCHA_FAILED',
        'FORBIDDEN',
        'CAPTCHA verification failed.',
    ),
    captchaMissing: defineError(
        'AUTH_CAPTCHA_MISSING',
        'BAD_REQUEST',
        'Missing CAPTCHA response.',
    ),
    csrfInvalid: defineError(
        'AUTH_CSRF_INVALID',
        'FORBIDDEN',
        'Invalid CSRF token received.',
    ),
    emailVerificationRateLimited: defineError(
        'AUTH_EMAIL_VERIFICATION_RATE_LIMITED',
        'RATE_LIMITED',
        'Too many email verification attempts. Please try again later.',
    ),
    emailVerificationRejected: defineError(
        'AUTH_EMAIL_VERIFICATION_REJECTED',
        'UNPROCESSABLE_CONTENT',
        'Email verification failed. The token may be invalid or expired.',
    ),
    originInvalid: defineError(
        'AUTH_ORIGIN_INVALID',
        'FORBIDDEN',
        'Invalid request origin.',
    ),
    originMissing: defineError(
        'AUTH_ORIGIN_MISSING',
        'BAD_REQUEST',
        'Missing Origin request header.',
    ),
    organizationSelectionRejected: defineError(
        'AUTH_ORGANIZATION_SELECTION_REJECTED',
        'UNPROCESSABLE_CONTENT',
        'Organization could not be selected.',
    ),
    passwordChangeRateLimited: defineError(
        'AUTH_PASSWORD_CHANGE_RATE_LIMITED',
        'RATE_LIMITED',
        'Too many password change attempts. Please try again later.',
    ),
    passwordChangeRejected: defineError(
        'AUTH_PASSWORD_CHANGE_REJECTED',
        'UNPROCESSABLE_CONTENT',
        'Password change failed. Please verify your current password.',
    ),
    passwordResetRateLimited: defineError(
        'AUTH_PASSWORD_RESET_RATE_LIMITED',
        'RATE_LIMITED',
        'Too many password reset attempts. Please try again later.',
    ),
    passwordResetRejected: defineError(
        'AUTH_PASSWORD_RESET_REJECTED',
        'UNPROCESSABLE_CONTENT',
        'Password reset failed. The token may be invalid or expired.',
    ),
    passwordResetRequestRateLimited: defineError(
        'AUTH_PASSWORD_RESET_REQUEST_RATE_LIMITED',
        'RATE_LIMITED',
        'Too many password reset requests. Please try again later.',
    ),
    passwordResetRequestSuppressed: defineError(
        'AUTH_PASSWORD_RESET_REQUEST_SUPPRESSED',
        'RATE_LIMITED',
        'Password reset request suppressed.',
    ),
    sessionRequired: defineError(
        'AUTH_SESSION_REQUIRED',
        'UNAUTHORIZED',
        'You are not allowed to access this resource.',
    ),
    signInInvalidCredentials: defineError(
        'AUTH_SIGN_IN_INVALID_CREDENTIALS',
        'UNPROCESSABLE_CONTENT',
        'Invalid credentials provided.',
    ),
    signInRateLimited: defineError(
        'AUTH_SIGN_IN_RATE_LIMITED',
        'RATE_LIMITED',
        'Too many authentication attempts. Please try again later.',
    ),
} as const
