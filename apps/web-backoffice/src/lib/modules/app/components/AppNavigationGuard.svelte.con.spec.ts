import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import AppNavigationGuardTestHarness from './AppNavigationGuardTestHarness.svelte'

const mocks = vi.hoisted(() => ({
    goto: vi.fn(),
    url: 'http://localhost/verify-email?token=verification-token',
}))

vi.mock('$app/navigation', () => ({
    afterNavigate: (callback: () => void) => callback(),
    beforeNavigate: vi.fn(),
    goto: mocks.goto,
}))
vi.mock('$app/state', () => ({
    page: {
        get url() {
            return new URL(mocks.url)
        },
    },
}))
describe('AppNavigationGuard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.url = 'http://localhost/verify-email?token=verification-token'
    })

    it('shows a public verification route without waiting for session bootstrap', async () => {
        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'checking',
            },
        })

        await expect.element(screen.getByText('Route content')).toBeVisible()
    })

    it('keeps public verification content mounted during an unavailable session', async () => {
        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'unavailable',
            },
        })

        await expect.element(screen.getByText('Route content')).toBeVisible()
        await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
    })

    it('hides sign-in content until session resolution settles', async () => {
        mocks.url = 'http://localhost/sign-in'

        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'checking',
            },
        })

        await expect
            .element(screen.getByText('Route content'))
            .not.toBeVisible()
    })

    it('shows session unavailable only for session-dependent routes', async () => {
        mocks.url = 'http://localhost/sign-in'

        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'unavailable',
            },
        })

        await expect
            .element(screen.getByText('Session unavailable.'))
            .toBeVisible()
    })

    it('shows the loader and suppresses SPA redirects when a boundary begins', async () => {
        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'unauthenticated',
            },
        })

        await expect.element(screen.getByText('Route content')).toBeVisible()

        await screen.rerender({
            heartbeatFailed: false,
            heartbeatReady: true,
            phase: 'transitioning',
        })

        await expect
            .element(screen.getByText('Route content'))
            .not.toBeVisible()
        await expect.element(screen.getByRole('status')).toBeVisible()
        expect(mocks.goto).not.toHaveBeenCalled()
    })

    it('preserves public route state across transient session failure', async () => {
        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'checking',
            },
        })
        const routeState = screen.getByLabelText('Route state')

        await routeState.fill('verification result')
        await screen.rerender({
            heartbeatFailed: false,
            heartbeatReady: true,
            phase: 'unavailable',
        })

        await expect.element(routeState).toHaveValue('verification result')
        await expect.element(routeState).toBeVisible()
    })

    it('redirects a disabled object-storage route without mounting its content', async () => {
        mocks.url = 'http://localhost/app/owner/object-storage/download'

        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                objectStorageEnabled: false,
                phase: 'authenticated',
                userRoles: ['owner'],
            },
        })

        await vi.waitFor(() => {
            expect(mocks.goto).toHaveBeenCalledWith('/app/owner/dashboard', {
                replaceState: true,
            })
        })
        await expect
            .element(screen.getByText('Route content'))
            .not.toBeInTheDocument()
    })

    it('accepts a route matching one of the active roles', async () => {
        mocks.url = 'http://localhost/app/admin/dashboard'

        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'authenticated',
                userRoles: [
                    'owner',
                    'admin',
                ],
            },
        })

        await expect.element(screen.getByText('Route content')).toBeVisible()
        expect(mocks.goto).not.toHaveBeenCalled()
    })

    it('redirects a disabled service-principal route without mounting its content', async () => {
        mocks.url = 'http://localhost/app/owner/service-principals'

        const screen = await render(AppNavigationGuardTestHarness, {
            props: {
                apiKeyEnabled: false,
                heartbeatFailed: false,
                heartbeatReady: true,
                phase: 'authenticated',
                userRoles: ['owner'],
            },
        })

        await vi.waitFor(() => {
            expect(mocks.goto).toHaveBeenCalledWith('/app/owner/dashboard', {
                replaceState: true,
            })
        })
        await expect
            .element(screen.getByText('Route content'))
            .not.toBeInTheDocument()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
