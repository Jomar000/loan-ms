import { catalog } from '@hyperion/errors'
import { createMiddleware } from 'hono/factory'

import type { THonoInstance } from '../../types.js'
import { CfTurnstileVerifier } from '../../utilities/cfTurnstileVerifier.js'
import { apiResponseErrorWrapper } from '../../utilities/helpers.js'

/**
 * @description
 * Validates the Cloudflare Turnstile CAPTCHA token and expected action.
 */
export const captchaHandler = (action: string) => {
    return createMiddleware<THonoInstance>(async (ctx, next) => {
        const cfTurnstileVerifier = new CfTurnstileVerifier(ctx)

        if (cfTurnstileVerifier.isBypassed()) {
            await next()
            return
        }

        const token = ctx.req.header('x-captcha-response')

        if (!token) {
            return apiResponseErrorWrapper(ctx, catalog.captchaMissing)
        }

        const isValid = await cfTurnstileVerifier.validate({
            token,
            action,
        })

        if (!isValid) {
            return apiResponseErrorWrapper(ctx, catalog.captchaFailed)
        }

        await next()
    })
}
