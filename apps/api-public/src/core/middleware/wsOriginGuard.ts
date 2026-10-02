import { catalog } from '@loanms/errors'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

export const wsOriginGuard = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        const origin = ctx.req.header('origin')

        if (!origin) {
            return apiResponseErrorWrapper(ctx, catalog.originMissing)
        }

        if (ctx.env.URL_FRONTEND !== origin) {
            return apiResponseErrorWrapper(ctx, catalog.originInvalid)
        }

        await next()
    })
}
