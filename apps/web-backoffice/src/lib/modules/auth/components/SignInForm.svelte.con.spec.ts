import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { userEvent } from 'vitest/browser'

import SignInFormTestHarness from './SignInFormTestHarness.svelte'

type MutationFactory = () => {
    mutationFn: (variables: unknown) => unknown
}

const mocks = vi.hoisted(() => ({ signInWithCaptcha: vi.fn() }))

let consoleWarnSpy: ReturnType<typeof vi.spyOn>

vi.mock('@tanstack/svelte-query', () => ({
    createMutation: (createOptions: MutationFactory) => {
        const options = createOptions()
        return {
            isPending: false,
            mutateAsync: (variables: unknown) =>
                Promise.resolve(options.mutationFn(variables)),
        }
    },
}))
vi.mock('$app/state', () => ({
    page: { url: new URL('http://localhost/sign-in') },
}))
vi.mock('$env/static/public', () => ({
    PUBLIC_API_URL: 'http://localhost:8787',
    PUBLIC_CF_TURNSTILE_SITE_KEY: 'test-site-key',
    PUBLIC_NAME: 'Test Company',
}))
vi.mock('../utilities/signIn', () => ({
    signInWithCaptcha: mocks.signInWithCaptcha,
}))

describe('SignInForm', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mocks.signInWithCaptcha.mockResolvedValue(undefined)
    })

    afterEach(() => {
        const warnings = consoleWarnSpy.mock.calls.flat().join('\n')
        consoleWarnSpy.mockRestore()

        expect(warnings).not.toContain('derived_inert')
        expect(warnings).not.toContain('state_proxy_equality_mismatch')
    })

    it('exposes a keyboard-operable password visibility name', async () => {
        const screen = await render(SignInFormTestHarness)
        const password = screen.getByLabelText('Password', { exact: true })
        const toggle = screen.getByRole('button', { name: 'Show password' })

        await expect.element(password).toHaveAttribute('type', 'password')
        toggle.element().focus()
        await userEvent.keyboard('{Enter}')

        await expect.element(password).toHaveAttribute('type', 'text')
        await expect
            .element(screen.getByRole('button', { name: 'Hide password' }))
            .toHaveAttribute('aria-pressed', 'true')
        await screen.unmount()
    })

    it('associates a field error with its invalid input', async () => {
        const screen = await render(SignInFormTestHarness)
        const organizationId = screen.getByLabelText('Organization ID')

        await organizationId.fill('x'.repeat(65))
        organizationId.element().blur()

        await expect
            .element(organizationId)
            .toHaveAttribute('aria-describedby', 'organizationId-error')
        await expect
            .element(screen.getByRole('alert'))
            .toHaveAttribute('id', 'organizationId-error')
        await screen.unmount()
    })

    it('renders unimplemented destinations as inert text', async () => {
        const screen = await render(SignInFormTestHarness)

        await expect
            .element(screen.getByRole('link', { name: 'Sign-up' }))
            .not.toBeInTheDocument()
        await expect
            .element(screen.getByRole('link', { name: 'Terms of Service' }))
            .not.toBeInTheDocument()
        await expect.element(screen.getByText('Sign-up')).toBeVisible()
        await screen.unmount()
    })

    it('locks submission while sign-in is pending', async () => {
        let resolvePending!: () => void
        mocks.signInWithCaptcha.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolvePending = resolve
                }),
        )
        const screen = await render(SignInFormTestHarness)

        await screen.getByLabelText('Organization ID').fill('organization')
        await screen.getByLabelText('Account ID').fill('member')
        await screen
            .getByLabelText('Password', { exact: true })
            .fill('P@ssw0rd1234')

        const submit = screen.getByRole('button', { name: 'Sign-in' })
        await expect.element(submit).toBeEnabled()
        await submit.click()
        const pendingSubmit = screen.getByRole('button', {
            name: 'Signing-in...',
        })
        await expect.element(pendingSubmit).toBeDisabled()
        const pendingSubmitElement =
            pendingSubmit.element() as HTMLButtonElement
        pendingSubmitElement.click()

        expect(mocks.signInWithCaptcha).toHaveBeenCalledTimes(1)

        resolvePending()
        await expect
            .element(screen.getByRole('button', { name: 'Sign-in' }))
            .toBeEnabled()
        await screen.unmount()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
