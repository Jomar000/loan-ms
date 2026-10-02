import {
    AppError,
    catalog,
    serializeError,
    type TErrorDefinition,
} from '@hyperion/errors'
import {
    createRateLimiter,
    RateLimitConfigurationError,
    type TRateLimitReservation,
} from '@hyperion/rate-limit/client'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import {
    apiResponseErrorWrapper,
    apiResponseOkWrapper,
} from '../../utilities/helpers.js'
import {
    AUTH_RATE_LIMIT_POLICIES,
    type TAuthRateLimitAction,
} from '../durableObject/policies/authRateLimit.js'

export type TAuthRateLimitKey = {
    action: TAuthRateLimitAction
    keyParts: readonly string[]
}

export type TAuthRateLimitDecision =
    | {
          allowed: true
          bypassed: true
          scopes: readonly string[]
      }
    | {
          allowed: true
          bypassed: false
          limiter: ReturnType<typeof createRateLimiter>
          reservations: readonly TRateLimitReservation[]
          scopes: readonly string[]
      }
    | {
          allowed: false
          retryAfter: number
          scopes: readonly string[]
      }

const normalizeIpv4 = (value: string) => {
    const parts = value.split('.')
    if (
        parts.length !== 4 ||
        parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
    ) {
        return null
    }

    return parts.map(Number)
}

const parseIpv6 = (value: string) => {
    let candidate = value
    if (candidate.includes('.')) {
        const separator = candidate.lastIndexOf(':')
        const ipv4 = normalizeIpv4(candidate.slice(separator + 1))
        if (separator < 0 || !ipv4) return null
        candidate = `${candidate.slice(0, separator)}:${(
            ipv4[0]! * 256 +
            ipv4[1]!
        ).toString(16)}:${(ipv4[2]! * 256 + ipv4[3]!).toString(16)}`
    }

    const compressed = candidate.split('::')
    if (compressed.length > 2) return null
    const head = compressed[0] ? compressed[0].split(':') : []
    const tail = compressed[1] ? compressed[1].split(':') : []
    const missing = 8 - head.length - tail.length
    if (
        (compressed.length === 1 && missing !== 0) ||
        (compressed.length === 2 && missing < 1)
    ) {
        return null
    }

    const parts = [
        ...head,
        ...Array.from({ length: missing }, () => '0'),
        ...tail,
    ]
    if (
        parts.length !== 8 ||
        parts.some((part) => !/^[a-f0-9]{1,4}$/.test(part))
    ) {
        return null
    }

    return parts.map((part) => Number.parseInt(part, 16))
}

const configurationError = (cause?: Error) =>
    new AppError(catalog.authRateLimitConfigurationError, { cause: cause })

export const normalizeAuthRateLimitIdentity = (value: string) =>
    value.normalize('NFKC').trim().toLowerCase()

export const resolveTrustedClientIpAddress = (
    ipv6Address: string | undefined,
    ipAddress: string | undefined,
) => {
    const ipv6Candidate = ipv6Address?.trim()
    if (ipv6Candidate && parseIpv6(ipv6Candidate.toLowerCase())) {
        return ipv6Candidate
    }

    const ipCandidate = ipAddress?.trim()
    if (!ipCandidate) return 'N/A'
    const normalizedIpCandidate = ipCandidate.toLowerCase()

    return normalizeIpv4(normalizedIpCandidate) ||
        parseIpv6(normalizedIpCandidate)
        ? ipCandidate
        : 'N/A'
}

export const normalizeAuthRateLimitClientNetwork = (value: string) => {
    const candidate = value.trim().toLowerCase()
    const ipv4 = normalizeIpv4(candidate)
    if (ipv4) return ipv4.join('.')

    const ipv6 = parseIpv6(candidate)
    if (!ipv6) throw configurationError()
    if (ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff) {
        return `${ipv6[6]! >> 8}.${ipv6[6]! & 0xff}.${ipv6[7]! >> 8}.${
            ipv6[7]! & 0xff
        }`
    }

    return `${ipv6
        .slice(0, 4)
        .map((part) => part.toString(16).padStart(4, '0'))
        .join(':')}::/64`
}

const boundedScopes = (scopes: readonly string[]) =>
    [...new Set(scopes)].slice(0, 8).map((scope) => scope.slice(0, 128))

const logMutationError = (
    ctx: Context<THonoInstance>,
    type: string,
    error: unknown,
    scopes: readonly string[],
) => {
    console.error(
        JSON.stringify({
            ...serializeError(error),
            type,
            requestId: ctx.get('requestId'),
            correlationId: ctx.get('correlationId') ?? 'N/A',
            environment: ctx.env.ENVIRONMENT,
            scopes: boundedScopes(scopes),
        }),
    )
}

