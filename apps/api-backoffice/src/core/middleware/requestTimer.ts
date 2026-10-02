import { BaseError } from '@loanms/errors'
import { createMiddleware } from 'hono/factory'

import type { TErrorLogDetail, THonoInstance } from '../../types.js'
import { getRequestLogPath } from '../../utilities/helpers.js'
import { errorLogDetail, normalizeError } from '../errorHandler.js'

export const requestTimer = createMiddleware<THonoInstance>(
    async (ctx, next) => {
        const start = Date.now()
        let thrownLogDetail: TErrorLogDetail | undefined

        try {
            await next()
        } catch (err) {
            const error =
                err instanceof Error
                    ? err
                    : new BaseError(
                          {
                              category: 'internal',
                              id: 'UNEXPECTED_THROWN_VALUE',
                              message:
                                  'An unexpected non-Error value was thrown.',
                              retryable: true,
                          },
                          { cause: err },
                      )
            thrownLogDetail = normalizeError(error).logDetail
            throw error
        } finally {
            const responseDefinition = ctx.get('responseError') ?? undefined
            const logDetail =
                thrownLogDetail ??
                ctx.get('responseErrorLogDetail') ??
                (responseDefinition
                    ? errorLogDetail(responseDefinition)
                    : undefined)
            console.log(
                JSON.stringify({
                    type: 'REQUEST',
                    requestId: ctx.get('requestId'),
                    correlationId: ctx.get('correlationId') ?? 'N/A',
                    method: ctx.req.method,
                    path: getRequestLogPath(ctx),
                    status: logDetail?.status ?? ctx.res.status,
                    durationMs: Date.now() - start,
                    environment: ctx.env.ENVIRONMENT,
                    internalErrorId: logDetail?.internalErrorId ?? null,
                    publicCode: logDetail?.publicCode ?? null,
                    category: logDetail?.category ?? null,
                    retryable: logDetail?.retryable ?? null,
                }),
            )
        }
    },
)
