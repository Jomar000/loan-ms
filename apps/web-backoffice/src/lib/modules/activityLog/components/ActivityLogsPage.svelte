<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
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

<div
    class="flex min-h-0 page-scroll flex-1 flex-col bg-zinc-50/80 dark:bg-[#171717]"
>
    <div class="flex min-h-full flex-col gap-3 p-3 md:p-4">
        <header
            class="shrink-0 overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
        >
            <div
                class="h-1 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
            ></div>
            <div class="flex flex-wrap items-center justify-between gap-2 p-3">
                <div class="min-w-0">
                    <h1
                        class="text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                    >
                        Activity log
                    </h1>
                    <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Audit events, actors, and changes across your
                        organization.
                    </p>
                </div>
                <span
                    class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                    >Audit workspace</span
                >
            </div>
        </header>
        <div
            class="flex shrink-0 flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
        >
            <span
                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >Quick filters</span
            >
            <div
                class="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3"
            >
                {#each ACTIVITY_LOG_STAT_CARDS as card (card.key)}
                    <div
                        class={group === card.key
                            ? 'min-w-0 overflow-hidden rounded-lg border border-amber-300 bg-amber-50/60 *:w-full! *:max-w-full! *:min-w-0! *:rounded-none! *:border-0! **:min-w-0 dark:border-amber-500/30 dark:bg-amber-500/5 [&_p]:wrap-break-word'
                            : 'min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white *:w-full! *:max-w-full! *:min-w-0! *:rounded-none! *:border-0! **:min-w-0 dark:border-zinc-800 dark:bg-[#202020] [&_p]:wrap-break-word'}
                    >
                        <StatCard
                            active={group === card.key}
                            count={summary?.[card.key]}
                            description={card.description}
                            icon={card.icon}
                            label={card.label}
                            onclick={() => handleGroup(card.key)}
                            tone={card.tone}
                        />
                    </div>
                {/each}
            </div>
            {#if summaryQuery.isPending}
                <p
                    aria-live="polite"
                    class="text-xs text-zinc-500 dark:text-zinc-400"
                    role="status"
                >
                    Loading activity summary…
                </p>
            {:else if summaryQuery.isError}
                <div
                    class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300"
                    role="alert"
                >
                    <span>
                        {summary
                            ? 'Latest summary refresh failed. Previously loaded counts are still shown.'
                            : 'Activity summary is unavailable.'}
                    </span>
                    <Button
                        class="h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
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
            class="flex min-h-96 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
        >
            <div
                class="flex shrink-0 flex-col gap-2 border-b border-zinc-100 bg-zinc-50/60 p-2.5 xl:flex-row xl:items-center xl:justify-between dark:border-zinc-800 dark:bg-zinc-900/30"
            >
                <FilterBuilder
                    bind:open={filtersOpen}
                    class="min-w-0 flex-1"
                    definitions={ACTIVITY_LOG_FILTER_DEFINITIONS}
                    filters={activeFilters}
                    onClearAll={handleClearWorkspace}
                    onFiltersChange={handleFiltersChange}
                    onSearchChange={(value: string) => {
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
                <div
                    class="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap"
                >
                    <Input
                        aria-label="Date from"
                        bind:value={dateFrom}
                        class="h-8 w-full min-w-0 text-xs xl:w-52 2xl:w-60"
                        onchange={() => (pageNumber = 1)}
                        type="datetime-local"
                    />
                    <Input
                        aria-label="Date to"
                        bind:value={dateTo}
                        class="h-8 w-full min-w-0 text-xs xl:w-52 2xl:w-60"
                        onchange={() => (pageNumber = 1)}
                        type="datetime-local"
                    />
                    <NativeSelect.Root
                        aria-label="Sort order"
                        bind:value={sortOrder}
                        class="h-8 w-full text-xs sm:col-span-2 xl:w-auto [&_select]:text-xs"
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
                            class="size-3.5 animate-spin text-amber-600 dark:text-amber-300"
                        />{/if}
                </div>
            </div>
            <div
                class="shrink-0 border-b border-zinc-100 bg-white dark:border-zinc-800 dark:bg-[#202020]"
            >
                <ActiveFilterStrip
                    definitions={ACTIVITY_LOG_FILTER_DEFINITIONS}
                    filters={activeFilters}
                    onClearAll={handleClearWorkspace}
                    onFiltersChange={handleFiltersChange}
                    onShowMore={() => (filtersOpen = true)}
                />
            </div>
            {#if hasStalePage}
                <div
                    class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300"
                    role="alert"
                >
                    <span
                        >Latest refresh failed. Previously loaded events are
                        still shown.</span
                    >
                    <Button
                        class="h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                        onclick={() => listQuery.refetch()}
                        size="sm"
                        variant="outline"
                        ><RefreshCwIcon data-icon="inline-start" /> Retry</Button
                    >
                </div>
            {/if}
            <div
                class="relative max-h-[min(65vh,42rem)] min-h-56 table-scroll flex-1 bg-white dark:bg-[#202020]"
            >
                <Table.Root
                    class="min-w-[830px] bg-white text-xs dark:bg-[#202020]"
                >
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95 [&_th]:h-9 [&_th]:px-3 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:tracking-wider [&_th]:text-zinc-500 [&_th]:uppercase dark:[&_th]:text-zinc-400"
                    >
                        <Table.Row
                            class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                        >
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
                    <Table.Body class="[&_td]:h-11 [&_td]:px-3 [&_td]:py-1.5">
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
                                    class="group cursor-pointer border-b border-zinc-100 transition-colors hover:bg-amber-50/60 focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:outline-none focus-visible:ring-inset dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                                    onclick={(event: MouseEvent) =>
                                        handleRowClick(event, record)}
                                    onkeydown={(event: KeyboardEvent) =>
                                        handleRowKeydown(event, record)}
                                    tabindex={0}
                                >
                                    <Table.Cell class="whitespace-nowrap">
                                        <div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-xs/5 font-semibold text-zinc-900 dark:text-zinc-100"
                                                >{formatDate(
                                                    record.loggedAt,
                                                )}</span
                                            >
                                            <span
                                                class="text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                                >{formatTime(
                                                    record.loggedAt,
                                                )}</span
                                            >
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-xs/5 font-semibold text-zinc-900 dark:text-zinc-100"
                                                >{record.description}</span
                                            >
                                            <span
                                                class="text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                                >{activityActionLabel(
                                                    record.action,
                                                )}</span
                                            >
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell
                                        class="hidden text-xs/5 font-medium text-zinc-700 md:table-cell dark:text-zinc-300"
                                        >{activityComponentLabel(
                                            record.component,
                                        )}</Table.Cell
                                    >
                                    <Table.Cell
                                        ><div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-xs/5 font-semibold text-zinc-900 dark:text-zinc-100"
                                                >{record.actor.displayName ??
                                                    'Not recorded'}</span
                                            ><span
                                                class="text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                                >{actorSubtitle(
                                                    record.actor,
                                                )}</span
                                            >
                                        </div></Table.Cell
                                    >
                                    <Table.Cell class="hidden xl:table-cell"
                                        ><div class="flex flex-col gap-0.5">
                                            <span
                                                class="text-xs/5 font-medium text-zinc-700 dark:text-zinc-300"
                                                >{record.sourceChannel}</span
                                            ><span
                                                class="font-mono text-[11px]/4 text-zinc-500 dark:text-zinc-400"
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
            <div
                class="shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/35"
            >
                <PaginationFooter
                    count={recordCount}
                    disabled={listQuery.isFetching}
                    onPageChange={(value: number) => (pageNumber = value)}
                    onPageSizeChange={(value: number) => {
                        pageSize = value
                        pageNumber = 1
                    }}
                    page={pageNumber}
                    {pageSize}
                />
            </div>
        </section>
    </div>
</div>
<ActivityLogDetailSheet
    bind:open={() => currentDetailOpen, handleDetailOpenChange}
    publicId={currentSelectedPublicId}
/>
