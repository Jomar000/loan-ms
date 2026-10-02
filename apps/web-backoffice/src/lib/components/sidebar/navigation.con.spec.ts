import { describe, expect, it } from 'vitest'

import { createRoleNavigation, getRouteMeta } from './navigation'

describe('createRoleNavigation', () => {
    it.each([
        'owner',
        'admin',
    ])('includes service-principal management for %s', (role) => {
        const navigation = createRoleNavigation(role, true, false)

        expect(navigation).toContainEqual(
            expect.objectContaining({
                label: 'Service Principals',
                href: `/app/${role}/service-principals`,
            }),
        )
    })

    it('omits API-key navigation when the feature is disabled', () => {
        const navigation = createRoleNavigation('owner', false, false)

        expect(
            navigation.some((item) => item.label === 'Service Principals'),
        ).toBe(false)
    })

    it('does not expose API key management to members', () => {
        expect(createRoleNavigation('member', true, true)).toEqual([])
    })

    it('includes object-storage navigation when the feature is enabled', () => {
        const navigation = createRoleNavigation('owner', false, true)

        expect(navigation.some((item) => item.label === 'Workspace')).toBe(true)
    })

    it('omits object-storage navigation when the feature is disabled', () => {
        const navigation = createRoleNavigation('owner', true, false)

        expect(navigation.some((item) => item.label === 'Workspace')).toBe(
            false,
        )
    })
    it('exposes Activity Logs only to privileged roles', () => {
        expect(
            createRoleNavigation('owner', false, false).find(
                (item) => item.label === 'Activity Logs',
            ),
        ).toEqual(expect.objectContaining({ href: '/app/owner/activity-logs' }))
        expect(
            createRoleNavigation('admin', false, false).find(
                (item) => item.label === 'Activity Logs',
            ),
        ).toEqual(expect.objectContaining({ href: '/app/admin/activity-logs' }))
        expect(
            createRoleNavigation('member', false, false).some(
                (item) => item.label === 'Activity Logs',
            ),
        ).toBe(false)
    })

    it('resolves Activity Logs route metadata', () => {
        expect(getRouteMeta('/app/owner/activity-logs')).toEqual({
            title: 'Activity Logs',
        })
    })

    it('resolves service-principal route metadata', () => {
        expect(getRouteMeta('/app/owner/service-principals')).toEqual({
            title: 'Service Principals',
        })
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