const logDecision = (
    ctx: Context<THonoInstance>,
    type: 'AUTH_RATE_LIMIT_BLOCKED' | 'AUTH_RATE_LIMIT_SUPPRESSED',
    action: string,
    scopes: readonly string[],
) => {
    console.log(
        JSON.stringify({
            type,
            action: action.slice(0, 128),
            requestId: ctx.get('requestId'),
            correlationId: ctx.get('correlationId') ?? 'N/A',
            environment: ctx.env.ENVIRONMENT,
            scopes: boundedScopes(scopes),
        }),
    )
}

export const authRateLimit = async (
    ctx: Context<THonoInstance>,
    getKeys: () => readonly TAuthRateLimitKey[],
): Promise<TAuthRateLimitDecision> => {
    if (ctx.env.ENVIRONMENT === 'development') {
        return { allowed: true, bypassed: true, scopes: [] }
    }

    const limiter = createRateLimiter({
        namespace: ctx.env.HYPERIONPUB_DO_RL,
        secret: ctx.env.CF_DO_RATE_LIMIT_SECRET,
    })
    const inputs = getKeys().map(({ action, keyParts }) => {
        const definition = AUTH_RATE_LIMIT_POLICIES[action]
        return {
            key: { parts: keyParts, scope: definition.scope },
            policy: definition.policy,
        }
    })
    const scopes = inputs.map(({ key }) => key.scope)

    try {
        const result = await limiter.consumeMany(inputs)
        if (!result.allowed) {
            return {
                allowed: false,
                retryAfter: Math.max(1, Math.ceil(result.retryAfterMs / 1000)),
                scopes,
            }
        }

        return {
            allowed: true,
            bypassed: false,
            limiter,
            reservations: result.reservations,
            scopes,
        }
    } catch (error) {
        if (error instanceof RateLimitConfigurationError) {
            throw configurationError(error)
        }
        throw new AppError(catalog.authRateLimitUnavailable, { cause: error })
    }
}

export const authRateLimitBlockedResponse = (
    ctx: Context<THonoInstance>,
    decision: Extract<TAuthRateLimitDecision, { allowed: false }>,
    options: {
        action: string
        definition: TErrorDefinition
        suppress?: boolean
    },
):
    | ReturnType<typeof apiResponseErrorWrapper>
    | ReturnType<typeof apiResponseOkWrapper<null>> => {
    if (options.suppress) {
        logDecision(
            ctx,
            'AUTH_RATE_LIMIT_SUPPRESSED',
            options.action,
            decision.scopes,
        )
        return apiResponseOkWrapper(ctx, { data: null })
    }

    logDecision(ctx, 'AUTH_RATE_LIMIT_BLOCKED', options.action, decision.scopes)
    ctx.header('Retry-After', String(decision.retryAfter))
    return apiResponseErrorWrapper(ctx, options.definition)
}

export const authRateLimitGuard = (options: {
    action: string
    definition: TErrorDefinition
    keys: (ctx: Context<THonoInstance>) => readonly TAuthRateLimitKey[]
    suppress?: boolean
}) =>
    createMiddleware<THonoInstance>(async (ctx, next) => {
        const decision = await authRateLimit(ctx, () => options.keys(ctx))
        if (!decision.allowed) {
            return authRateLimitBlockedResponse(ctx, decision, options)
        }

        ctx.set('authRateLimitDecision', decision)
        let releaseAttempted = false
        const releaseAfterInfrastructureFailure = async () => {
            if (releaseAttempted) return
            releaseAttempted = true
            await releaseAuthRateLimit(ctx, decision)
        }

        try {
            await next()
            if (ctx.res.status >= 500) {
                await releaseAfterInfrastructureFailure()
                ctx.res = apiResponseErrorWrapper(
                    ctx,
                    catalog.authenticationUnavailable,
                )
            }
        } catch (error) {
            if (error instanceof AppError) {
                if (error.status >= 500) {
                    await releaseAfterInfrastructureFailure()
                }
                throw error
            }

            await releaseAfterInfrastructureFailure()
            throw new AppError(catalog.authenticationUnavailable, {
                cause: error,
            })
        } finally {
            ctx.set('authRateLimitDecision', null)
        }
    })

export const releaseAuthRateLimit = async (
    ctx: Context<THonoInstance>,
    decision: Extract<TAuthRateLimitDecision, { allowed: true }>,
) => {
    if (decision.bypassed) return

    try {
        await decision.limiter.releaseMany(decision.reservations)
    } catch (error) {
        logMutationError(
            ctx,
            'AUTH_RATE_LIMIT_RELEASE_ERROR',
            error,
            decision.scopes,
        )
    }
}

export const resetAuthRateLimit = async (
    ctx: Context<THonoInstance>,
    decision: Extract<TAuthRateLimitDecision, { allowed: true }>,
) => {
    if (decision.bypassed) return

    try {
        await decision.limiter.resetMany(
            decision.reservations.map(({ key, policy }) => ({ key, policy })),
        )
    } catch (error) {
        logMutationError(
            ctx,
            'AUTH_RATE_LIMIT_RESET_ERROR',
            error,
            decision.scopes,
        )
    }
}
