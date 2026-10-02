import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import type { SessionState } from '$lib/states/session'
import UserControlsTestHarness from './UserControlsTestHarness.svelte'

describe('UserControls', () => {
    it('locks sign-out controls while the request is pending', async () => {
        const deferred = createDeferred<void>()
        const signOut = vi.fn().mockReturnValue(deferred.promise)
        const screen = await render(UserControlsTestHarness, {
            session: createSessionFixture(),
            signOut,
        })
        const userMenu = screen.getByRole('button', { name: 'User menu' })

        await userMenu.click()
        await screen.getByRole('menuitem', { name: 'Sign out' }).click()
        expect(signOut).toHaveBeenCalledOnce()

        const pendingSignOut = screen.getByRole('menuitem', {
            name: 'Sign out',
        })
        await expect.element(pendingSignOut).toBeDisabled()

        deferred.resolve()
        await expect.element(pendingSignOut).toBeEnabled()
        expect(signOut).toHaveBeenCalledOnce()
    })
})

function createSessionFixture() {
    return {
        data: {
            avatar: '',
            email: 'member@example.com',
            name: 'Member Example',
            organizationName: 'Example Organization',
        },
    } as unknown as SessionState
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
