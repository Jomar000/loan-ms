<script lang="ts">
    import * as Sidebar from '@hyperion/ui/overrides/sidebar'
    import type { Snippet } from 'svelte'

    import { page } from '$app/state'
    import { PUBLIC_NAME } from '$env/static/public'
    import {
        createRoleNavigation,
        getRouteMeta,
    } from '$lib/components/sidebar/navigation'
    import NotificationButton from '$lib/components/sidebar/NotificationButton.svelte'
    import AppSidebar from '$lib/components/sidebar/Sidebar.svelte'
    import SiteHeader from '$lib/components/sidebar/SiteHeader.svelte'
    import { apiKeyFeatureEnabled } from '$lib/config/apiKey'
    import { objectStorageFeatureEnabled } from '$lib/config/objectStorage'
    import { useSessionContext } from '$lib/states/session'

    ////////////////////
    // 01. Properties //
    ////////////////////

    type Role = 'admin' | 'member' | 'owner'

    let {
        role,
        children,
    }: {
        role: Role
        children: Snippet
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const SIDEBAR_STATE_STORAGE_KEY = 'sidebar-state'
    const SIDEBAR_STATE_COLLAPSED = 'collapsed'
    const SIDEBAR_STATE_EXPANDED = 'expanded'
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let collapsed = $state(readCollapsedSidebarState())

    /////////////////
    // 04. Derived //
    /////////////////

    const navItems = $derived(
        createRoleNavigation(
            role,
            apiKeyFeatureEnabled,
            objectStorageFeatureEnabled,
        ),
    )
    const routeMeta = $derived(getRouteMeta(page.url.pathname))

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleSidebarOpenChange(open: boolean) {
        collapsed = !open
        persistCollapsedSidebarState(collapsed)
    }

    //////////////////
    // 10. Helpers //
    //////////////////

    function readCollapsedSidebarState() {
        try {
            return (
                localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY) ===
                SIDEBAR_STATE_COLLAPSED
            )
        } catch {
            return false
        }
    }

    function persistCollapsedSidebarState(isCollapsed: boolean) {
        try {
            localStorage.setItem(
                SIDEBAR_STATE_STORAGE_KEY,
                isCollapsed ? SIDEBAR_STATE_COLLAPSED : SIDEBAR_STATE_EXPANDED,
            )
        } catch {
            // The layout remains usable when browser storage is unavailable.
        }
    }
</script>

<svelte:head>
    <title>{routeMeta.title} | {PUBLIC_NAME}</title>
</svelte:head>

<Sidebar.Provider
    class="h-svh overflow-hidden"
    onOpenChange={handleSidebarOpenChange}
    open={!collapsed}
    style="--sidebar-width: 15rem; --sidebar-width-icon: 3.5rem;"
>
    <AppSidebar
        {navItems}
        {role}
        {session}
    />

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div
            class="flex h-15 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden"
        >
            <Sidebar.Trigger aria-label="Open navigation" />
            <h1
                class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
            >
                {routeMeta.title}
            </h1>
            <NotificationButton tooltipSide="bottom" />
        </div>

        <div class="hidden shrink-0 md:block">
            <SiteHeader
                {role}
                {routeMeta}
                {session}
            />
        </div>

        <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
            {@render children()}
        </main>
    </div>
</Sidebar.Provider>
