/**
 * Shared Contracts
 */

import type { TPublicCode } from '@loanms/errors'

export * from './apiKeyPermission.js'

export type TValidatorIssue = {
    path?: PropertyKey[]
    code: string
    message: string
    input?: unknown
}

export type TApiResponseOk<T> = {
    success: true
    data: T
    error?: null
}

export type TApiResponseCursorPaginatedOk<T> = TApiResponseOk<T> & {
    limit: number
    nextCursor: string | null
}

export type TApiResponsePaginatedOk<T> = TApiResponseOk<T> & {
    count: number
    limit: number
    offset: number
}

export type TApiResponseError = {
    success: false
    data?: null
    error: {
        requestId: string
        code: TPublicCode
        message: string
        validatorIssues?: TValidatorIssue[]
    }
}

export type TApiResponse<T> = TApiResponseOk<T> | TApiResponseError

export type TApiResponseCursorPaginated<T> =
    TApiResponseCursorPaginatedOk<T> | TApiResponseError

export type TApiResponsePaginated<T> =
    TApiResponsePaginatedOk<T> | TApiResponseError

/**
 * Hono
 */

export type TBaseHonoBindings<TBindings extends object = object> = TBindings

export type TBaseHonoVariables<TVariables extends object = object> = TVariables

export type TBaseHonoInstance<
    TBindings extends object = object,
    TVariables extends object = object,
> = {
    Bindings: TBaseHonoBindings<TBindings>
    Variables: TBaseHonoVariables<TVariables>
}
