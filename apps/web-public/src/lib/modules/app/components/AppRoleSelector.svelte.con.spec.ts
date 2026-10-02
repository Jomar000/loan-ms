import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'
import { userEvent } from 'vitest/browser'

import AppRoleSelector from './AppRoleSelector.svelte'

const mocks = vi.hoisted(() => ({ goto: vi.fn() }))

vi.mock('$app/navigation', () => ({ goto: mocks.goto }))
vi.mock('$env/static/public', () => ({ PUBLIC_NAME: 'Hyperion' }))
vi.mock('$lib/states/session', () => ({
    useSessionContext: () => ({
        getRoles: () => [
            'admin',
            'member',
        ],
    }),
}))

describe('AppRoleSelector', () => {
    beforeEach(() => vi.clearAllMocks())

    it('labels role selection and submits the selected destination', async () => {
        const screen = await render(AppRoleSelector)
        const roleSelect = screen.getByRole('button', { name: 'Role' })

        expect(
            roleSelect.element().closest('[data-slot="field"]'),
        ).not.toBeNull()

        await roleSelect.click()
        const adminOption = screen.getByRole('option', { name: 'ADMIN' })
        expect(
            adminOption.element().closest('[data-slot="select-group"]'),
        ).not.toBeNull()
        await adminOption.click()
        screen
            .getByRole('button', { name: 'Proceed to Dashboard' })
            .element()
            .focus()
        await userEvent.keyboard('{Enter}')

        expect(mocks.goto).toHaveBeenCalledWith('/app/admin/dashboard')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
