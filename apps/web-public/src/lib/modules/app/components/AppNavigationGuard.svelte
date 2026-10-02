<script lang="ts">
    import * as Alert from '@hyperion/ui/components/alert'
    import { tick } from 'svelte'

    import { afterNavigate, beforeNavigate, goto } from '$app/navigation'
    import { page } from '$app/state'
    import LoadingScreen from '$lib/components/loader/LoadingScreen.svelte'
    import { useSessionContext } from '$lib/states/session'
    import { requiresSessionResolution } from '$lib/states/session/routePolicy'
    import {
        NavigationGeneration,
        resolveCanonicalDestination,
    } from '../utilities/navigation'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { children, heartbeatFailed, heartbeatReady } = $props<{
        children: import('svelte').Snippet
        heartbeatFailed: boolean
        heartbeatReady: boolean
    }>()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const navigationGeneration = new NavigationGeneration()
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let isLoading = $state(true)
    let settlementScheduled = false

    /////////////////
    // 08. Effects //
    /////////////////

    beforeNavigate(({ willUnload }) => {
        if (!willUnload) beginNavigation()
    })

    afterNavigate(() => {
        scheduleSettlement()
    })

    // Intentional external synchronization: keep navigation settlement and
    // the transition overlay aligned with session and route changes.
    $effect(() => {
        if (session.phase === 'transitioning') {
            beginNavigation()
            return
        }

        if (requiresSessionResolution(page.url.pathname) || isLoading) {
            scheduleSettlement()
        }
    })

    /////////////////
    // 10. Helpers //
    /////////////////

    function beginNavigation() {
        isLoading = true
        return navigationGeneration.begin()
    }

    function scheduleSettlement() {
        const pathname = page.url.pathname
        const requiresSession = requiresSessionResolution(pathname)

        if (
            !heartbeatReady ||
            heartbeatFailed ||
            session.phase === 'transitioning' ||
            (requiresSession &&
                session.phase !== 'authenticated' &&
                session.phase !== 'unauthenticated') ||
            settlementScheduled
        )
            return

        const generation = beginNavigation()
        settlementScheduled = true

        queueMicrotask(() => {
            settlementScheduled = false
            void settleNavigation(generation)
        })
    }

    async function settleNavigation(generation: number) {
        if (
            session.phase === 'transitioning' ||
            (requiresSessionResolution(page.url.pathname) &&
                session.phase !== 'authenticated' &&
                session.phase !== 'unauthenticated')
        ) {
            return
        }

        const destination = resolveCanonicalDestination(
            page.url.pathname,
            {
                isAuthenticated: session.isValid(),
                userRoles: session.getRoles(),
            },
            page.url.search,
        )

        if (
            destination &&
            destination !== `${page.url.pathname}${page.url.search}`
        ) {
            await goto(destination, { replaceState: true })
            return
        }

        await tick()
        await nextAnimationFrame()

        if (navigationGeneration.isCurrent(generation)) {
            isLoading = false
        }
    }

    function nextAnimationFrame() {
        return new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve())
        })
    }
</script>

{#if heartbeatFailed || (requiresSessionResolution(page.url.pathname) && session.phase === 'unavailable')}
    <div class="flex min-h-svh items-center justify-center p-6">
        <Alert.Root class="max-w-md">
            <Alert.Title>Application unavailable</Alert.Title>
            <Alert.Description>
                {heartbeatFailed ? 'API unavailable.' : 'Session unavailable.'}
            </Alert.Description>
        </Alert.Root>
    </div>
{:else}
    <div
        class="contents"
        style:display={isLoading ? 'none' : undefined}
    >
        {@render children()}
    </div>

    {#if isLoading}
        <LoadingScreen />
    {/if}
{/if}
