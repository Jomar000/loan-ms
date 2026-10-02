import type { Context } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { THonoInstance } from '../../src/types.js'
import { CfTurnstileVerifier } from '../../src/utilities/cfTurnstileVerifier.js'

const SECRET_KEY = 'PRIVATE_SECRET_KEY'

const createVerifier = (env: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
        ipAddress: 'N/A',
        requestId: 'test-request',
    }
    const ctx = {
        env: {
            CF_TURNSTILE_BYPASS: 0,
            CF_TURNSTILE_SECRET_KEY: SECRET_KEY,
            CF_TURNSTILE_SITE_VERIFY:
                'https://challenges.example.test/siteverify',
            CF_TURNSTILE_SITE_VERIFY_TIMEOUT_MS: 1_000,
            CF_TURNSTILE_TOKEN_MAX_LENGTH: 2_048,
            URL_FRONTEND: 'https://app.example.test',
            ...env,
        },
        get: (key: string) => values[key],
    } as unknown as Context<THonoInstance>

    return new CfTurnstileVerifier(ctx)
}

const spyOnLogs = () => ({
    error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
    log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
})

const readLast = (spy: ReturnType<typeof vi.spyOn>) =>
    JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>

const siteVerifyReturns = (body: unknown, init?: ResponseInit) =>
    vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(body), init))

const validate = (verifier: CfTurnstileVerifier, action = 'signIn') =>
    verifier.validate({ token: 'token-value', action })

afterEach(() => {
    vi.restoreAllMocks()
})

