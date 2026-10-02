import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import AppRoleShellTestHarness from './AppRoleShellTestHarness.svelte'

vi.mock('$app/state', () => ({
    page: { url: new URL('https://example.test/app/owner/dashboard') },
}))

vi.mock('$env/static/public', () => ({ PUBLIC_NAME: 'Hyperion' }))

vi.mock('$lib/components/sidebar/navigation', () => ({
    createRoleNavigation: () => [],
    getRouteMeta: () => ({ title: 'Dashboard' }),
}))

vi.mock('$lib/components/sidebar/Sidebar.svelte', async () => ({
    default: (await import('./AppRoleShellSidebarFixture.svelte')).default,
}))

vi.mock('$lib/components/sidebar/NotificationButton.svelte', async () => ({
    default: (await import('./AppRoleShellEmptyFixture.svelte')).default,
}))

vi.mock('$lib/components/sidebar/SiteHeader.svelte', async () => ({
    default: (await import('./AppRoleShellEmptyFixture.svelte')).default,
}))

vi.mock('$lib/config/apiKey', () => ({ apiKeyFeatureEnabled: false }))
vi.mock('$lib/config/objectStorage', () => ({
    objectStorageFeatureEnabled: false,
}))

vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({
        data: {
            avatar: '',
            email: 'owner@example.test',
            name: 'Owner',
            organizationName: 'Northwind',
            organizationSlug: 'northwind',
            userRoles: ['owner'],
        },
    }),
}))

describe('AppRoleShell sidebar persistence', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('hydrates collapse state and persists each open-state change', async () => {
        localStorage.setItem('sidebar-state', 'collapsed')
        const screen = await render(AppRoleShellTestHarness)

        expect(localStorage.getItem('sidebar-state')).toBe('collapsed')
        await screen.getByRole('button', { name: 'Expand sidebar' }).click()
        expect(localStorage.getItem('sidebar-state')).toBe('expanded')

        await screen.getByRole('button', { name: 'Collapse sidebar' }).click()
        expect(localStorage.getItem('sidebar-state')).toBe('collapsed')

        await screen.unmount()
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
