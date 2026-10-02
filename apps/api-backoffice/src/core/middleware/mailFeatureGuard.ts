import { catalog } from '@hyperion/errors'
import { createMiddleware } from 'hono/factory'

import { isMailerFeatureEnabled } from '../../config/mailer.js'
import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

export const mailFeatureGuard = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        if (!isMailerFeatureEnabled(ctx.env)) {
            return apiResponseErrorWrapper(ctx, catalog.featureNotFound)
        }

        await next()
    })
}
