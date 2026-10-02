import { serializeError } from '@loanms/errors'
import type { Context } from 'hono'
import { z } from 'zod'

import type { THonoInstance } from '../types.js'

/**
 * CloudFlare Turnstile
 *
 * @link
 * https://developers.cloudflare.com/turnstile
 */
const cfTurnstileSiteVerifyResponseSchema = z.discriminatedUnion('success', [
    z.object({
        success: z.literal(true),
        hostname: z.string().min(1),
        action: z.string().min(1),
    }),
    z.object({
        success: z.literal(false),
        hostname: z.string().min(1).optional(),
        action: z.string().min(1).optional(),
    }),
])

const MAX_LOG_TEXT_LENGTH = 255
const MAX_LOG_ISSUES = 8

/** Expected SiteVerify outcomes only; a caught exception is serialized at the top level instead. */
type TCfTurnstileLogDetail = {
    status?: number
    issues?: { code: string; path: string }[]
    expectedHostname?: string
    receivedHostname?: string
    expectedAction?: string
    receivedAction?: string
    hostname?: string
    action?: string
}

/** SiteVerify echoes the client-supplied hostname and action, so bound them. */
const boundLogText = (value: string) => value.slice(0, MAX_LOG_TEXT_LENGTH)

export class CfTurnstileVerifier {
    constructor(private readonly ctx: Context<THonoInstance>) {}

    isBypassed() {
        return Number(this.ctx.env.CF_TURNSTILE_BYPASS) === 1
    }

    private logResult(
        result: boolean,
        reason: string,
        context: { detail?: TCfTurnstileLogDetail; error?: unknown } = {},
    ) {
        const entry = {
            ...('error' in context ? serializeError(context.error) : {}),
            type: 'CF_TURNSTILE',
            requestId: this.ctx.get('requestId'),
            success: result,
            reason,
            ...(context.detail ? { detail: context.detail } : {}),
        }

        if (result) {
            console.log(JSON.stringify(entry))
        } else {
            console.error(JSON.stringify(entry))
        }

        return result
    }

    private sanitizeToken(token: string) {
        const sanitizedToken = token.trim()

        if (
            !sanitizedToken ||
            sanitizedToken.length >
                this.ctx.env.CF_TURNSTILE_TOKEN_MAX_LENGTH ||
            /\s/.test(sanitizedToken)
        ) {
            return null
        }

        return sanitizedToken
    }

    async validate({ token, action }: { token: string; action: string }) {
        /////////////////////////////////
        // STEP 1: Verification Bypass //
        /////////////////////////////////

        if (this.isBypassed()) {
            return this.logResult(true, 'CAPTCHA bypass enabled.')
        }

        ////////////////////////////////
        // STEP 2: Token Sanitization //
        ////////////////////////////////

        const sanitizedToken = this.sanitizeToken(token)
        if (!sanitizedToken) {
            return this.logResult(false, 'Invalid CAPTCHA token.')
        }

        /////////////////////////////////////
        // STEP 3: SiteVerify Verification //
        /////////////////////////////////////

        const formData = new FormData()
        formData.set('secret', this.ctx.env.CF_TURNSTILE_SECRET_KEY)
        formData.set('response', sanitizedToken)

        const ipAddress = this.ctx.get('ipAddress')
        if (ipAddress !== 'N/A') {
            formData.set('remoteip', ipAddress)
        }

        const abortController = new AbortController()
        const abortTimeout = setTimeout(
            () => abortController.abort(),
            Number(this.ctx.env.CF_TURNSTILE_SITE_VERIFY_TIMEOUT_MS),
        )

        try {
            const response = await fetch(
                this.ctx.env.CF_TURNSTILE_SITE_VERIFY,
                {
                    body: formData,
                    method: 'POST',
                    signal: abortController.signal,
                },
            )

            // Awaited so a failed body read is caught here and the timeout
            // stays armed until the body has been read.
            return await this.validateResponse(response, action)
        } catch (error) {
            return this.logResult(false, 'SiteVerify request failed.', {
                error,
            })
        } finally {
            clearTimeout(abortTimeout)
        }
    }

    private async validateResponse(response: Response, action: string) {
        if (!response.ok) {
            return this.logResult(
                false,
                'SiteVerify returned a non-OK response.',
                { detail: { status: response.status } },
            )
        }

        const validator = cfTurnstileSiteVerifyResponseSchema.safeParse(
            await response.json(),
        )

        if (!validator.success) {
            return this.logResult(false, 'Malformed SiteVerify response.', {
                detail: {
                    issues: validator.error.issues
                        .slice(0, MAX_LOG_ISSUES)
                        .map((issue) => ({
                            code: issue.code,
                            path: issue.path.map(String).join('.').slice(0, 64),
                        })),
                },
            })
        }

        const result = validator.data

        if (result.success !== true) {
            return this.logResult(false, 'SiteVerify challenge failed.')
        }

        const expectedHostname = new URL(this.ctx.env.URL_FRONTEND).hostname

        if (result.hostname !== expectedHostname) {
            return this.logResult(false, 'SiteVerify hostname mismatch.', {
                detail: {
                    expectedHostname: boundLogText(expectedHostname),
                    receivedHostname: boundLogText(result.hostname),
                },
            })
        }

        if (result.action !== action) {
            return this.logResult(false, 'SiteVerify action mismatch.', {
                detail: {
                    expectedAction: boundLogText(action),
                    receivedAction: boundLogText(result.action),
                },
            })
        }

        return this.logResult(true, 'CAPTCHA validation succeeded.', {
            detail: {
                hostname: boundLogText(result.hostname),
                action: boundLogText(result.action),
            },
        })
    }
}
