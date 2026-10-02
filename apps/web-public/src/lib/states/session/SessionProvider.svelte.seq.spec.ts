import type {
    TRealtimeRecoveryCallbacks,
    TRealtimeServerFrame,
} from '@loanms/websocket/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-svelte'

import {
    appRealtimeEventQueryMeta,
    realtimeQueryMeta,
} from '$lib/utilities/realtimeQuery'
import SessionProviderTestHarness from './SessionProviderTestHarness.svelte'

const mocks = vi.hoisted(() => ({
    clearMutations: vi.fn(),
    connectApp: vi.fn(),
    disconnectAll: vi.fn(),
    executeBoundary: vi.fn(async (options: { closeWebSockets: () => void }) => {
        options.closeWebSockets()
    }),
    frameCallback: undefined as
        ((frame: TRealtimeServerFrame) => void) | undefined,
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    recoveryCallbacks: undefined as TRealtimeRecoveryCallbacks | undefined,
    releaseApp: vi.fn(),
    removeFrameListener: vi.fn(),
    removeRecoveryCallbacks: vi.fn(),
    sessionGet: vi.fn(),
}))

vi.mock('@tanstack/svelte-query', () => ({
    useQueryClient: () => ({
        cancelQueries: vi.fn().mockResolvedValue(undefined),
        getMutationCache: () => ({ clear: mocks.clearMutations }),
        invalidateQueries: mocks.invalidateQueries,
        removeQueries: vi.fn(),
    }),
}))
vi.mock('$lib/clients', () => ({
    authClient: {
        session: { $get: mocks.sessionGet },
        signOut: { $post: vi.fn() },
    },
}))
vi.mock('$lib/utilities/wsClientManager', () => ({
    wsClientManager: {
        connectApp: mocks.connectApp,
        disconnectAll: mocks.disconnectAll,
    },
}))
vi.mock('./appRealtime.extension', () => ({
    EXTENSION_APP_REALTIME_INVALIDATION_EVENTS: ['TEST_EVENT'],
}))
vi.mock('./boundary', () => ({
    executeSessionBoundary: mocks.executeBoundary,
}))

