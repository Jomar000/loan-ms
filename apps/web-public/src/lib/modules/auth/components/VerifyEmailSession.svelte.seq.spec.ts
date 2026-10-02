import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import VerifyEmailSessionTestHarness from './VerifyEmailSessionTestHarness.svelte'

const mocks = vi.hoisted(() => ({
    heartbeat: vi.fn(),
    sessionGet: vi.fn(),
    verifyEmail: vi.fn(),
}))

vi.mock('$app/navigation', () => ({
    afterNavigate: (callback: () => void) => callback(),
    beforeNavigate: vi.fn(),
    goto: vi.fn(),
}))
vi.mock('$app/state', () => ({
    page: {
        url: new URL('http://localhost/verify-email?token=verification-token'),
    },
}))
vi.mock('$env/static/public', () => ({
    PUBLIC_NAME: 'Hyperion',
}))
vi.mock('$lib/clients', () => ({
    authClient: {
        session: { $get: mocks.sessionGet },
        signOut: { $post: vi.fn() },
        verifyEmail: { $post: mocks.verifyEmail },
    },
    heartbeatClient: {
        index: { $get: mocks.heartbeat },
    },
}))
vi.mock('$lib/utilities/wsClientManager', () => ({
    wsClientManager: {
        disconnectAll: vi.fn(),
    },
}))

describe('verify-email session integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        history.replaceState({}, '', '/verify-email')
        mocks.heartbeat.mockResolvedValue({ ok: true })
        mocks.verifyEmail.mockResolvedValue(createVerificationResponse(true))
    })

    afterEach(() => {
        history.replaceState({}, '', '/')
        vi.useRealTimers()
    })

    it.each([
        401,
        403,
    ])(
        'keeps one successful verification after session status %i',
        async (status) => {
            const session = createDeferred<{ status: number }>()
            mocks.sessionGet.mockReturnValueOnce(session.promise)
            const screen = await render(VerifyEmailSessionTestHarness)

            await expect.poll(() => mocks.verifyEmail.mock.calls.length).toBe(1)
            await expect
                .element(screen.getByText('Email verified'))
                .toBeVisible()

            session.resolve({ status })

            await expect
                .element(screen.getByText('Email verified'))
                .toBeVisible()
            expect(mocks.sessionGet).toHaveBeenCalledOnce()
            expect(mocks.verifyEmail).toHaveBeenCalledOnce()
        },
    )

    it.each([
        [
            true,
            'Email verified',
        ],
        [
            false,
            'Verification rejected.',
        ],
    ])(
        'keeps the verification result after session failure and retry',
        async (verificationSuccess, expectedResult) => {
            vi.useFakeTimers({
                toFake: [
                    'setTimeout',
                    'clearTimeout',
                ],
            })
            mocks.sessionGet
                .mockRejectedValueOnce(new Error('offline'))
                .mockResolvedValueOnce({ status: 401 })
            mocks.verifyEmail.mockResolvedValue(
                createVerificationResponse(
                    verificationSuccess,
                    'Verification rejected.',
                ),
            )
            const screen = await render(VerifyEmailSessionTestHarness)

            await expect.element(screen.getByText(expectedResult)).toBeVisible()
            expect(mocks.sessionGet).toHaveBeenCalledOnce()
            expect(mocks.verifyEmail).toHaveBeenCalledOnce()

            await vi.advanceTimersByTimeAsync(30_000)

            await expect.poll(() => mocks.sessionGet.mock.calls.length).toBe(2)
            await expect.element(screen.getByText(expectedResult)).toBeVisible()
            expect(mocks.verifyEmail).toHaveBeenCalledOnce()
        },
    )
})

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise
    })

    return { promise, resolve }
}

function createVerificationResponse(success: boolean, message = '') {
    return {
        json: async () =>
            success
                ? { data: null, success: true }
                : { error: { message }, success: false },
    }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
