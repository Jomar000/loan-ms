import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import VerifyEmailPage from './VerifyEmailPage.svelte'

type MutationFactory = () => {
    mutationFn: (token: string) => Promise<void>
}

const mocks = vi.hoisted(() => ({
    error: null as Error | null,
    heartbeat: vi.fn(),
    isError: false,
    isSuccess: false,
    url: 'http://localhost/verify-email?token=verification-token',
    verifyEmail: vi.fn(),
}))

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (createOptions: MutationFactory) => {
        const options = createOptions()

        return {
            get error() {
                return mocks.error
            },
            get isError() {
                return mocks.isError
            },
            get isSuccess() {
                return mocks.isSuccess
            },
            mutate: (token: string) => {
                void options.mutationFn(token).catch(() => undefined)
            },
        }
    },
}))
vi.mock('$app/state', () => ({
    page: {
        get url() {
            return new URL(mocks.url)
        },
    },
}))
vi.mock('$env/static/public', () => ({
    PUBLIC_NAME: 'LoanMS',
}))
vi.mock('$lib/clients', () => ({
    authClient: {
        verifyEmail: {
            $post: mocks.verifyEmail,
        },
    },
    heartbeatClient: {
        index: {
            $get: mocks.heartbeat,
        },
    },
}))

describe('VerifyEmailPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.error = null
        mocks.isError = false
        mocks.isSuccess = false
        mocks.url = 'http://localhost/verify-email?token=verification-token'
        mocks.heartbeat.mockResolvedValue({ ok: true })
        mocks.verifyEmail.mockResolvedValue(createSuccessfulResponse())
    })

    it('does not verify when the token is missing', async () => {
        mocks.url = 'http://localhost/verify-email'
        const screen = await render(VerifyEmailPage)

        await expect
            .element(
                screen.getByText('Email verification failed', { exact: true }),
            )
            .toBeVisible()
        expect(mocks.heartbeat).not.toHaveBeenCalled()
        expect(mocks.verifyEmail).not.toHaveBeenCalled()
    })

    it('establishes the CSRF cookie before one verification request', async () => {
        const deferred = createDeferred<{ ok: boolean }>()
        mocks.heartbeat.mockReturnValueOnce(deferred.promise)

        await render(VerifyEmailPage)

        await expect.poll(() => mocks.heartbeat.mock.calls.length).toBe(1)
        expect(mocks.verifyEmail).not.toHaveBeenCalled()

        deferred.resolve({ ok: true })

        await expect.poll(() => mocks.verifyEmail.mock.calls.length).toBe(1)
        expect(mocks.verifyEmail).toHaveBeenCalledWith({
            json: { token: 'verification-token' },
        })
        expect(mocks.heartbeat).toHaveBeenCalledOnce()
        expect(mocks.verifyEmail).toHaveBeenCalledOnce()
    })

    it('shows the success state after verification', async () => {
        mocks.isSuccess = true
        const screen = await render(VerifyEmailPage)

        await expect.element(screen.getByText('Email verified')).toBeVisible()
        await expect.poll(() => mocks.verifyEmail.mock.calls.length).toBe(1)
    })

    it('shows the mutation failure message', async () => {
        mocks.error = new Error('Verification rejected.')
        mocks.isError = true
        mocks.verifyEmail.mockResolvedValue({
            json: async () => ({
                error: { message: 'Verification rejected.' },
                success: false,
            }),
        })
        const screen = await render(VerifyEmailPage)

        await expect
            .element(screen.getByText('Verification rejected.'))
            .toBeVisible()
    })
})

function createSuccessfulResponse() {
    return {
        json: async () => ({
            data: null,
            success: true,
        }),
    }
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, reject, resolve }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