describe('Cloudflare Turnstile verifier logging', () => {
    it('logs a bypass as a fixed reason without calling SiteVerify.', async () => {
        const logs = spyOnLogs()
        const fetchSpy = vi.spyOn(globalThis, 'fetch')

        await expect(
            validate(createVerifier({ CF_TURNSTILE_BYPASS: 1 })),
        ).resolves.toBe(true)

        expect(readLast(logs.log)).toEqual({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: true,
            reason: 'CAPTCHA bypass enabled.',
        })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('rejects an invalid token with a fixed reason.', async () => {
        const logs = spyOnLogs()

        await expect(
            createVerifier().validate({
                token: 'has whitespace',
                action: 'signIn',
            }),
        ).resolves.toBe(false)

        expect(readLast(logs.error)).toEqual({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: false,
            reason: 'Invalid CAPTCHA token.',
        })
    })

    it('logs a successful verification with its allowlisted detail.', async () => {
        const logs = spyOnLogs()
        siteVerifyReturns({
            success: true,
            hostname: 'app.example.test',
            action: 'signIn',
        })

        await expect(validate(createVerifier())).resolves.toBe(true)

        expect(readLast(logs.log)).toEqual({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: true,
            reason: 'CAPTCHA validation succeeded.',
            detail: { hostname: 'app.example.test', action: 'signIn' },
        })
        expect(JSON.stringify(readLast(logs.log))).not.toContain(SECRET_KEY)
    })

    it('logs a failed challenge without copying the response.', async () => {
        const logs = spyOnLogs()
        siteVerifyReturns({
            success: false,
            'error-codes': ['PRIVATE_CODE'],
            hostname: 'PRIVATE_HOSTNAME',
        })

        await expect(validate(createVerifier())).resolves.toBe(false)

        expect(readLast(logs.error)).toEqual({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: false,
            reason: 'SiteVerify challenge failed.',
        })
    })

    it('logs only the status of a non-OK response.', async () => {
        const logs = spyOnLogs()
        siteVerifyReturns('PRIVATE_BODY', {
            status: 503,
            statusText: 'PRIVATE_STATUS_TEXT',
        })

        await expect(validate(createVerifier())).resolves.toBe(false)

        const entry = readLast(logs.error)
        expect(entry).toEqual({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: false,
            reason: 'SiteVerify returned a non-OK response.',
            detail: { status: 503 },
        })
        expect(JSON.stringify(entry)).not.toContain('PRIVATE_')
    })

    it('logs schema issue codes and paths but never the received values.', async () => {
        const logs = spyOnLogs()
        siteVerifyReturns({
            success: true,
            hostname: 42,
            action: 'PRIVATE_ACTION',
        })

        await expect(validate(createVerifier())).resolves.toBe(false)

        const entry = readLast(logs.error)
        expect(entry).toMatchObject({
            reason: 'Malformed SiteVerify response.',
            detail: {
                issues: [
                    {
                        code: 'invalid_type',
                        path: 'hostname',
                    },
                ],
            },
        })
        expect(JSON.stringify(entry)).not.toContain('PRIVATE_')
    })

    it('logs bounded expected and received values for a mismatch.', async () => {
        const logs = spyOnLogs()
        siteVerifyReturns({
            success: true,
            hostname: `${'h'.repeat(1_000)}.example.test`,
            action: 'signIn',
        })

        await expect(validate(createVerifier())).resolves.toBe(false)

        const hostnameEntry = readLast(logs.error) as {
            reason: string
            detail: { expectedHostname: string; receivedHostname: string }
        }
        expect(hostnameEntry.reason).toBe('SiteVerify hostname mismatch.')
        expect(hostnameEntry.detail.expectedHostname).toBe('app.example.test')
        expect(hostnameEntry.detail.receivedHostname).toHaveLength(255)

        siteVerifyReturns({
            success: true,
            hostname: 'app.example.test',
            action: 'other',
        })

        await expect(validate(createVerifier())).resolves.toBe(false)

        expect(readLast(logs.error)).toMatchObject({
            reason: 'SiteVerify action mismatch.',
            detail: { expectedAction: 'signIn', receivedAction: 'other' },
        })
    })

    it('serializes a caught request failure at the top level and redacts it.', async () => {
        const logs = spyOnLogs()
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(
            new TypeError(
                'fetch failed postgres://user:PRIVATE_PASSWORD@db.internal/app',
                {
                    cause: Object.assign(
                        new Error('connect ECONNREFUSED Bearer PRIVATE_TOKEN'),
                        { code: 'ECONNREFUSED' },
                    ),
                },
            ),
        )

        await expect(validate(createVerifier())).resolves.toBe(false)

        const entry = readLast(logs.error)
        expect(entry).toMatchObject({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: false,
            reason: 'SiteVerify request failed.',
            name: 'TypeError',
            message: 'fetch failed postgres://<redacted>@db.internal/app',
            causes: [
                {
                    name: 'Error',
                    message: 'connect ECONNREFUSED Bearer <redacted>',
                    code: 'ECONNREFUSED',
                },
            ],
        })
        expect(entry).not.toHaveProperty('detail')
        expect(JSON.stringify(entry)).not.toContain('PRIVATE_')
    })

    it('logs a non-JSON SiteVerify body as a failed request instead of rejecting.', async () => {
        const logs = spyOnLogs()
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<html>gateway error</html>', { status: 200 }),
        )

        await expect(validate(createVerifier())).resolves.toBe(false)

        const entry = readLast(logs.error)
        expect(entry).toMatchObject({
            type: 'CF_TURNSTILE',
            requestId: 'test-request',
            success: false,
            reason: 'SiteVerify request failed.',
            name: 'SyntaxError',
        })
        expect(entry).not.toHaveProperty('detail')
    })

    it('keeps the timeout armed while the SiteVerify body is read.', async () => {
        const logs = spyOnLogs()
        // A body that never completes on its own and errors when aborted.
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
            const signal = init?.signal
            return new Response(
                new ReadableStream({
                    start(controller) {
                        signal?.addEventListener('abort', () =>
                            controller.error(signal.reason),
                        )
                    },
                }),
            )
        })

        await expect(
            validate(
                createVerifier({ CF_TURNSTILE_SITE_VERIFY_TIMEOUT_MS: 20 }),
            ),
        ).resolves.toBe(false)

        expect(readLast(logs.error)).toMatchObject({
            type: 'CF_TURNSTILE',
            success: false,
            reason: 'SiteVerify request failed.',
        })
    })

    it('keeps serialized error fields out of expected-response logs.', async () => {
        const logs = spyOnLogs()
        siteVerifyReturns({ success: false })

        await validate(createVerifier())

        const entry = readLast(logs.error)
        for (const field of [
            'name',
            'message',
            'stack',
            'causes',
        ])
            expect(entry).not.toHaveProperty(field)
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
