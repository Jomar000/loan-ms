import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import { SessionState } from './context.svelte.js'
import SessionStateReactivityProbe from './SessionStateReactivityProbe.svelte'

describe('SessionState reactivity', () => {
    it('notifies effects only when their selected scalar changes', async () => {
        const session = new SessionState()
        const onExpiresAt = vi.fn()
        const onOrganizationSlug = vi.fn()
        const currentEpochSeconds = Math.floor(Date.now() / 1000)
        const initialSession = createValidSession(currentEpochSeconds)

        await render(SessionStateReactivityProbe, {
            props: { onExpiresAt, onOrganizationSlug, session },
        })
        await expect.poll(() => onExpiresAt.mock.calls.length).toBe(1)
        await expect.poll(() => onOrganizationSlug.mock.calls.length).toBe(1)

        session.apply(initialSession)
        await expect.poll(() => onExpiresAt.mock.calls.length).toBe(2)
        await expect.poll(() => onOrganizationSlug.mock.calls.length).toBe(2)

        session.apply({
            ...initialSession,
            expiresAt: currentEpochSeconds + 180,
            refreshAt: currentEpochSeconds + 120,
        })
        await expect.poll(() => onExpiresAt.mock.calls.length).toBe(3)
        await expect.poll(() => onOrganizationSlug.mock.calls.length).toBe(2)

        session.apply({
            ...initialSession,
            expiresAt: currentEpochSeconds + 240,
            organizationName: 'Other',
            organizationSlug: 'other',
            refreshAt: currentEpochSeconds + 180,
        })
        await expect.poll(() => onExpiresAt.mock.calls.length).toBe(4)
        await expect.poll(() => onOrganizationSlug.mock.calls.length).toBe(3)
        expect(onOrganizationSlug).toHaveBeenLastCalledWith('other')
    })
})

function createValidSession(currentEpochSeconds: number) {
    return {
        avatar: '',
        email: 'member@example.com',
        expiresAt: currentEpochSeconds + 120,
        name: 'Member',
        organizationName: 'Example',
        organizationSlug: 'example',
        refreshAt: currentEpochSeconds + 60,
        userRoles: [
            'member',
        ],
    }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
