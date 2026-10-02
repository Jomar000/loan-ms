import { RateLimitConfigurationError } from './errors.js'
import { assertRateLimitPolicy, type TRateLimitPolicy } from './policy.js'

export const RATE_LIMIT_TRANSPORT_VERSION = 1

export type TRateLimitKey = Readonly<{
    parts: readonly string[]
    scope: string
}>

export type TRateLimitTarget = Readonly<{
    keyPrefix: string
    objectName: string
}>

const encoder = new TextEncoder()
const scopePattern = /^[a-z][a-z0-9.-]{0,63}$/

const bytesToHex = (value: ArrayBuffer) =>
    [...new Uint8Array(value)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

export const isRateLimitScope = (value: unknown): value is string =>
    typeof value === 'string' && scopePattern.test(value)

export const assertRateLimitKey: (
    value: unknown,
) => asserts value is TRateLimitKey = (value) => {
    if (!value || typeof value !== 'object') {
        throw new RateLimitConfigurationError('Invalid rate-limit key.')
    }

    const key = value as Partial<TRateLimitKey>
    if (
        !isRateLimitScope(key.scope) ||
        !Array.isArray(key.parts) ||
        key.parts.length < 1 ||
        key.parts.length > 8 ||
        key.parts.some(
            (part) =>
                typeof part !== 'string' ||
                encoder.encode(part).byteLength < 1 ||
                encoder.encode(part).byteLength > 512,
        ) ||
        encoder.encode(JSON.stringify(key.parts)).byteLength > 2048
    ) {
        throw new RateLimitConfigurationError('Invalid rate-limit key.')
    }
}

export const assertRateLimitKeyPrefix: (
    value: unknown,
) => asserts value is string = (value) => {
    if (typeof value !== 'string' || !/^[a-f0-9]{12}$/.test(value)) {
        throw new RateLimitConfigurationError('Invalid rate-limit key prefix.')
    }
}

export const deriveRateLimitTarget = async ({
    key,
    policy,
    secret,
}: {
    key: TRateLimitKey
    policy: TRateLimitPolicy
    secret: string
}): Promise<TRateLimitTarget> => {
    assertRateLimitKey(key)
    assertRateLimitPolicy(policy)
    if (encoder.encode(secret).byteLength < 32) {
        throw new RateLimitConfigurationError('Invalid rate-limit secret.')
    }

    const hmacKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { hash: 'SHA-256', name: 'HMAC' },
        false,
        ['sign'],
    )
    const serializedKey = JSON.stringify([
        'rateLimit',
        RATE_LIMIT_TRANSPORT_VERSION,
        key.scope,
        key.parts,
        policy.algorithm,
        policy.version,
        policy.limit,
        policy.windowMs,
    ])
    const digest = await crypto.subtle.sign(
        'HMAC',
        hmacKey,
        encoder.encode(serializedKey),
    )
    const objectName = bytesToHex(digest)

    return {
        keyPrefix: objectName.slice(0, 12),
        objectName,
    }
}
