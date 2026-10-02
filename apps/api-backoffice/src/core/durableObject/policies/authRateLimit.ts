import { defineRateLimitPolicy } from '@loanms/rate-limit/policy'

/**
 * Keep policy ownership local so this API can deploy independently. Increment
 * only the changed policy's version to isolate its replacement counters.
 */
export const AUTH_RATE_LIMIT_POLICIES = {
    'admin-password-reset-actor-target': {
        scope: 'auth.admin-password-reset-actor-target',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 10,
            version: 1,
            windowMs: 60 * 60 * 1000,
        }),
    },
    'email-verification-network': {
        scope: 'auth.email-verification-network',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 30,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'email-verification-token': {
        scope: 'auth.email-verification-token',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 5,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'password-change-user': {
        scope: 'auth.password-change-user',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 5,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'password-reset-redemption-network': {
        scope: 'auth.password-reset-redemption-network',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 30,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'password-reset-redemption-token': {
        scope: 'auth.password-reset-redemption-token',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 5,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'password-reset-identity-hour': {
        scope: 'auth.password-reset-identity-hour',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 3,
            version: 1,
            windowMs: 60 * 60 * 1000,
        }),
    },
    'password-reset-identity-minute': {
        scope: 'auth.password-reset-identity-minute',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 1,
            version: 1,
            windowMs: 60 * 1000,
        }),
    },
    'password-reset-network-hour': {
        scope: 'auth.password-reset-network-hour',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 10,
            version: 1,
            windowMs: 60 * 60 * 1000,
        }),
    },
    'sign-in-identity': {
        scope: 'auth.sign-in-identity',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            // Accept temporary targeted lockout to bound distributed guessing.
            limit: 20,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'sign-in-identity-network': {
        scope: 'auth.sign-in-identity-network',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 5,
            version: 1,
            windowMs: 10 * 60 * 1000,
        }),
    },
    'v1-api-key-network': {
        scope: 'v1.api-key-network',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 3_000,
            version: 1,
            windowMs: 60 * 1000,
        }),
    },
    'v1-api-key-presented': {
        scope: 'v1.api-key-presented',
        policy: defineRateLimitPolicy({
            algorithm: 'sliding-window',
            limit: 600,
            version: 1,
            windowMs: 60 * 1000,
        }),
    },
} as const

export type TAuthRateLimitAction = keyof typeof AUTH_RATE_LIMIT_POLICIES