describe('SessionProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.frameCallback = undefined
        mocks.recoveryCallbacks = undefined
        mocks.connectApp.mockImplementation(() => ({
            release: mocks.releaseApp,
            subscribe: (callback: (frame: TRealtimeServerFrame) => void) => {
                mocks.frameCallback = callback
                return mocks.removeFrameListener
            },
            subscribeRecovery: (callbacks: TRealtimeRecoveryCallbacks) => {
                mocks.recoveryCallbacks = callbacks
                return mocks.removeRecoveryCallbacks
            },
        }))
        history.replaceState({}, '', '/')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        history.replaceState({}, '', '/')
    })

    it('shows unavailable after an initial transient failure', async () => {
        mocks.sessionGet.mockRejectedValueOnce(new Error('offline'))
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('unavailable')
        expect(mocks.executeBoundary).not.toHaveBeenCalled()
    })

    it('retains an authenticated session after a background failure', async () => {
        mocks.sessionGet
            .mockResolvedValueOnce(createSessionResponse())
            .mockResolvedValueOnce({ status: 503 })
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        document.dispatchEvent(new Event('visibilitychange'))

        await expect.poll(() => mocks.sessionGet.mock.calls.length).toBe(2)
        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')
        await expect
            .element(screen.getByTestId('session-name'))
            .toHaveTextContent('Member')
        expect(mocks.connectApp).toHaveBeenCalledOnce()
        expect(mocks.executeBoundary).not.toHaveBeenCalled()
    })

    it('keeps one APP lease across a same-tenant session refresh', async () => {
        mocks.sessionGet
            .mockResolvedValueOnce(createSessionResponse())
            .mockResolvedValueOnce(
                createSessionResponse({ name: 'Refreshed Member' }),
            )
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        document.dispatchEvent(new Event('visibilitychange'))

        await expect
            .element(screen.getByTestId('session-name'))
            .toHaveTextContent('Refreshed Member')
        expect(mocks.connectApp).toHaveBeenCalledOnce()
        expect(mocks.disconnectAll).not.toHaveBeenCalled()
        expect(mocks.releaseApp).not.toHaveBeenCalled()
    })

    it('replaces the APP lease when the tenant changes', async () => {
        mocks.sessionGet
            .mockResolvedValueOnce(createSessionResponse())
            .mockResolvedValueOnce(
                createSessionResponse({
                    organizationName: 'Other',
                    organizationSlug: 'other',
                }),
            )
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        document.dispatchEvent(new Event('visibilitychange'))

        await expect.poll(() => mocks.connectApp.mock.calls.length).toBe(2)
        expect(mocks.disconnectAll).toHaveBeenCalledWith('Tenant changed.')
        expect(mocks.removeRecoveryCallbacks).toHaveBeenCalledOnce()
        expect(mocks.releaseApp).toHaveBeenCalledOnce()
    })

    it('skips first READY and recovers only active APP-owned tenant queries', async () => {
        mocks.sessionGet.mockResolvedValueOnce(createSessionResponse())
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')
        expect(mocks.connectApp).toHaveBeenCalledOnce()

        mocks.recoveryCallbacks?.onFirstReady?.(
            createReadyFrame('0198ef86-e6ab-7da4-98d3-57e3101779e4'),
            createRecoveryContext(),
        )
        expect(mocks.invalidateQueries).not.toHaveBeenCalled()

        mocks.recoveryCallbacks?.onReconnectReady?.(
            createReadyFrame('0198ef86-e6ab-7da4-98d3-57e3101779e5'),
            createRecoveryContext(),
        )
        mocks.recoveryCallbacks?.onGap?.(
            {
                expected: '2',
                received: '4',
                stream: 'APP',
                type: 'GAP',
            },
            createRecoveryContext(),
        )

        expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2)

        const predicate = mocks.invalidateQueries.mock.calls[0]?.[0].predicate

        expect(predicate(createOwnedQuery())).toBe(true)
        expect(predicate(createOwnedQuery({}, false))).toBe(false)
        expect(predicate(createOwnedQuery({ organizationSlug: 'other' }))).toBe(
            false,
        )
        expect(predicate(createOwnedQuery({ owner: 'FEATURE' }))).toBe(false)
        expect(predicate(createOwnedQuery({ stream: 'DEDICATED' }))).toBe(false)
        expect(predicate(createOwnedQuery({ target: 'resource-a' }))).toBe(
            false,
        )
        expect(
            predicate({
                isActive: () => true,
                meta: undefined,
                queryKey: [
                    'heartbeat',
                ],
            }),
        ).toBe(false)
    })

    it('invalidates only active event-driven owned queries of the current organization on a listed APP event', async () => {
        mocks.sessionGet.mockResolvedValueOnce(createSessionResponse())
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        mocks.frameCallback?.(createAppEventFrame('TEST_EVENT'))

        expect(mocks.invalidateQueries).toHaveBeenCalledOnce()

        const predicate = mocks.invalidateQueries.mock.calls[0]?.[0].predicate

        expect(predicate(createEventDrivenQuery())).toBe(true)
        expect(predicate(createEventDrivenQuery({}, false))).toBe(false)
        expect(predicate(createOwnedQuery())).toBe(false)
        expect(
            predicate(createEventDrivenQuery({ organizationSlug: 'other' })),
        ).toBe(false)
        expect(predicate(createEventDrivenQuery({ owner: 'FEATURE' }))).toBe(
            false,
        )
        expect(predicate(createEventDrivenQuery({ stream: 'DEDICATED' }))).toBe(
            false,
        )
        expect(
            predicate({
                isActive: () => true,
                meta: undefined,
                queryKey: [
                    'example',
                    'resource',
                ],
            }),
        ).toBe(false)
    })

    it('ignores unlisted APP events and non-event frames', async () => {
        mocks.sessionGet.mockResolvedValueOnce(createSessionResponse())
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        mocks.frameCallback?.(createAppEventFrame('UNLISTED_EVENT'))
        mocks.frameCallback?.({
            ...createAppEventFrame('TEST_EVENT'),
            stream: 'DEDICATED',
        })
        mocks.frameCallback?.(
            createReadyFrame('0198ef86-e6ab-7da4-98d3-57e3101779e4'),
        )
        mocks.frameCallback?.({
            expected: '2',
            received: '4',
            stream: 'APP',
            type: 'GAP',
        })
        mocks.frameCallback?.({
            code: 'REALTIME_ERROR',
            recoverable: true,
            type: 'ERROR',
        })

        expect(mocks.invalidateQueries).not.toHaveBeenCalled()
    })

    it('subscribes the frame listener once across a same-tenant refresh', async () => {
        mocks.sessionGet
            .mockResolvedValueOnce(createSessionResponse())
            .mockResolvedValueOnce(
                createSessionResponse({ name: 'Refreshed Member' }),
            )
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        document.dispatchEvent(new Event('visibilitychange'))

        await expect
            .element(screen.getByTestId('session-name'))
            .toHaveTextContent('Refreshed Member')
        expect(mocks.connectApp).toHaveBeenCalledOnce()
        expect(mocks.removeFrameListener).not.toHaveBeenCalled()
    })

    it('removes the frame listener when the tenant changes', async () => {
        mocks.sessionGet
            .mockResolvedValueOnce(createSessionResponse())
            .mockResolvedValueOnce(
                createSessionResponse({
                    organizationName: 'Other',
                    organizationSlug: 'other',
                }),
            )
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        document.dispatchEvent(new Event('visibilitychange'))

        await expect.poll(() => mocks.connectApp.mock.calls.length).toBe(2)
        expect(mocks.removeFrameListener).toHaveBeenCalledOnce()
    })

    it('closes APP and dedicated sockets when authentication is lost', async () => {
        history.replaceState({}, '', '/verify-email')
        mocks.sessionGet
            .mockResolvedValueOnce(createSessionResponse())
            .mockResolvedValueOnce({ status: 401 })
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        document.dispatchEvent(new Event('visibilitychange'))

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('unauthenticated')
        expect(mocks.disconnectAll).toHaveBeenCalledWith('Authentication lost.')
        expect(mocks.removeFrameListener).toHaveBeenCalledOnce()
        expect(mocks.removeRecoveryCallbacks).toHaveBeenCalledOnce()
        expect(mocks.releaseApp).toHaveBeenCalledOnce()
    })

    it('closes all sockets when the provider is disposed', async () => {
        mocks.sessionGet.mockResolvedValueOnce(createSessionResponse())
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('authenticated')

        await screen.unmount()

        expect(mocks.disconnectAll).toHaveBeenCalledWith(
            'Session provider disposed.',
        )
        expect(mocks.removeFrameListener).toHaveBeenCalledOnce()
        expect(mocks.removeRecoveryCallbacks).toHaveBeenCalledOnce()
        expect(mocks.releaseApp).toHaveBeenCalledOnce()
    })

    it.each([
        401,
        403,
    ])('starts one protected boundary for status %i', async (status) => {
        history.replaceState({}, '', '/app')
        mocks.sessionGet.mockResolvedValueOnce({ status })
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('transitioning')
        expect(mocks.executeBoundary).toHaveBeenCalledOnce()
    })

    it.each([
        401,
        403,
    ])('settles an independent route for status %i', async (status) => {
        history.replaceState({}, '', '/verify-email')
        mocks.sessionGet.mockResolvedValueOnce({ status })
        const screen = await render(SessionProviderTestHarness)

        await expect
            .element(screen.getByTestId('session-phase'))
            .toHaveTextContent('unauthenticated')
        expect(mocks.executeBoundary).not.toHaveBeenCalled()
    })
})

