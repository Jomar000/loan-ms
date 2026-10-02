import { catalog } from '@hyperion/errors'
import { createMiddleware } from 'hono/factory'

import { isApiKeyFeatureEnabled } from '../../config/apiKey.js'
import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

export const apiKeyFeatureGuard = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        if (!isApiKeyFeatureEnabled(ctx.env)) {
            return apiResponseErrorWrapper(ctx, catalog.featureNotFound)
        }

        await next()
    })
}
