import { zValidator } from '@hono/zod-validator'
import { catalog } from '@hyperion/errors'
import type { Context, ValidationTargets } from 'hono'
import type { ZodType } from 'zod'

import type { THonoInstance } from '../../types.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

/**
 * Request Validator Middleware
 *
 * @description
 * Create a Zod request validator with the app's standard validation error response.
 */
export const validateRequest = <
    TTarget extends keyof ValidationTargets,
    TSchema extends ZodType,
>(
    target: TTarget,
    schema: TSchema,
) => {
    return zValidator(target, schema, (result, ctx) => {
        if (result.success) return

        return apiResponseErrorWrapper(
            ctx as Context<THonoInstance>,
            catalog.dataValidation,
            { validatorIssues: result.error.issues },
        )
    })
}
