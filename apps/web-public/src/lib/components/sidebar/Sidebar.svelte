<script lang="ts">
    import * as Command from '@hyperion/ui/components/command'
    import * as Popover from '@hyperion/ui/components/popover'
    import { Spinner } from '@hyperion/ui/components/spinner'
    import * as Tooltip from '@hyperion/ui/components/tooltip'
    import * as Sidebar from '@hyperion/ui/overrides/sidebar'
    import Building2Icon from '@lucide/svelte/icons/building-2'
    import CheckIcon from '@lucide/svelte/icons/check'
    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down'
    import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'
    import PanelLeftCloseIcon from '@lucide/svelte/icons/panel-left-close'
    import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open'
    import { useQueryClient } from '@tanstack/svelte-query'
    import { onDestroy } from 'svelte'
    import { toast } from 'svelte-sonner'
    import { SvelteSet } from 'svelte/reactivity'

    import { page } from '$app/state'
    import { PUBLIC_NAME } from '$env/static/public'
    import {
        createOrganizationListQuery,
        createSetActiveOrganizationMutation,
    } from '$lib/modules/auth/utilities/organizations'
    import {
        type SessionState,
        useSessionActionsContext,
    } from '$lib/states/session/context.svelte'
    import { hasActiveTenantMutations } from '$lib/states/session/tenant'
    import { debounce, getErrorMessage } from '$lib/utilities/helpers'
    import type { AppNavItem } from './types'
    import UserControls from './UserControls.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        navItems,
        onNavigate,
        role,
        session,
    }: {
        navItems: AppNavItem[]
        onNavigate?: () => void
        role: string
        session: SessionState
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const ORGANIZATION_SWITCH_TOAST_ID = 'organization-switch'
    const TOAST_FEEDBACK_DURATION = 8000
    const queryClient = useQueryClient()
    const sidebar = Sidebar.useSidebar()

    ///////////////
    // 03. State //
    ///////////////

    const expandedItems = new SvelteSet([
        'Workspace',
    ])
    let collapsedNavigationCloseTimeout:
        ReturnType<typeof setTimeout> | undefined
    let isOrganizationOpen = $state(false)
    let isSwitchingOrganization = $state(false)
    let openCollapsedNavigationPopover = $state<string | null>(null)
    let organizationSearch = $state('')
    let organizationSearchInput = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const organizationName = $derived(
        session.data.organizationName || 'Organization',
    )
    const organizations = $derived.by(
        () =>
            organizationListQuery.data?.pages.flatMap((page) => page.data) ??
            [],
    )
    const { transitionSessionBoundary } = useSessionActionsContext()

    /////////////////
    // 05. Queries //
    /////////////////

    const organizationListQuery = createOrganizationListQuery({
        get enabled() {
            return isOrganizationOpen
        },
        get searchFilter() {
            return organizationSearch
        },
    })
    ///////////////////
    // 06. Mutations //
    ///////////////////

    const setActiveOrganizationMutation = createSetActiveOrganizationMutation()

    /////////////////
    // 08. Effects //
    /////////////////

    onDestroy(cancelCollapsedNavigationPopoverClose)

    //////////////////
    // 09. Handlers //
    //////////////////

    function toggleExpanded(label: string) {
        if (expandedItems.has(label)) expandedItems.delete(label)
        else expandedItems.add(label)
    }

    function handleNavigate() {
        onNavigate?.()
        if (sidebar.isMobile) sidebar.setOpenMobile(false)
    }

    function handleCollapsedNavigationPopoverOpenChange(
        label: string,
        open: boolean,
    ) {
        cancelCollapsedNavigationPopoverClose()
        openCollapsedNavigationPopover = open ? label : null
    }

    function handleCollapsedNavigationPointerEnter(label: string) {
        cancelCollapsedNavigationPopoverClose()
        openCollapsedNavigationPopover = label
    }

    function handleCollapsedNavigationPointerLeave() {
        cancelCollapsedNavigationPopoverClose()
        collapsedNavigationCloseTimeout = setTimeout(() => {
            openCollapsedNavigationPopover = null
            collapsedNavigationCloseTimeout = undefined
        }, 120)
    }

    function handleCollapsedNavigate() {
        openCollapsedNavigationPopover = null
        handleNavigate()
    }

    function handleLoadMoreOrganizations() {
        if (
            isSwitchingOrganization ||
            organizationListQuery.isFetchingNextPage
        ) {
            return
        }
        void organizationListQuery.fetchNextPage()
    }

    function handleOrganizationOpenChange(open: boolean) {
        if (isSwitchingOrganization) return
        isOrganizationOpen = open
    }

    const handleOrganizationSearch = debounce(() => {
        organizationSearch = organizationSearchInput.trim()
    }, 300)

    async function handleOrganizationSelect(organizationSlug: string) {
        if (
            isSwitchingOrganization ||
            organizationSlug === session.data.organizationSlug
        ) {
            isOrganizationOpen = false
            return
        }

        if (
            hasActiveTenantMutations(queryClient, session.data.organizationSlug)
        ) {
            toast.warning('Organization switch unavailable', {
                id: ORGANIZATION_SWITCH_TOAST_ID,
                duration: TOAST_FEEDBACK_DURATION,
                description:
                    'Finish the active organization operation, then try again.',
            })
            return
        }

        isSwitchingOrganization = true
        let organizationChanged = false

        try {
            await setActiveOrganizationMutation.mutateAsync(organizationSlug)
            organizationChanged = true

            isOrganizationOpen = false
            handleNavigate()
            await transitionSessionBoundary('/app')
        } catch (error) {
            if (organizationChanged) {
                toast.warning('Organization changed', {
                    id: ORGANIZATION_SWITCH_TOAST_ID,
                    duration: TOAST_FEEDBACK_DURATION,
                    description:
                        'The organization changed, but the page could not finish refreshing. Reload the page to continue.',
                })
            } else {
                toast.error('Organization switch failed', {
                    id: ORGANIZATION_SWITCH_TOAST_ID,
                    duration: TOAST_FEEDBACK_DURATION,
                    description: getErrorMessage(
                        error,
                        'Organization switch failed.',
                    ),
                })
            }
        } finally {
            isSwitchingOrganization = false
        }
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function cancelCollapsedNavigationPopoverClose() {
        if (collapsedNavigationCloseTimeout === undefined) return
        clearTimeout(collapsedNavigationCloseTimeout)
        collapsedNavigationCloseTimeout = undefined
    }

    function isActive(item: AppNavItem) {
        if (item.href === page.url.pathname) return true
        return item.children?.some((child) => child.href === page.url.pathname)
    }
</script>

<Sidebar.Root collapsible="icon">
    <Sidebar.Header
        class="h-15 shrink-0 items-center justify-center gap-0 border-b border-sidebar-border p-0"
    >
        {#if sidebar.state === 'collapsed'}
            <Sidebar.Menu class="w-auto">
                <Sidebar.MenuItem>
                    <Tooltip.Root>
                        <Tooltip.Trigger>
                            {#snippet child({ props })}
                                <Sidebar.MenuButton
                                    {...props}
                                    aria-label="Expand sidebar"
                                    class="mx-auto size-9 justify-center rounded-md p-0 text-sidebar-foreground/60 transition-colors group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-0! hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:translate-y-0"
                                    onclick={() => sidebar.toggle()}
                                >
                                    <PanelLeftOpenIcon />
                                </Sidebar.MenuButton>
                            {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content side="right">
                            Expand sidebar
                        </Tooltip.Content>
                    </Tooltip.Root>
                </Sidebar.MenuItem>
            </Sidebar.Menu>
        {:else}
            <div class="flex w-full items-center gap-3 pr-2 pl-4">
                <div
                    class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
                >
                    H
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                    <span
                        class="text-sm/tight font-semibold tracking-tight text-sidebar-foreground"
                    >
                        {PUBLIC_NAME}
                    </span>
                    <span
                        class="truncate text-[10px] leading-tight text-sidebar-foreground/50"
                    >
                        Application Platform
                    </span>
                </div>
                {#if !sidebar.isMobile}
                    <Tooltip.Root>
                        <Tooltip.Trigger>
                            {#snippet child({ props })}
                                <Sidebar.MenuButton
                                    {...props}
                                    aria-label="Collapse sidebar"
                                    class="size-7 shrink-0 justify-center rounded-md p-0 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:translate-y-0"
                                    onclick={() => sidebar.toggle()}
                                >
                                    <PanelLeftCloseIcon />
                                </Sidebar.MenuButton>
                            {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content side="right">
                            Collapse sidebar
                        </Tooltip.Content>
                    </Tooltip.Root>
                {/if}
            </div>
        {/if}
    </Sidebar.Header>

    <Sidebar.Content class="gap-0">
        {#if navItems.length === 0}
            <div
                class="flex flex-1 items-center justify-center p-4 text-center text-xs text-sidebar-foreground/45 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:[writing-mode:vertical-rl]"
            >
                Member navigation coming soon
            </div>
        {:else}
            <Sidebar.Group class="p-0">
                <Sidebar.GroupContent>
                    <Sidebar.Menu
                        aria-label="Primary navigation"
                        class="gap-0.5 px-2 py-3 group-data-[collapsible=icon]:items-center"
                    >
                        {#each navItems as item (item.label)}
                            {@const Icon = item.icon}
                            <Sidebar.MenuItem
                                class="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center"
                            >
                                {#if item.children?.length}
                                    {#if sidebar.state === 'collapsed'}
                                        <Popover.Root
                                            onOpenChange={(open) =>
                                                handleCollapsedNavigationPopoverOpenChange(
                                                    item.label,
                                                    open,
                                                )}
                                            open={openCollapsedNavigationPopover ===
                                                item.label}
                                        >
                                            <Popover.Trigger>
                                                {#snippet child({ props })}
                                                    <Sidebar.MenuButton
                                                        {...props}
                                                        aria-label={item.label}
                                                        class="mx-auto size-9 justify-center rounded-md p-0 text-sidebar-foreground/70 transition-colors group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-0! hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:translate-y-0 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
                                                        isActive={isActive(
                                                            item,
                                                        )}
                                                        onblur={handleCollapsedNavigationPointerLeave}
                                                        onfocus={() =>
                                                            handleCollapsedNavigationPointerEnter(
                                                                item.label,
                                                            )}
                                                        onpointerenter={() =>
                                                            handleCollapsedNavigationPointerEnter(
                                                                item.label,
                                                            )}
                                                        onpointerleave={handleCollapsedNavigationPointerLeave}
                                                    >
                                                        <Icon />
                                                    </Sidebar.MenuButton>
                                                {/snippet}
                                            </Popover.Trigger>
                                            <Popover.Content
                                                align="start"
                                                class="w-52 gap-0 p-1.5"
                                                onfocusin={cancelCollapsedNavigationPopoverClose}
                                                onfocusout={handleCollapsedNavigationPointerLeave}
                                                onpointerenter={cancelCollapsedNavigationPopoverClose}
                                                onpointerleave={handleCollapsedNavigationPointerLeave}
                                                side="right"
                                                sideOffset={10}
                                            >
                                                <p
                                                    class="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                                                >
                                                    {item.label}
                                                </p>
                                                <Sidebar.MenuSub
                                                    class="mx-0 translate-x-0 gap-0.5 border-0 p-0"
                                                >
                                                    {#each item.children as child (child.label)}
                                                        {@const ChildIcon =
                                                            child.icon}
                                                        <Sidebar.MenuSubItem>
                                                            <Sidebar.MenuSubButton
                                                                aria-disabled={child.disabled}
                                                                class="h-auto translate-x-0 gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-popover-foreground transition-colors hover:bg-accent aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground/45 aria-disabled:opacity-100 data-active:bg-accent data-active:font-medium data-active:text-foreground"
                                                                href={child.disabled
                                                                    ? undefined
                                                                    : child.href}
                                                                isActive={child.href ===
                                                                    page.url
                                                                        .pathname}
                                                                onclick={child.disabled
                                                                    ? undefined
                                                                    : handleCollapsedNavigate}
                                                            >
                                                                <ChildIcon
                                                                    class="size-3.5"
                                                                />
                                                                <span
                                                                    >{child.label}</span
                                                                >
                                                            </Sidebar.MenuSubButton>
                                                        </Sidebar.MenuSubItem>
                                                    {/each}
                                                </Sidebar.MenuSub>
                                            </Popover.Content>
                                        </Popover.Root>
                                    {:else}
                                        <Sidebar.MenuButton
                                            aria-expanded={expandedItems.has(
                                                item.label,
                                            )}
                                            class="h-8 gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:translate-y-0 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
                                            isActive={isActive(item)}
                                            onclick={() =>
                                                toggleExpanded(item.label)}
                                        >
                                            <Icon class="shrink-0 opacity-70" />
                                            <span class="flex-1 text-left"
                                                >{item.label}</span
                                            >
                                            {#if expandedItems.has(item.label)}
                                                <ChevronDownIcon
                                                    class="opacity-50"
                                                />
                                            {:else}
                                                <ChevronRightIcon
                                                    class="opacity-50"
                                                />
                                            {/if}
                                        </Sidebar.MenuButton>
                                        {#if expandedItems.has(item.label)}
                                            <Sidebar.MenuSub
                                                class="mx-0 mt-0.5 translate-x-0 gap-0.5 border-0 p-0"
                                            >
                                                {#each item.children as child (child.label)}
                                                    {@const ChildIcon =
                                                        child.icon}
                                                    <Sidebar.MenuSubItem>
                                                        <Sidebar.MenuSubButton
                                                            aria-disabled={child.disabled}
                                                            class="h-7 translate-x-0 gap-2.5 rounded-md py-1.5 pr-2.5 pl-8 text-[13px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground aria-disabled:cursor-not-allowed aria-disabled:text-sidebar-foreground/30 aria-disabled:opacity-100 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
                                                            href={child.disabled
                                                                ? undefined
                                                                : child.href}
                                                            isActive={child.href ===
                                                                page.url
                                                                    .pathname}
                                                            onclick={child.disabled
                                                                ? undefined
                                                                : handleNavigate}
                                                        >
                                                            <ChildIcon
                                                                class="size-4 shrink-0 opacity-70"
                                                            />
                                                            <span
                                                                >{child.label}</span
                                                            >
                                                        </Sidebar.MenuSubButton>
                                                    </Sidebar.MenuSubItem>
                                                {/each}
                                            </Sidebar.MenuSub>
                                        {/if}
                                    {/if}
                                {:else}
                                    <Sidebar.MenuButton
                                        aria-disabled={item.disabled}
                                        class="h-8 gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground/80 transition-colors group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:translate-y-0 aria-disabled:cursor-not-allowed aria-disabled:text-sidebar-foreground/30 aria-disabled:opacity-100 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
                                        isActive={isActive(item)}
                                        tooltipContent={item.disabled
                                            ? `${item.label} - coming soon`
                                            : item.label}
                                    >
                                        {#snippet child({ props })}
                                            <a
                                                {...props}
                                                aria-label={item.label}
                                                href={item.disabled
                                                    ? undefined
                                                    : item.href}
                                                onclick={item.disabled
                                                    ? undefined
                                                    : handleNavigate}
                                            >
                                                <Icon
                                                    class="shrink-0 opacity-70"
                                                />
                                                <span
                                                    class="group-data-[collapsible=icon]:hidden"
                                                    >{item.label}</span
                                                >
                                            </a>
                                        {/snippet}
                                    </Sidebar.MenuButton>
                                {/if}
                            </Sidebar.MenuItem>
                        {/each}
                    </Sidebar.Menu>
                </Sidebar.GroupContent>
            </Sidebar.Group>
        {/if}
    </Sidebar.Content>

    <Sidebar.Footer
        class="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3"
    >
        <Popover.Root
            onOpenChange={handleOrganizationOpenChange}
            open={isOrganizationOpen}
        >
            <Popover.Trigger>
                {#snippet child({ props })}
                    <Sidebar.MenuButton
                        {...props}
                        aria-label={`Current organization: ${organizationName}`}
                        aria-disabled={isSwitchingOrganization}
                        class="h-auto gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-2 text-sidebar-foreground group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0! hover:bg-sidebar-accent/60"
                    >
                        <span
                            class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:text-sidebar-foreground/60"
                        >
                            <Building2Icon />
                        </span>
                        <span
                            class="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden"
                        >
                            <span class="truncate text-sm/tight font-semibold"
                                >{organizationName}</span
                            >
                            <span
                                class="truncate text-xs text-muted-foreground"
                            >
                                Current organization
                            </span>
                        </span>
                        <ChevronDownIcon
                            class="ml-auto opacity-50 group-data-[collapsible=icon]:hidden"
                        />
                    </Sidebar.MenuButton>
                {/snippet}
            </Popover.Trigger>
            <Popover.Content
                align="start"
                class="w-72 p-0"
                side={sidebar.state === 'collapsed' ? 'right' : 'top'}
                sideOffset={8}
            >
                <Command.Root shouldFilter={false}>
                    <label
                        class="sr-only"
                        for="organization-search"
                    >
                        Search organizations
                    </label>
                    <Command.Input
                        aria-label="Search organizations"
                        bind:value={organizationSearchInput}
                        disabled={isSwitchingOrganization}
                        id="organization-search"
                        oninput={handleOrganizationSearch}
                        placeholder="Search organization..."
                    />
                    <Command.List class="max-h-64 overflow-y-auto">
                        {#if organizationListQuery.isPending}
                            <Command.Loading
                                >Loading organizations…</Command.Loading
                            >
                        {:else if organizationListQuery.isError}
                            <Command.Empty>
                                Organizations could not be loaded.
                            </Command.Empty>
                        {:else}
                            {#if organizations.length === 0}
                                <Command.Empty>
                                    No organizations found.
                                </Command.Empty>
                            {:else}
                                <Command.Group heading="Organizations">
                                    {#each organizations as organization (organization.slug)}
                                        <Command.Item
                                            disabled={isSwitchingOrganization}
                                            onSelect={() =>
                                                handleOrganizationSelect(
                                                    organization.slug,
                                                )}
                                            value={`${organization.name} ${organization.slug}`}
                                        >
                                            <Building2Icon />
                                            <span class="min-w-0 flex-1">
                                                <span
                                                    class="block truncate font-medium"
                                                >
                                                    {organization.name}
                                                </span>
                                                <span
                                                    class="block truncate text-xs text-muted-foreground"
                                                >
                                                    {organization.slug}
                                                </span>
                                            </span>
                                            {#if organization.slug === session.data.organizationSlug}
                                                <CheckIcon
                                                    class="text-primary"
                                                />
                                            {/if}
                                        </Command.Item>
                                    {/each}
                                </Command.Group>
                                {#if organizationListQuery.hasNextPage}
                                    <Sidebar.MenuButton
                                        aria-disabled={isSwitchingOrganization ||
                                            organizationListQuery.isFetchingNextPage}
                                        onclick={handleLoadMoreOrganizations}
                                    >
                                        {#if organizationListQuery.isFetchingNextPage}
                                            <Spinner />
                                            Loading…
                                        {:else}
                                            Load more
                                        {/if}
                                    </Sidebar.MenuButton>
                                {/if}
                            {/if}
                        {/if}
                    </Command.List>
                </Command.Root>
            </Popover.Content>
        </Popover.Root>
    </Sidebar.Footer>

    <div class="border-t border-sidebar-border md:hidden">
        <UserControls
            {role}
            {session}
            variant="mobile"
        />
    </div>
    <Sidebar.Rail />
</Sidebar.Root>
