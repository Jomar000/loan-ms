import {
    RateLimitConfigurationError,
    RateLimitUnavailableError,
} from './errors.js'
import type { TRateLimitPolicy } from './policy.js'
import { deriveRateLimitTarget, type TRateLimitKey } from './transport.js'
import type {
    TRateLimitConsumeInput,
    TRateLimitConsumeManyResult,
    TRateLimitConsumeRequest,
    TRateLimitConsumeResponse,
    TRateLimitConsumeResult,
    TRateLimitMutationResponse,
    TRateLimitReleaseRequest,
    TRateLimitReservation,
    TRateLimitResetRequest,
} from './types.js'

export {
    RateLimitConfigurationError,
    RateLimitUnavailableError,
} from './errors.js'
export type { TRateLimitPolicy } from './policy.js'
export type { TRateLimitKey } from './transport.js'
export type {
    TRateLimitConsumeInput,
    TRateLimitConsumeManyResult,
    TRateLimitConsumeResult,
    TRateLimitReservation,
} from './types.js'

export type TRateLimitStub = {
    consume(input: TRateLimitConsumeRequest): Promise<TRateLimitConsumeResponse>
    release(
        input: TRateLimitReleaseRequest,
    ): Promise<TRateLimitMutationResponse>
    reset(input: TRateLimitResetRequest): Promise<TRateLimitMutationResponse>
}

export type TRateLimitNamespace = {
    getByName(name: string): TRateLimitStub
}

const toUnavailableError = (error: unknown) =>
    error instanceof RateLimitUnavailableError
        ? error
        : new RateLimitUnavailableError('Rate limiting is unavailable.', {
              cause: error,
          })

export const createRateLimiter = ({
    namespace,
    secret,
}: {
    namespace: TRateLimitNamespace
    secret: string
}) => {
    const resolve = (key: TRateLimitKey, policy: TRateLimitPolicy) =>
        deriveRateLimitTarget({ key, policy, secret })

    const consume = async ({
        key,
        policy,
    }: TRateLimitConsumeInput): Promise<TRateLimitConsumeResult> => {
        const target = await resolve(key, policy)

        try {
            const response = await namespace
                .getByName(target.objectName)
                .consume({
                    keyPrefix: target.keyPrefix,
                    policy,
                    scope: key.scope,
                })

            if (!response.allowed) return response

            return {
                allowed: true,
                remaining: response.remaining,
                reservation: {
                    key,
                    policy,
                    reservationId: response.reservationId,
                },
                retryAfterMs: 0,
            }
        } catch (error) {
            if (error instanceof RateLimitConfigurationError) throw error
            throw toUnavailableError(error)
        }
    }

    const release = async (reservation: TRateLimitReservation) => {
        const target = await resolve(reservation.key, reservation.policy)

        try {
            return await namespace.getByName(target.objectName).release({
                keyPrefix: target.keyPrefix,
                policy: reservation.policy,
                reservationId: reservation.reservationId,
                scope: reservation.key.scope,
            })
        } catch (error) {
            if (error instanceof RateLimitConfigurationError) throw error
            throw toUnavailableError(error)
        }
    }

    const releaseManySettled = (
        reservations: readonly TRateLimitReservation[],
    ) =>
        Promise.allSettled(
            reservations.map((reservation) => release(reservation)),
        )

    const releaseMany = async (
        reservations: readonly TRateLimitReservation[],
    ) => {
        const outcomes = await releaseManySettled(reservations)
        const failures = outcomes.flatMap((outcome) =>
            outcome.status === 'rejected' ? [outcome.reason] : [],
        )

        if (failures.length > 0) {
            throw new AggregateError(
                failures,
                'One or more rate-limit reservations could not be released.',
            )
        }
    }

    const consumeMany = async (
        inputs: readonly TRateLimitConsumeInput[],
    ): Promise<TRateLimitConsumeManyResult> => {
        if (inputs.length < 1) {
            throw new RateLimitConfigurationError(
                'At least one rate-limit key is required.',
            )
        }

        const outcomes = await Promise.allSettled(inputs.map(consume))
        const reservations = outcomes.flatMap((outcome) =>
            outcome.status === 'fulfilled' && outcome.value.allowed
                ? [outcome.value.reservation]
                : [],
        )
        const failed = outcomes.find(
            (outcome): outcome is PromiseRejectedResult =>
                outcome.status === 'rejected',
        )

        if (failed) {
            await releaseManySettled(reservations)
            throw failed.reason
        }

        const blocked = outcomes.flatMap((outcome) =>
            outcome.status === 'fulfilled' && !outcome.value.allowed
                ? [outcome.value]
                : [],
        )
        if (blocked.length > 0) {
            await releaseManySettled(reservations)

            return {
                allowed: false,
                retryAfterMs: Math.max(
                    ...blocked.map(({ retryAfterMs }) => retryAfterMs),
                ),
            }
        }

        return { allowed: true, reservations }
    }

    const reset = async ({ key, policy }: TRateLimitConsumeInput) => {
        const target = await resolve(key, policy)

        try {
            return await namespace.getByName(target.objectName).reset({
                keyPrefix: target.keyPrefix,
                policy,
                scope: key.scope,
            })
        } catch (error) {
            if (error instanceof RateLimitConfigurationError) throw error
            throw toUnavailableError(error)
        }
    }

    const resetMany = async (inputs: readonly TRateLimitConsumeInput[]) => {
        const outcomes = await Promise.allSettled(inputs.map(reset))
        const failures = outcomes.flatMap((outcome) =>
            outcome.status === 'rejected' ? [outcome.reason] : [],
        )

        if (failures.length > 0) {
            throw new AggregateError(
                failures,
                'One or more rate-limit keys could not be reset.',
            )
        }
    }

    return {
        consume,
        consumeMany,
        release,
        releaseMany,
        reset,
        resetMany,
    }
}
