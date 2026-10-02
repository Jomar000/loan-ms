<script lang="ts">
    import { Button } from '@hyperion/ui/components/button'
    import { Input } from '@hyperion/ui/components/input'
    import * as NativeSelect from '@hyperion/ui/components/native-select'
    import { Skeleton } from '@hyperion/ui/components/skeleton'
    import * as Table from '@hyperion/ui/components/table'
    import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { onDestroy } from 'svelte'
    import { SvelteURL } from 'svelte/reactivity'

    import { afterNavigate, replaceState } from '$app/navigation'
    import { page } from '$app/state'
    import ActiveFilterStrip from '$lib/components/dataWorkspace/ActiveFilterStrip.svelte'
    import EmptyState from '$lib/components/dataWorkspace/EmptyState.svelte'
    import FilterBuilder from '$lib/components/dataWorkspace/FilterBuilder.svelte'
    import {
        parseWorkspaceUrl,
        serializeWorkspaceUrl,
    } from '$lib/components/dataWorkspace/filtering'
    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import StatCard from '$lib/components/dataWorkspace/StatCard.svelte'
    import type { ActiveFilter } from '$lib/components/dataWorkspace/types'
    import { useSessionContext } from '$lib/states/session'
    import { createTenantKey } from '$lib/states/session/tenant'
    import { debounce } from '$lib/utilities/helpers'
    import {
        ACTIVITY_LOG_STAT_CARDS,
        activityActionLabel,
        activityComponentLabel,
        isActivityLogGroup,
    } from '../config'
    import {
        ACTIVITY_LOG_FILTER_DEFINITIONS,
        normalizeActivityLogFilters,
    } from '../filters'
    import {
        createActivityLogListQuery,
        createActivityLogSummaryQuery,
    } from '../queries'
    import type { ActivityLogGroup, ActivityLogRecord } from '../types'
    import ActivityLogDetailSheet from './ActivityLogDetailSheet.svelte'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()
    const SKELETON_ROWS = [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
    ]
    const initialUrlState = parseWorkspaceUrl(
        page.url.searchParams,
        ACTIVITY_LOG_FILTER_DEFINITIONS,
    )
    ///////////////
    // 03. State //
    ///////////////

    let activeFilters = $state<ActiveFilter[]>(initialUrlState.filters)
    let dateFrom = $state(
        parseDateParameter(
            page.url.searchParams.get('dateFrom'),
            startOfToday(),
        ),
    )
    let dateTo = $state(
        parseDateParameter(page.url.searchParams.get('dateTo'), endOfToday()),
    )
    let detailOpen = $state(false)
    let filtersOpen = $state(false)
    let group = $state<ActivityLogGroup>(
        parseGroup(page.url.searchParams.get('group')),
    )
    let inputSearchFilter = $state(initialUrlState.searchFilter)
    let pageNumber = $state(initialUrlState.page)
    let pageSize = $state(initialUrlState.pageSize)
    let searchFilter = $state(initialUrlState.searchFilter)
    let selectedOrganizationRevision = $state(session.organizationRevision)
    let selectedOrganizationSlug = $state(session.data.organizationSlug)
    let selectedPublicId = $state('')
    let synchronizedUrlHref = page.url.href
    let sortOrder = $state<'asc' | 'desc'>(
        page.url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
    )

    /////////////////
    // 04. Derived //
    /////////////////

    const normalized = $derived(
        normalizeActivityLogFilters({
            activeFilters,
            dateFrom,
            dateTo,
            group,
            searchFilter,
        }),
    )
    const summaryFilters = $derived({
        ...normalized.filters,
        group: 'all' as const,
    })
    const request = $derived({
        filters: normalized.filters,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
        sortOrder,
    })
    const selectedRecordBelongsToCurrentOrganization = $derived(
        selectedOrganizationSlug === session.data.organizationSlug &&
            selectedOrganizationRevision === session.organizationRevision,
    )
    const currentDetailOpen = $derived(
        detailOpen && selectedRecordBelongsToCurrentOrganization,
    )
    const currentSelectedPublicId = $derived(
        selectedRecordBelongsToCurrentOrganization ? selectedPublicId : '',
    )

    /////////////////
    // 05. Queries //
    /////////////////

    const listQuery = createActivityLogListQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get request() {
                return request
            },
        },
    )
    const summaryQuery = createActivityLogSummaryQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get filters() {
                return summaryFilters
            },
        },
    )
    const visiblePage = $derived(listQuery.data)
    const records = $derived<ActivityLogRecord[]>(
        normalized.matchNone ? [] : (visiblePage?.data ?? []),
    )
    const recordCount = $derived(
        normalized.matchNone ? 0 : (visiblePage?.count ?? 0),
    )
    const hasStalePage = $derived(listQuery.isError && Boolean(listQuery.data))
    const summary = $derived(summaryQuery.data)

    /////////////////
    // 08. Effects //
    /////////////////

    afterNavigate(({ to }) => {
        if (!to) return
        applySearch.cancel()
        synchronizedUrlHref = to.url.href
        syncFromUrl(to.url)
    })

    onDestroy(() => {
        applySearch.cancel()
    })

    // Intentional external synchronization: make restorable workspace state
    // observable to browser history after navigation has restored local state.
    $effect(() => {
        const params = serializeWorkspaceUrl({
            filters: activeFilters,
            page: pageNumber,
            pageSize,
            parent: '',
            searchFilter,
            sortBy: 'name',
            sortOrder,
        })
        if (group !== 'all') params.set('group', group)
        const dateFromParameter = toIsoDateTimeParameter(dateFrom, 'start')
        const dateToParameter = toIsoDateTimeParameter(dateTo, 'end')
        if (dateFromParameter) params.set('dateFrom', dateFromParameter)
        if (dateToParameter) params.set('dateTo', dateToParameter)
        const nextSearch = params.toString()
        if (page.url.href !== synchronizedUrlHref) return
        if (nextSearch === page.url.searchParams.toString()) return
        const nextUrl = new SvelteURL(page.url)
        nextUrl.search = nextSearch
        replaceState(
            `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
            page.state,
        )
        synchronizedUrlHref = page.url.href
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    const applySearch = debounce((value: string) => {
        searchFilter = value.trim()
        pageNumber = 1
    }, 300)

    function handleClearWorkspace() {
        applySearch.cancel()
        activeFilters = []
        group = 'all'
        inputSearchFilter = ''
        searchFilter = ''
        dateFrom = toDateTimeLocal(startOfToday())
        dateTo = toDateTimeLocal(endOfToday())
        pageNumber = 1
    }

    function handleFiltersChange(filters: ActiveFilter[]) {
        activeFilters = filters
        pageNumber = 1
    }

    function handleDetailOpenChange(value: boolean) {
        detailOpen = value
        if (!value) selectedPublicId = ''
    }

    function handleGroup(nextGroup: ActivityLogGroup) {
        group = nextGroup
        pageNumber = 1
    }

    function handleRowClick(event: MouseEvent, record: ActivityLogRecord) {
        if (isInteractiveTarget(event.target)) return
        openRecord(record.publicId)
    }

    function handleRowKeydown(event: KeyboardEvent, record: ActivityLogRecord) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (isInteractiveTarget(event.target)) return
        event.preventDefault()
        openRecord(record.publicId)
    }

    function openRecord(publicId: string) {
        selectedOrganizationRevision = session.organizationRevision
        selectedOrganizationSlug = session.data.organizationSlug
        selectedPublicId = publicId
        detailOpen = true
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function startOfToday() {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }

    function endOfToday() {
        const now = new Date()
        return new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
        )
    }

    function actorSubtitle(actor: ActivityLogRecord['actor']) {
        if (actor.type !== 'user') {
            return actor.type
                ? activityComponentLabel(actor.type)
                : 'Actor type not recorded'
        }
        if (!actor.role) return 'Role not recorded'
        return actor.role
            .split(',')
            .map((role) => activityComponentLabel(role.trim()))
            .join(', ')
    }

    function toDateTimeLocal(value: Date) {
        const local = new Date(
            value.getTime() - value.getTimezoneOffset() * 60_000,
        )
        return local.toISOString().slice(0, 16)
    }

    function parseDateParameter(value: string | null, fallback: Date) {
        if (!value || Number.isNaN(Date.parse(value)))
            return toDateTimeLocal(fallback)
        return toDateTimeLocal(new Date(value))
    }

    function toIsoDateTimeParameter(value: string, boundary: 'start' | 'end') {
        const timestamp = Date.parse(value)
        if (Number.isNaN(timestamp)) return undefined
        const minuteStart = Math.floor(timestamp / 60_000) * 60_000
        return new Date(
            minuteStart + (boundary === 'end' ? 59_999 : 0),
        ).toISOString()
    }

    function parseGroup(value: string | null): ActivityLogGroup {
        return isActivityLogGroup(value) ? value : 'all'
    }

    function syncFromUrl(url: URL) {
        const nextState = parseWorkspaceUrl(
            url.searchParams,
            ACTIVITY_LOG_FILTER_DEFINITIONS,
        )
        activeFilters = nextState.filters
        dateFrom = parseDateParameter(
            url.searchParams.get('dateFrom'),
            startOfToday(),
        )
        dateTo = parseDateParameter(
            url.searchParams.get('dateTo'),
            endOfToday(),
        )
        group = parseGroup(url.searchParams.get('group'))
        inputSearchFilter = nextState.searchFilter
        pageNumber = nextState.page
        pageSize = nextState.pageSize
        searchFilter = nextState.searchFilter
        sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
    }

    function formatDate(value: string) {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
        }).format(new Date(value))
    }

    function formatTime(value: string) {
        return new Intl.DateTimeFormat(undefined, {
            timeStyle: 'short',
        }).format(new Date(value))
    }

    function isInteractiveTarget(target: EventTarget | null) {
        return (
            target instanceof Element &&
            Boolean(target.closest('a,button,input,select,textarea'))
        )
    }
</script>

<div class="flex h-full min-h-0 flex-1 flex-col">
    <div class="flex h-full min-h-0 flex-col gap-4 p-4">
        <div class="flex shrink-0 flex-col gap-2">
            <span
                class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Quick filters</span
            >
            <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {#each ACTIVITY_LOG_STAT_CARDS as card (card.key)}
                    <StatCard
                        active={group === card.key}
                        count={summary?.[card.key]}
                        description={card.description}
                        icon={card.icon}
                        label={card.label}
                        onclick={() => handleGroup(card.key)}
                        tone={card.tone}
                    />
                {/each}
            </div>
            {#if summaryQuery.isPending}
                <p
                    aria-live="polite"
                    class="text-xs text-muted-foreground"
                    role="status"
                >
                    Loading activity summary…
                </p>
            {:else if summaryQuery.isError}
                <div
                    class="border-danger-active-border bg-danger text-danger-foreground flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3 py-2 text-xs"
                    role="alert"
                >
                    <span>
                        {summary
                            ? 'Latest summary refresh failed. Previously loaded counts are still shown.'
                            : 'Activity summary is unavailable.'}
                    </span>
                    <Button
                        onclick={() => summaryQuery.refetch()}
                        size="sm"
                        variant="outline"
                    >
                        Retry summary
                    </Button>
                </div>
            {/if}
        </div>

        <section
            class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border bg-background"
        >
            <div
                class="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-3 py-2 xl:flex-row xl:items-center"
            >
                <FilterBuilder
                    bind:open={filtersOpen}
                    class="flex-1"
                    definitions={ACTIVITY_LOG_FILTER_DEFINITIONS}
                    filters={activeFilters}
                    onClearAll={handleClearWorkspace}
                    onFiltersChange={handleFiltersChange}
                    onSearchChange={(value) => {
                        inputSearchFilter = value
                        void applySearch(value)
                    }}
                    optionQueryKey={createTenantKey(
                        session.data.organizationSlug,
                        'activityLog',
                        'filterOptions',
                    )}
                    search={inputSearchFilter}
                    searchPlaceholder="Search activity, actor, event ID, record, or IP"
                />
                <div class="flex flex-wrap items-center gap-2">
                    <Input
                        aria-label="Date from"
                        bind:value={dateFrom}
                        class="h-8 w-72 min-w-72 shrink-0 text-xs"
                        onchange={() => (pageNumber = 1)}
                        type="datetime-local"
                    />
                    <Input
                        aria-label="Date to"
                        bind:value={dateTo}
                        class="h-8 w-72 min-w-72 shrink-0 text-xs"
                        onchange={() => (pageNumber = 1)}
                        type="datetime-local"
                    />
                    <NativeSelect.Root
                        aria-label="Sort order"
                        bind:value={sortOrder}
                        class="[&_select]:text-xs"
                        onchange={() => (pageNumber = 1)}
                        size="sm"
                    >
                        <NativeSelect.Option value="desc"
                            >Newest</NativeSelect.Option
                        >
                        <NativeSelect.Option value="asc"
                            >Oldest</NativeSelect.Option
                        >
                    </NativeSelect.Root>
                    {#if listQuery.isFetching}<LoaderCircleIcon
                            aria-label="Refreshing"
                            class="size-3.5 animate-spin text-muted-foreground"
                        />{/if}
                </div>
            </div>

            <ActiveFilterStrip
                definitions={ACTIVITY_LOG_FILTER_DEFINITIONS}
                filters={activeFilters}
                onClearAll={handleClearWorkspace}
                onFiltersChange={handleFiltersChange}
                onShowMore={() => (filtersOpen = true)}
            />

            {#if hasStalePage}
                <div
                    class="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                    role="alert"
                >
                    <span
                        >Latest refresh failed. Previously loaded events are
                        still shown.</span
                    >
                    <Button
                        onclick={() => listQuery.refetch()}
                        size="sm"
                        variant="outline"
                        ><RefreshCwIcon data-icon="inline-start" /> Retry</Button
                    >
                </div>
            {/if}

            <div class="relative min-h-0 flex-1 overflow-auto bg-background">
                <Table.Root class="bg-background md:min-w-190">
                    <Table.Header
                        class="sticky top-0 z-10 bg-card [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase"
                    >
                        <Table.Row class="hover:bg-transparent">
                            <Table.Head class="w-36 md:w-42"
                                >Date and time</Table.Head
                            >
                            <Table.Head class="md:min-w-72">Activity</Table.Head
                            >
                            <Table.Head class="hidden min-w-42 md:table-cell"
                                >Module</Table.Head
                            >
                            <Table.Head class="w-32 md:min-w-40"
                                >Actor</Table.Head
                            >
                            <Table.Head class="hidden min-w-40 xl:table-cell"
                                >Source / IP</Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#if listQuery.isPending}
                            {#each SKELETON_ROWS as row (row)}
                                <Table.Row
                                    ><Table.Cell colspan={5}
                                        ><Skeleton
                                            class="h-7 w-full"
                                        /></Table.Cell
                                    ></Table.Row
                                >
                            {/each}
                        {:else if listQuery.isError && !hasStalePage}
                            <Table.Row
                                ><Table.Cell
                                    colspan={5}
                                    class="h-64"
                                    ><EmptyState
                                        actionLabel="Retry"
                                        description="The activity log could not be loaded."
                                        onaction={() => listQuery.refetch()}
                                        title="Unable to load activity"
                                    /></Table.Cell
                                ></Table.Row
                            >
                        {:else if records.length === 0}
                            <Table.Row
                                ><Table.Cell
                                    colspan={5}
                                    class="h-64"
                                    ><EmptyState
                                        actionLabel="Clear filters"
                                        description="No events match the selected date range and filters."
                                        onaction={handleClearWorkspace}
                                        title="No activity found"
                                    /></Table.Cell
                                ></Table.Row
                            >
                        {:else}
                            {#each records as record (record.publicId)}
                                <Table.Row
                                    class="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                                    onclick={(event) =>
                                        handleRowClick(event, record)}
                                    onkeydown={(event) =>
                                        handleRowKeydown(event, record)}
                                    tabindex={0}
                                >
                                    <Table.Cell class="whitespace-nowrap">
                                        <div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-sm/5 font-semibold text-foreground"
                                                >{formatDate(
                                                    record.loggedAt,
                                                )}</span
                                            >
                                            <span
                                                class="text-xs/4 text-muted-foreground"
                                                >{formatTime(
                                                    record.loggedAt,
                                                )}</span
                                            >
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-sm/5 font-semibold text-foreground"
                                                >{record.description}</span
                                            >
                                            <span
                                                class="text-xs/4 text-muted-foreground"
                                                >{activityActionLabel(
                                                    record.action,
                                                )}</span
                                            >
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell
                                        class="hidden text-sm/5 font-medium text-foreground md:table-cell"
                                        >{activityComponentLabel(
                                            record.component,
                                        )}</Table.Cell
                                    >
                                    <Table.Cell
                                        ><div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-sm/5 font-semibold text-foreground"
                                                >{record.actor.displayName ??
                                                    'Not recorded'}</span
                                            ><span
                                                class="text-xs/4 text-muted-foreground"
                                                >{actorSubtitle(
                                                    record.actor,
                                                )}</span
                                            >
                                        </div></Table.Cell
                                    >
                                    <Table.Cell class="hidden xl:table-cell"
                                        ><div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-sm/5 font-medium text-foreground"
                                                >{record.sourceChannel}</span
                                            ><span
                                                class="font-mono text-xs/4 text-muted-foreground"
                                                >{record.ipAddress ??
                                                    'N/A'}</span
                                            >
                                        </div></Table.Cell
                                    >
                                </Table.Row>
                            {/each}
                        {/if}
                    </Table.Body>
                </Table.Root>
            </div>

            <PaginationFooter
                count={recordCount}
                disabled={listQuery.isFetching}
                onPageChange={(value) => (pageNumber = value)}
                onPageSizeChange={(value) => {
                    pageSize = value
                    pageNumber = 1
                }}
                page={pageNumber}
                {pageSize}
            />
        </section>
    </div>
</div>

<ActivityLogDetailSheet
    bind:open={() => currentDetailOpen, handleDetailOpenChange}
    publicId={currentSelectedPublicId}
/>
