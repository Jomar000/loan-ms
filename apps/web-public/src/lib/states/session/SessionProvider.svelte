<script lang="ts">
    import {
        createAppRealtimeLifecycle,
        type TRealtimeServerFrame,
    } from '@loanms/websocket/client'
    import { useQueryClient } from '@tanstack/svelte-query'
    import { onMount, type Snippet } from 'svelte'

    import { authClient } from '$lib/clients'
    import {
        isOwnedRealtimeQuery,
        isRealtimeEventDrivenQuery,
    } from '$lib/utilities/realtimeQuery'
    import { wsClientManager } from '$lib/utilities/wsClientManager'
    import { EXTENSION_APP_REALTIME_INVALIDATION_EVENTS } from './appRealtime.extension'
    import { executeSessionBoundary } from './boundary'
    import {
        AUTH_SESSION_BOUNDARY_CHANNEL,
        AUTH_SESSION_BOUNDARY_STORAGE_KEY,
        AUTH_UNAUTHORIZED_EVENT,
    } from './constants'
    import {
        SessionState,
        setSessionActionsContext,
        setSessionContext,
        type TSessionDestination,
    } from './context.svelte'
    import {
        reconcileSessionRefresh,
        shouldRedirectInvalidSession,
    } from './refresh'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { children } = $props<{ children: Snippet }>()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = new SessionState()
    const queryClient = useQueryClient()
    const appRealtimeLifecycle = createAppRealtimeLifecycle({
        manager: wsClientManager,
        onFrame: handleAppRealtimeFrame,
        recoveryCallbacks: {
            onGap: invalidateActiveTenantQueries,
            onReconnectReady: invalidateActiveTenantQueries,
        },
    })

    ///////////////
    // 03. State //
    ///////////////

    let boundaryChannel: BroadcastChannel | null = null
    let refreshPromise: Promise<void> | null = null
    let sessionExpiryTimeout: ReturnType<typeof setTimeout> | undefined
    let sessionRefreshTimeout: ReturnType<typeof setTimeout> | undefined
    let sessionRetryTimeout: ReturnType<typeof setTimeout> | undefined

    /////////////////
    // 08. Effects //
    /////////////////

    setSessionContext(session)
    setSessionActionsContext({ signOut, transitionSessionBoundary })

    onMount(() => {
        localStorage.removeItem('session_data')

        if ('BroadcastChannel' in globalThis) {
            boundaryChannel = new BroadcastChannel(
                AUTH_SESSION_BOUNDARY_CHANNEL,
            )
            boundaryChannel.addEventListener('message', handleExternalBoundary)
        }

        addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
        void refreshSession()

        return () => {
            appRealtimeLifecycle.dispose()
            clearAllSessionTimers()
            boundaryChannel?.close()
            removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
        }
    })

    // Intentional external synchronization: keep browser refresh and expiry
    // timers aligned with the current authenticated session lifecycle.
    $effect(() => {
        if (session.phase !== 'authenticated' || !session.isValid()) {
            clearScheduledSessionTimers()
            return
        }

        scheduleSessionTimers()
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleAppRealtimeFrame(frame: TRealtimeServerFrame) {
        if (
            frame.type !== 'EVENT' ||
            frame.stream !== 'APP' ||
            !EXTENSION_APP_REALTIME_INVALIDATION_EVENTS.includes(frame.event)
        ) {
            return
        }

        invalidateEventDrivenTenantQueries()
    }

    function handleExternalBoundary() {
        void applySessionBoundary('/app', false)
    }

    function handleStorageBoundary(event: StorageEvent) {
        if (event.key === AUTH_SESSION_BOUNDARY_STORAGE_KEY && event.newValue) {
            void applySessionBoundary('/app', false)
        }
    }

    function handleUnauthorized() {
        if (session.phase !== 'transitioning') {
            void transitionSessionBoundary('/sign-in')
        }
    }

    function handleVisibilityChange() {
        if (
            document.visibilityState === 'visible' &&
            session.phase === 'authenticated' &&
            session.isValid()
        ) {
            void refreshSession()
        }
    }

    async function signOut() {
        try {
            await authClient.signOut.$post()
        } finally {
            await transitionSessionBoundary('/sign-in')
        }
    }

    async function transitionSessionBoundary(
        destination: TSessionDestination = '/app',
    ) {
        await applySessionBoundary(destination, true)
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    async function applySessionBoundary(
        destination: TSessionDestination,
        broadcast: boolean,
    ) {
        if (session.phase === 'transitioning') return
        session.beginTransition()

        await executeSessionBoundary({
            broadcast: broadcast ? broadcastSessionBoundary : undefined,
            cancelTenantQueries: () =>
                queryClient.cancelQueries({
                    predicate: (query) => query.queryKey[0] !== 'heartbeat',
                }),
            clearLocalSession: () => {
                clearAllSessionTimers()
                session.clear()
            },
            clearTenantCaches: () => {
                queryClient.removeQueries({
                    predicate: (query) => query.queryKey[0] !== 'heartbeat',
                })
                queryClient.getMutationCache().clear()
            },
            closeWebSockets: () =>
                appRealtimeLifecycle.deactivate('Session boundary changed.'),
            navigate: () => location.replace(destination),
        })
    }

    function broadcastSessionBoundary() {
        try {
            boundaryChannel?.postMessage(null)
        } catch {
            // The storage event remains available as a cross-tab fallback.
        }

        try {
            localStorage.setItem(
                AUTH_SESSION_BOUNDARY_STORAGE_KEY,
                crypto.randomUUID(),
            )
        } catch {
            // Boundary cleanup and navigation must remain best-effort.
        }
    }

    function clearAllSessionTimers() {
        clearScheduledSessionTimers()
        if (sessionRetryTimeout) clearTimeout(sessionRetryTimeout)
        sessionRetryTimeout = undefined
    }

    function clearScheduledSessionTimers() {
        if (sessionExpiryTimeout) clearTimeout(sessionExpiryTimeout)
        if (sessionRefreshTimeout) clearTimeout(sessionRefreshTimeout)
        sessionExpiryTimeout = undefined
        sessionRefreshTimeout = undefined
    }

    function currentEpochSeconds() {
        return Math.floor(Date.now() / 1000)
    }

    function refreshSession() {
        if (refreshPromise) return refreshPromise

        const refreshGeneration = session.getRefreshGeneration()

        refreshPromise = reconcileSessionRefresh({
            apply: (data) => {
                if (!session.isRefreshGenerationCurrent(refreshGeneration)) {
                    return true
                }

                const applied = session.apply(data)
                if (applied) {
                    appRealtimeLifecycle.activate(session.data.organizationSlug)
                    if (sessionRetryTimeout) clearTimeout(sessionRetryTimeout)
                    sessionRetryTimeout = undefined
                }
                return applied
            },
            invalidate: () => {
                if (!session.isRefreshGenerationCurrent(refreshGeneration)) {
                    return
                }

                return clearInvalidSession()
            },
            request: () => authClient.session.$get(),
            retry: () => {
                if (session.isRefreshGenerationCurrent(refreshGeneration)) {
                    handleTransientRefreshFailure()
                }
            },
        }).finally(() => {
            refreshPromise = null
        })

        return refreshPromise
    }

    function scheduleRefreshRetry() {
        if (sessionRetryTimeout) clearTimeout(sessionRetryTimeout)
        sessionRetryTimeout = setTimeout(() => {
            sessionRetryTimeout = undefined
            void refreshSession()
        }, 30_000)
    }

    async function clearInvalidSession() {
        if (shouldRedirectInvalidSession(location.pathname)) {
            await transitionSessionBoundary('/sign-in')
            return
        }

        appRealtimeLifecycle.deactivate()
        session.clear()
        session.setPhase('unauthenticated')
    }

    function handleTransientRefreshFailure() {
        session.setPhase(session.isValid() ? 'authenticated' : 'unavailable')
        scheduleRefreshRetry()
    }

    function scheduleSessionTimers() {
        clearScheduledSessionTimers()
        const now = currentEpochSeconds()

        sessionExpiryTimeout = setTimeout(
            () => void transitionSessionBoundary('/sign-in'),
            Math.max((session.data.expiresAt - now) * 1000, 0),
        )
        sessionRefreshTimeout = setTimeout(
            () => void refreshSession(),
            Math.max((session.data.refreshAt - now) * 1000, 1000),
        )
    }

    function invalidateActiveTenantQueries() {
        const organizationSlug = session.data.organizationSlug

        if (!organizationSlug) return

        void queryClient.invalidateQueries({
            predicate: (query) =>
                query.isActive() &&
                isOwnedRealtimeQuery(query, {
                    organizationSlug,
                    owner: 'APP',
                    stream: 'APP',
                }),
        })
    }

    function invalidateEventDrivenTenantQueries() {
        const organizationSlug = session.data.organizationSlug

        if (!organizationSlug) return

        void queryClient.invalidateQueries({
            predicate: (query) =>
                query.isActive() &&
                isRealtimeEventDrivenQuery(query) &&
                isOwnedRealtimeQuery(query, {
                    organizationSlug,
                    owner: 'APP',
                    stream: 'APP',
                }),
        })
    }
</script>

<svelte:window onstorage={handleStorageBoundary} />
<svelte:document onvisibilitychange={handleVisibilityChange} />

{@render children()}
