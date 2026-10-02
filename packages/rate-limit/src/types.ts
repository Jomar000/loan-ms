import type { TRateLimitPolicy } from './policy.js'
import type { TRateLimitKey } from './transport.js'

export type TRateLimitRpcKey = Readonly<{
    keyPrefix: string
    policy: TRateLimitPolicy
    scope: string
}>

export type TRateLimitConsumeRequest = TRateLimitRpcKey

export type TRateLimitReleaseRequest = TRateLimitRpcKey &
    Readonly<{
        reservationId: string
    }>

export type TRateLimitResetRequest = TRateLimitRpcKey

export type TRateLimitConsumeResponse =
    | Readonly<{
          allowed: true
          remaining: number
          reservationId: string
          retryAfterMs: 0
      }>
    | Readonly<{
          allowed: false
          remaining: 0
          retryAfterMs: number
      }>

export type TRateLimitMutationResponse = Readonly<{
    ok: true
}>

export type TRateLimitReservation = Readonly<{
    key: TRateLimitKey
    policy: TRateLimitPolicy
    reservationId: string
}>

export type TRateLimitConsumeInput = Readonly<{
    key: TRateLimitKey
    policy: TRateLimitPolicy
}>

export type TRateLimitConsumeResult =
    | Readonly<{
          allowed: true
          remaining: number
          reservation: TRateLimitReservation
          retryAfterMs: 0
      }>
    | Readonly<{
          allowed: false
          remaining: 0
          retryAfterMs: number
      }>

export type TRateLimitConsumeManyResult =
    | Readonly<{
          allowed: true
          reservations: readonly TRateLimitReservation[]
      }>
    | Readonly<{
          allowed: false
          retryAfterMs: number
      }>
