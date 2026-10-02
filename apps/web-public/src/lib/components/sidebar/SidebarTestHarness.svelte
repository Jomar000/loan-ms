<script lang="ts">
    import * as UiSidebar from '@hyperion/ui/overrides/sidebar'

    import {
        setSessionActionsContext,
        type SessionState,
        type TSessionDestination,
    } from '$lib/states/session'
    import '../../../app.css'
    import Sidebar from './Sidebar.svelte'
    import type { AppNavItem } from './types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        collapsed = false,
        navItems = [],
        onNavigate,
        session,
        showTrigger = false,
        transitionSessionBoundary,
    }: {
        collapsed?: boolean
        navItems?: AppNavItem[]
        onNavigate?: () => void
        session: SessionState
        showTrigger?: boolean
        transitionSessionBoundary: (
            destination?: TSessionDestination,
        ) => Promise<void>
    } = $props()

    /////////////////
    // 08. Effects //
    /////////////////

    setSessionActionsContext({
        signOut: async () => {},
        transitionSessionBoundary: (destination) =>
            transitionSessionBoundary(destination),
    })
</script>

<UiSidebar.Provider
    open={!collapsed}
    style="--sidebar-width: 15rem; --sidebar-width-icon: 3.5rem;"
>
    {#if showTrigger}
        <UiSidebar.Trigger aria-label="Open navigation" />
    {/if}
    <Sidebar
        {navItems}
        {onNavigate}
        role="member"
        {session}
    />
</UiSidebar.Provider>
