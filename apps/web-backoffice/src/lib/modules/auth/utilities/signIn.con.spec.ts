import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signInWithCaptcha } from '$lib/modules/auth/utilities/signIn.js'

type ErrorToastOptions = {
    action: {
        label: string
        onClick: (event: { preventDefault: () => void }) => Promise<void>
    }
    description: string
    duration: number
    id: string
}

const mocks = vi.hoisted(() => ({
    clipboardWrite: vi.fn(),
    post: vi.fn(),
    requestCaptchaToken: vi.fn(),
    toastDismiss: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn(),
}))

const payload = {
    accountId: 'member',
    organizationId: 'organization',
    password: 'P@ssw0rd1234',
}

vi.mock('svelte-sonner', () => ({
    toast: {
        dismiss: mocks.toastDismiss,
        error: mocks.toastError,
        success: mocks.toastSuccess,
        warning: mocks.toastWarning,
    },
}))

vi.mock('$lib/clients', () => ({
    authClient: {
        signIn: {
            email: { $post: mocks.post },
            username: { $post: mocks.post },
        },
    },
}))
vi.mock('$lib/utilities/helpers', () => ({
    getErrorMessage: (error: unknown, fallback: string) =>
        error instanceof Error && error.message.trim() !== ''
            ? error.message
            : fallback,
    requestCaptchaToken: mocks.requestCaptchaToken,
}))

describe('signInWithCaptcha', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal('navigator', {
            clipboard: { writeText: mocks.clipboardWrite },
        })

        mocks.clipboardWrite.mockResolvedValue(undefined)
        mocks.requestCaptchaToken.mockResolvedValue('captcha-token')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('does not report post-success navigation cleanup as an API error', async () => {
        mocks.post.mockResolvedValue({
            json: async () => ({ success: true, data: null }),
        })
        const cleanupError = new Error('cleanup failed')

        await expect(
            runSignIn(vi.fn().mockRejectedValue(cleanupError)),
        ).rejects.toBe(cleanupError)

        expect(mocks.toastDismiss).toHaveBeenCalledWith('sign-in-error')
        expect(mocks.toastError).not.toHaveBeenCalled()
    })

    it('uses scoped dismissal and a stable actionable API error toast', async () => {
        mocks.post.mockResolvedValue({
            json: async () => ({
                success: false,
                error: { message: 'Invalid credentials.' },
            }),
        })

        await expect(runSignIn()).rejects.toThrow('Invalid credentials.')

        expect(mocks.toastDismiss).toHaveBeenCalledOnce()
        expect(mocks.toastDismiss).toHaveBeenCalledWith('sign-in-error')
        expect(mocks.toastError).toHaveBeenCalledWith(
            'Sign-in failed',
            expect.objectContaining({
                action: expect.objectContaining({ label: 'COPY' }),
                description: 'Invalid credentials.',
                duration: 15000,
                id: 'sign-in-error',
            }),
        )
    })

    it('replaces the error toast after copying its message', async () => {
        mocks.post.mockRejectedValue(new Error('Network unavailable.'))

        await expect(runSignIn()).rejects.toThrow('Network unavailable.')

        const preventDefault = vi.fn()
        await getErrorToastOptions().action.onClick({ preventDefault })

        expect(preventDefault).toHaveBeenCalledOnce()
        expect(mocks.clipboardWrite).toHaveBeenCalledWith(
            'Network unavailable.',
        )
        expect(mocks.toastSuccess).toHaveBeenCalledWith('Error copied', {
            duration: 3000,
            id: 'sign-in-error',
        })
    })

    it('retains the error and deduplicates clipboard failure feedback', async () => {
        mocks.post.mockRejectedValue(new Error('Network unavailable.'))
        mocks.clipboardWrite.mockRejectedValue(new Error('Clipboard blocked.'))

        await expect(runSignIn()).rejects.toThrow('Network unavailable.')

        await getErrorToastOptions().action.onClick({
            preventDefault: vi.fn(),
        })

        expect(mocks.toastSuccess).not.toHaveBeenCalled()
        expect(mocks.toastWarning).toHaveBeenCalledWith('Copy unavailable', {
            description: 'Copy the error message manually.',
            duration: 8000,
            id: 'sign-in-copy',
        })
        expect(mocks.toastDismiss).toHaveBeenCalledTimes(1)
    })
})

function getErrorToastOptions() {
    const options = mocks.toastError.mock.calls[0]?.[1]
    if (!options) throw new Error('Sign-in error toast was not shown.')

    return options as ErrorToastOptions
}

function runSignIn(onSuccess = vi.fn()) {
    return signInWithCaptcha({
        onCaptchaResolved: vi.fn(),
        onSuccess,
        payload,
        siteKey: 'site-key',
    })
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
