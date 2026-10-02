import { auth as authValidator } from '@loanms/validator/backoffice'
import { describe, expect, it } from 'vitest'

import { SessionState } from './context.svelte.js'

describe('SessionState', () => {
    it('preserves data identity while applying refreshes and clearing', () => {
        const session = new SessionState()
        const data = session.data
        const validSession = createValidSession()

        expect(session.apply(validSession)).toBe(true)
        expect(session.data).toBe(data)

        expect(
            session.apply({
                ...validSession,
                expiresAt: validSession.expiresAt + 60,
                name: 'Updated Member',
                refreshAt: validSession.refreshAt + 60,
            }),
        ).toBe(true)
        expect(session.data).toBe(data)
        expect(session.data).toMatchObject({
            expiresAt: validSession.expiresAt + 60,
            name: 'Updated Member',
            refreshAt: validSession.refreshAt + 60,
        })

        session.clear()

        expect(session.data).toBe(data)
        expect(session.data).toEqual({
            avatar: '',
            email: '{{email}}',
            expiresAt: 0,
            name: '{{name}}',
            organizationName: '',
            organizationSlug: '',
            refreshAt: 0,
            userRoles: [],
            permissions: authValidator.sessionPermissionsSchema.parse({}),
        })
    })

    it('creates independent initial session values', () => {
        const first = new SessionState()
        const second = new SessionState()

        first.data.userRoles.push('member')

        expect(first.data.userRoles).toEqual(['member'])
        expect(second.data.userRoles).toEqual([])
    })

    it('reads active roles and drops stale roles across session boundaries', () => {
        const session = new SessionState()
        const initial = createValidSession()

        expect(session.getRoles()).toEqual([])
        expect(session.hasRole('member')).toBe(false)
        expect(
            session.hasAnyRole([
                'member',
                'owner',
            ]),
        ).toBe(false)

        expect(
            session.apply({
                ...initial,
                userRoles: [
                    'member',
                    'owner',
                ],
            }),
        ).toBe(true)
        expect(session.getRoles()).toEqual([
            'member',
            'owner',
        ])
        expect(session.hasRole('owner')).toBe(true)
        expect(
            session.hasAnyRole([
                'admin',
                'owner',
            ]),
        ).toBe(true)
        expect(
            session.hasAnyRole([
                'admin',
                'cashier',
            ]),
        ).toBe(false)

        session.setPhase('unavailable')
        expect(session.getRoles()).toEqual([])
        session.setPhase('authenticated')
        session.data.expiresAt = Math.floor(Date.now() / 1000) - 1
        expect(session.getRoles()).toEqual([])
        expect(session.hasRole('owner')).toBe(false)

        expect(session.apply({ ...initial, userRoles: ['owner'] })).toBe(true)
        session.beginTransition()
        expect(session.data.userRoles).toEqual([])
        expect(session.getRoles()).toEqual([])
        expect(
            session.hasAnyRole([
                'owner',
                'admin',
            ]),
        ).toBe(false)

        expect(
            session.apply({
                ...initial,
                organizationSlug: 'second-organization',
                userRoles: ['admin'],
            }),
        ).toBe(true)
        expect(session.getRoles()).toEqual(['admin'])
        expect(session.hasRole('owner')).toBe(false)
        expect(session.hasRole('admin')).toBe(true)

        session.clear()
        session.setPhase('unauthenticated')
        expect(session.getRoles()).toEqual([])
        expect(session.hasRole('admin')).toBe(false)
    })

    it('defaults omitted permissions and clears permissions during transitions', () => {
        const session = new SessionState()
        const { permissions: _permissions, ...withoutPermissions } =
            createValidSession()

        expect(session.apply(withoutPermissions)).toBe(true)
        expect(session.data.permissions).toEqual(
            authValidator.sessionPermissionsSchema.parse({}),
        )

        Object.assign(session.data.permissions, { stale: true })
        session.beginTransition()

        expect(session.data.permissions).toEqual(
            authValidator.sessionPermissionsSchema.parse({}),
        )
    })

    it('preserves a valid session when replacement data is malformed', () => {
        const session = new SessionState()
        const validSession = createValidSession()

        expect(session.apply(validSession)).toBe(true)
        expect(session.apply({ expiresAt: 0 })).toBe(false)

        expect(session.data).toEqual(validSession)
        expect(session.phase).toBe('authenticated')
        expect(session.isValid()).toBe(true)
    })

    it('rejects a stale refresh generation after a boundary begins', () => {
        const session = new SessionState()
        const refreshGeneration = session.getRefreshGeneration()

        session.beginTransition()

        if (session.isRefreshGenerationCurrent(refreshGeneration)) {
            session.apply(createValidSession())
        }

        expect(session.isRefreshGenerationCurrent(refreshGeneration)).toBe(
            false,
        )
        expect(session.phase).toBe('transitioning')
        expect(session.isValid()).toBe(false)
    })

    it('increments the organization revision only across tenant boundaries', () => {
        const session = new SessionState()
        const validSession = createValidSession()

        expect(session.organizationRevision).toBe(0)
        session.clear()
        expect(session.organizationRevision).toBe(0)

        expect(session.apply(validSession)).toBe(true)
        expect(session.organizationRevision).toBe(1)

        expect(
            session.apply({
                ...validSession,
                expiresAt: validSession.expiresAt + 60,
            }),
        ).toBe(true)
        expect(session.organizationRevision).toBe(1)

        expect(session.apply({ expiresAt: 0 })).toBe(false)
        expect(session.organizationRevision).toBe(1)

        expect(
            session.apply({
                ...validSession,
                organizationName: 'Second tenant',
                organizationSlug: 'second-tenant',
            }),
        ).toBe(true)
        expect(session.organizationRevision).toBe(2)

        session.clear()
        expect(session.organizationRevision).toBe(3)
        session.clear()
        expect(session.organizationRevision).toBe(3)
    })
})

function createValidSession() {
    const currentEpochSeconds = Math.floor(Date.now() / 1000)

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
        permissions: authValidator.sessionPermissionsSchema.parse({}),
    }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
