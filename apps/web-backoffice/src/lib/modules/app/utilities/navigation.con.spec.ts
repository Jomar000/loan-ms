import { describe, expect, it } from 'vitest'

import {
    getRoleDefaultRoute,
    isRouteFeatureEnabled,
    resolveCanonicalDestination,
} from './navigation'

const ownerSession = {
    isAuthenticated: true,
    userRoles: ['owner'],
}

describe('object-storage route policy', () => {
    it('allows object-storage routes when the feature is enabled', () => {
        expect(
            resolveCanonicalDestination(
                '/app/owner/object-storage/download',
                ownerSession,
                true,
                true,
            ),
        ).toBeNull()
    })

    it('redirects disabled object-storage routes to the role dashboard', () => {
        expect(
            resolveCanonicalDestination(
                '/app/owner/object-storage/upload',
                ownerSession,
                true,
                false,
            ),
        ).toBe('/app/owner/dashboard')
    })

    it('does not gate unrelated routes', () => {
        expect(
            isRouteFeatureEnabled('/app/owner/dashboard', false, false),
        ).toBe(true)
    })
})

describe('service-principal navigation policy', () => {
    it.each([
        'owner',
        'admin',
    ])('accepts the %s route for a matching role', (role) => {
        expect(
            resolveCanonicalDestination(
                `/app/${role}/service-principals`,
                { isAuthenticated: true, userRoles: [role] },
                true,
                false,
            ),
        ).toBeNull()
    })

    it('redirects disabled service-principal routes to the role dashboard', () => {
        expect(
            resolveCanonicalDestination(
                '/app/owner/service-principals',
                ownerSession,
                false,
                false,
            ),
        ).toBe('/app/owner/dashboard')
    })

    it('redirects member access to the member dashboard', () => {
        expect(
            resolveCanonicalDestination(
                '/app/owner/service-principals',
                { isAuthenticated: true, userRoles: ['member'] },
                true,
                false,
            ),
        ).toBe('/app/member/dashboard')
    })

    it('redirects cross-role access to the authorized dashboard', () => {
        expect(
            resolveCanonicalDestination(
                '/app/admin/service-principals',
                ownerSession,
                true,
                false,
            ),
        ).toBe('/app/owner/dashboard')
    })
})

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================

describe('operational role navigation policy', () => {
    it.each([
        [
            'cashier',
            '/app/cashier/loans',
        ],
        [
            'collector',
            '/app/collector/collections',
        ],
        [
            'viewer',
            '/app/viewer/reports',
        ],
        [
            'auditor',
            '/app/auditor/reports',
        ],
    ])('uses the %s workflow as its default route', (role, destination) => {
        expect(getRoleDefaultRoute(role)).toBe(destination)
    })

    it.each([
        [
            'cashier',
            '/app/cashier/settings',
            '/app/cashier/loans',
        ],
        [
            'cashier',
            '/app/cashier/loans/new',
            '/app/cashier/loans',
        ],
        [
            'collector',
            '/app/collector/loans',
            '/app/collector/collections',
        ],
        [
            'viewer',
            '/app/viewer/users',
            '/app/viewer/reports',
        ],
        [
            'auditor',
            '/app/auditor/settings',
            '/app/auditor/reports',
        ],
    ])(
        'redirects unauthorized %s routes to the role default',
        (role, pathname, destination) => {
            expect(
                resolveCanonicalDestination(
                    pathname,
                    { isAuthenticated: true, userRoles: [role] },
                    true,
                    true,
                ),
            ).toBe(destination)
        },
    )

    it.each([
        [
            'cashier',
            '/app/cashier/loans',
        ],
        [
            'collector',
            '/app/collector/collections',
        ],
        [
            'viewer',
            '/app/viewer/loans/loan-public-id',
        ],
        [
            'auditor',
            '/app/auditor/overdue',
        ],
    ])('allows an authorized %s route', (role, pathname) => {
        expect(
            resolveCanonicalDestination(
                pathname,
                { isAuthenticated: true, userRoles: [role] },
                true,
                true,
            ),
        ).toBeNull()
    })
})
