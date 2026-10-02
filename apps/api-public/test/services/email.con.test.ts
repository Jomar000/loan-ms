import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmailSender } from '../../src/services/email.js'

const emailTestControl = vi.hoisted(() => ({
    resendConstructor: vi.fn(),
    resendSend: vi.fn(),
}))

vi.mock('resend', () => ({
    Resend: class {
        readonly emails = { send: emailTestControl.resendSend }

        constructor(apiKey: string) {
            emailTestControl.resendConstructor(apiKey)
        }
    },
}))

const resendFactory = (apiKey: string) => {
    emailTestControl.resendConstructor(apiKey)

    return {
        emails: {
            send: emailTestControl.resendSend,
        },
    } as never
}

const createTestEmailSender = (
    configuration: Parameters<typeof createEmailSender>[0],
) => createEmailSender(configuration, resendFactory)

const message = {
    subject: 'Test subject',
    text: 'Test body',
    to: 'member@example.com',
}
const account = 'test@example.com'

describe('E-mail sender', () => {
    beforeEach(() => {
        emailTestControl.resendConstructor.mockReset()
        emailTestControl.resendSend.mockReset()
    })

    it('constructs and invokes only Resend when selected', async () => {
        emailTestControl.resendSend.mockResolvedValue({ error: null })
        const sender = createTestEmailSender({
            account,
            apiKey: 'test-key',
            enabled: true,
            provider: 'resend',
        })

        expect(emailTestControl.resendConstructor).not.toHaveBeenCalled()
        await expect(sender.send(message)).resolves.toBeUndefined()

        expect(emailTestControl.resendConstructor).toHaveBeenCalledOnce()
        expect(emailTestControl.resendConstructor).toHaveBeenCalledWith(
            'test-key',
        )
        expect(emailTestControl.resendSend).toHaveBeenCalledWith({
            ...message,
            from: account,
        })
    })

    it('invokes only Cloudflare with the structured message when selected', async () => {
        const cloudflareSend = vi.fn().mockResolvedValue({ messageId: 'test' })
        const sender = createTestEmailSender({
            account,
            binding: { send: cloudflareSend } as never,
            enabled: true,
            provider: 'cloudflare',
        })

        await expect(sender.send(message)).resolves.toBeUndefined()

        expect(cloudflareSend).toHaveBeenCalledOnce()
        expect(cloudflareSend).toHaveBeenCalledWith({
            ...message,
            from: account,
        })
        expect(emailTestControl.resendConstructor).not.toHaveBeenCalled()
        expect(emailTestControl.resendSend).not.toHaveBeenCalled()
    })

    it('throws resolved Resend errors without falling back', async () => {
        const providerError = { name: 'application_error' }
        emailTestControl.resendSend.mockResolvedValue({ error: providerError })
        const sender = createTestEmailSender({
            account,
            apiKey: 'test-key',
            enabled: true,
            provider: 'resend',
        })

        await expect(sender.send(message)).rejects.toMatchObject({
            cause: providerError,
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
        })
        expect(emailTestControl.resendSend).toHaveBeenCalledOnce()
    })

    it('classifies rejected Resend calls without falling back', async () => {
        const providerError = new Error('Resend unavailable.')
        emailTestControl.resendSend.mockRejectedValue(providerError)
        const sender = createTestEmailSender({
            account,
            apiKey: 'test-key',
            enabled: true,
            provider: 'resend',
        })

        await expect(sender.send(message)).rejects.toMatchObject({
            cause: providerError,
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
        })
        expect(emailTestControl.resendConstructor).toHaveBeenCalledOnce()
        expect(emailTestControl.resendSend).toHaveBeenCalledOnce()
    })

    it('classifies selected-provider rejections without falling back', async () => {
        const providerError = new Error('Cloudflare unavailable.')
        const cloudflareSend = vi.fn().mockRejectedValue(providerError)
        const sender = createTestEmailSender({
            account,
            binding: { send: cloudflareSend } as never,
            enabled: true,
            provider: 'cloudflare',
        })

        await expect(sender.send(message)).rejects.toMatchObject({
            cause: providerError,
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
        })
        expect(emailTestControl.resendConstructor).not.toHaveBeenCalled()
        expect(emailTestControl.resendSend).not.toHaveBeenCalled()
    })

    it('classifies Resend construction failures without sending', async () => {
        const providerError = new Error('Resend initialization failed.')
        emailTestControl.resendConstructor.mockImplementation(() => {
            throw providerError
        })
        const sender = createTestEmailSender({
            account,
            apiKey: 'test-key',
            enabled: true,
            provider: 'resend',
        })

        await expect(sender.send(message)).rejects.toMatchObject({
            cause: providerError,
            code: 'SERVICE_UNAVAILABLE',
            status: 503,
        })
        expect(emailTestControl.resendSend).not.toHaveBeenCalled()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
