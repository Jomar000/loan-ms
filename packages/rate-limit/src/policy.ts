import { RateLimitConfigurationError } from './errors.js'

export type TRateLimitPolicy = Readonly<{
    algorithm: 'sliding-window'
    limit: number
    version: number
    windowMs: number
}>

export const isRateLimitPolicy = (
    value: unknown,
): value is TRateLimitPolicy => {
    if (!value || typeof value !== 'object') return false

    const policy = value as Partial<TRateLimitPolicy>

    return (
        policy.algorithm === 'sliding-window' &&
        Number.isSafeInteger(policy.limit) &&
        policy.limit! > 0 &&
        Number.isSafeInteger(policy.version) &&
        policy.version! > 0 &&
        Number.isSafeInteger(policy.windowMs) &&
        policy.windowMs! > 0
    )
}

export const assertRateLimitPolicy: (
    value: unknown,
) => asserts value is TRateLimitPolicy = (value) => {
    if (!isRateLimitPolicy(value)) {
        throw new RateLimitConfigurationError('Invalid rate-limit policy.')
    }
}

export const defineRateLimitPolicy = <const TPolicy extends TRateLimitPolicy>(
    policy: TPolicy,
) => {
    assertRateLimitPolicy(policy)

    return policy
}
