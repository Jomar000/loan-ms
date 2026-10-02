import { catalog } from '@hyperion/errors'
import { createMiddleware } from 'hono/factory'

import { isObjectStorageFeatureEnabled } from '../../config/objectStorage.js'
import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

export const objectStorageFeatureGuard = () => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        if (!isObjectStorageFeatureEnabled(ctx.env)) {
            return apiResponseErrorWrapper(ctx, catalog.featureNotFound)
        }

        await next()
    })
}
