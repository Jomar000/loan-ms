import {
    AppError,
    BaseError,
    catalog,
    serializeError,
    type TErrorDefinition,
} from '@hyperion/errors'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import type { TErrorLogDetail, THonoInstance } from '../types.js'
import {
    apiResponseErrorWrapper,
    getRequestLogPath,
} from '../utilities/helpers.js'

const httpErrorDefinitions = new Map<number, TErrorDefinition>([
    [
        400,
        catalog.httpBadRequest,
    ],
    [
        401,
        catalog.httpUnauthorized,
    ],
    [
        403,
        catalog.httpForbidden,
    ],
    [
        404,
        catalog.httpNotFound,
    ],
    [
        409,
        catalog.httpConflict,
    ],
    [
        422,
        catalog.httpUnprocessableContent,
    ],
    [
        423,
        catalog.httpLocked,
    ],
    [
        426,
        catalog.httpUpgradeRequired,
    ],
    [
        429,
        catalog.httpRateLimited,
    ],
])

export const errorLogDetail = (
    definition: TErrorDefinition,
): TErrorLogDetail => ({
    category: definition.category,
    internalErrorId: definition.id,
    publicCode: definition.code,
    retryable: definition.retryable,
    status: definition.status,
})

export const normalizeError = (error: unknown) => {
    if (error instanceof AppError) {
        return {
            definition: error.definition,
            logDetail: errorLogDetail(error.definition),
            shouldLog: error.status >= 500,
        }
    }

    if (error instanceof HTTPException) {
        const definition = httpErrorDefinitions.get(error.status)
        if (definition)
            return {
                definition,
                logDetail: errorLogDetail(definition),
                shouldLog: false,
            }
    }

    if (error instanceof BaseError) {
        return {
            definition: catalog.internalServerError,
            logDetail: {
                category: error.category,
                internalErrorId: error.id,
                publicCode: catalog.internalServerError.code,
                retryable: error.retryable,
                status: catalog.internalServerError.status,
            },
            shouldLog: true,
        }
    }

    return {
        definition: catalog.internalServerError,
        logDetail: errorLogDetail(catalog.internalServerError),
        shouldLog: true,
    }
}

export const errorHandler = (
    error: unknown,
    ctx: Context<THonoInstance>,
): ReturnType<typeof apiResponseErrorWrapper> => {
    const normalized = normalizeError(error)
    ctx.header('Audit-Event-Recorded', undefined)
    ctx.set('responseErrorLogDetail', normalized.logDetail)

    if (normalized.shouldLog) {
        console.error(
            JSON.stringify({
                type: 'ERROR',
                requestId: ctx.get('requestId'),
                correlationId: ctx.get('correlationId') ?? 'N/A',
                environment: ctx.env.ENVIRONMENT,
                ...normalized.logDetail,
                method: ctx.req.method,
                path: getRequestLogPath(ctx),
                ...serializeError(error),
            }),
        )
    }

    return apiResponseErrorWrapper(ctx, normalized.definition)
}