function createSessionResponse(
    overrides: {
        name?: string
        organizationName?: string
        organizationSlug?: string
    } = {},
) {
    const currentEpochSeconds = Math.floor(Date.now() / 1000)

    return {
        status: 200,
        json: async () => ({
            data: {
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
                ...overrides,
            },
            success: true,
        }),
    }
}

function createReadyFrame(connectionId: string) {
    return {
        authorizationVersion: '0198ef86-e6ab-7da4-98d3-57e3101779e6',
        connectionId,
        wireVersion: 'realtime.events.v1' as const,
        stream: 'APP',
        type: 'READY' as const,
    }
}

function createAppEventFrame(event: string) {
    return {
        event,
        eventId: '0198ef86-e6ab-7da4-98d3-57e3101779e7',
        occurredAt: '2026-07-27T12:00:00.000+08:00',
        payload: {},
        stream: 'APP',
        type: 'EVENT' as const,
    } satisfies TRealtimeServerFrame
}

function createRecoveryContext() {
    return {
        recoveryPolicy: 'active_tenant',
        stream: 'APP',
        target: null,
    }
}

function createOwnedQuery(
    overrides: Partial<Parameters<typeof realtimeQueryMeta>[0]> = {},
    active = true,
) {
    return {
        isActive: () => active,
        meta: realtimeQueryMeta({
            organizationSlug: 'example',
            owner: 'APP',
            recovery: 'invalidate',
            stream: 'APP',
            ...overrides,
        }),
        queryKey: [
            'example',
            'resource',
        ],
    }
}

function createEventDrivenQuery(
    overrides: Partial<Parameters<typeof realtimeQueryMeta>[0]> = {},
    active = true,
) {
    const query = createOwnedQuery(overrides, active)

    return {
        ...query,
        meta: {
            ...appRealtimeEventQueryMeta('example'),
            realtime: query.meta.realtime,
        },
    }
}

// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
