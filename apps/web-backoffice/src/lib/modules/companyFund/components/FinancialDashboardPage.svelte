<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Chart, type ChartConfiguration } from '@loanms/ui/shared/chart'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import { onMount } from 'svelte'

    import { formatCurrency } from '$lib/modules/loan/utilities/format'
    import { createCollectionsDateQuery } from '$lib/modules/payment/queries'
    import { useSessionContext } from '$lib/states/session'
    import {
        createCompanyFundSummaryQuery,
        createReportSummaryQuery,
    } from '../queries'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { title = 'Dashboard' }: { title?: string } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()
    const reportRequest = { filters: {} }

    ///////////////
    // 03. State //
    ///////////////

    let today = $state(manilaDate())

    /////////////////
    // 05. Queries //
    /////////////////

    const fundQuery = createCompanyFundSummaryQuery({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    const reportQuery = createReportSummaryQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        { request: reportRequest },
    )

    const collectionQuery = createCollectionsDateQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get date() {
                return today
            },
        },
    )

    /////////////////
    // 04. Derived //
    /////////////////

    const fund = $derived(fundQuery.data ?? null)
    const report = $derived(reportQuery.data ?? null)
    const collections = $derived(collectionQuery.data ?? [])

    const expectedMinor = $derived(
        collections.reduce((total, item) => total + item.amountDueMinor, 0),
    )

    const collectedMinor = $derived(
        collections.reduce((total, item) => total + item.amountPaidMinor, 0),
    )

    const remainingMinor = $derived(Math.max(0, expectedMinor - collectedMinor))

    const cashMovementConfig = $derived<
        ChartConfiguration<'bar', number[], string>
    >({
        type: 'bar',
        data: {
            labels: ['All time'],
            datasets: [
                {
                    label: 'Cash in',
                    data: [(report?.periodCashInMinor ?? 0) / 100],
                },
                {
                    label: 'Cash out',
                    data: [(report?.periodCashOutMinor ?? 0) / 100],
                },
            ],
        },
        options: {
            indexAxis: 'y',
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `${context.dataset.label}: ${formatCurrency(
                                (context.parsed.x ?? 0) * 100,
                            )}`,
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) =>
                            formatCurrency(Number(value) * 100),
                        maxTicksLimit: 5,
                    },
                },
            },
        },
    })

    const collectionsConfig = $derived<
        ChartConfiguration<'pie', number[], string>
    >({
        type: 'pie',
        data: {
            labels: [
                'Collected so far',
                'Still to collect',
            ],
            datasets: [
                {
                    data: [
                        collectedMinor / 100,
                        remainingMinor / 100,
                    ],
                },
            ],
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (context) =>
                            `${context.label}: ${formatCurrency(
                                context.parsed * 100,
                            )}`,
                    },
                },
            },
        },
    })

    /////////////////
    // 08. Effects //
    /////////////////

    onMount(() => {
        let timer: ReturnType<typeof setTimeout>

        function scheduleNextDay() {
            const nextMidnight =
                new Date(`${manilaDate()}T00:00:00+08:00`).getTime() +
                86_400_000

            timer = setTimeout(
                () => {
                    refreshToday()
                    scheduleNextDay()
                },
                Math.max(1_000, nextMidnight - Date.now() + 1_000),
            )
        }

        scheduleNextDay()

        return () => clearTimeout(timer)
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    function refreshToday() {
        today = manilaDate()
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function manilaDate(): string {
        const parts = new Intl.DateTimeFormat('en-CA', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'Asia/Manila',
            year: 'numeric',
        }).formatToParts(new Date())

        const part = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((entry) => entry.type === type)?.value ?? ''

        return `${part('year')}-${part('month')}-${part('day')}`
    }
</script>

<svelte:window onfocus={refreshToday} />
<svelte:document onvisibilitychange={refreshToday} />

<section
    class="flex size-full min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50/80 dark:bg-[#171717]"
>
    <!-- Dashboard header -->
    <header
        class="z-30 shrink-0 border-b border-zinc-200 bg-white/95 px-3 py-2.5 backdrop-blur-sm md:px-4 dark:border-zinc-800 dark:bg-[#202020]/95"
    >
        <div
            class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                    <h1
                        class="text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                    >
                        {title}
                    </h1>

                    <span
                        class="inline-flex h-5 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[9px] font-bold tracking-wider text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                    >
                        Portfolio Overview
                    </span>
                </div>

                <p
                    class="mt-0.5 max-w-3xl text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                >
                    Financial position, portfolio performance, and collection
                    activity from reconciled transaction records.
                </p>
            </div>

            <div
                class="flex shrink-0 items-center justify-between gap-2 sm:justify-end"
            >
                <span
                    class="text-[9px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
                >
                    Business date
                </span>

                <span
                    class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] font-semibold text-zinc-700 tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                    {today}
                </span>
            </div>
        </div>
    </header>

    <!-- Scrollable dashboard content -->
    <div
        class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
    >
        <div class="grid w-full gap-2.5 p-2.5 md:p-3">
            {#if fundQuery.isPending || reportQuery.isPending}
                <div
                    aria-label="Loading dashboard"
                    class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
                >
                    {#each [0, 1, 2, 3, 4, 5, 6, 7] as item (item)}
                        <Skeleton class="h-24 rounded-lg" />
                    {/each}
                </div>
            {:else if fundQuery.isError || reportQuery.isError}
                <Alert.Root
                    class="rounded-lg border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20"
                    variant="destructive"
                >
                    <AlertCircleIcon />

                    <Alert.Title>Dashboard could not be loaded</Alert.Title>

                    <Alert.Description>
                        Refresh the page to retry the financial summary.
                    </Alert.Description>
                </Alert.Root>
            {:else if fund && report}
                <!-- Primary financial KPIs -->
                <div
                    class="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
                >
                    <!-- Available cash -->
                    <Card.Root
                        class="min-w-0 gap-0 overflow-hidden rounded-lg border-amber-200/80 bg-white py-0 shadow-sm dark:border-amber-500/20 dark:bg-[#202020]"
                    >
                        <div
                            class="h-0.5 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
                        ></div>

                        <Card.Header class="gap-1 p-3">
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <Card.Description
                                    class="text-[9px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                >
                                    Available cash
                                </Card.Description>

                                <span
                                    class="size-1.5 shrink-0 rounded-full bg-amber-500"
                                ></span>
                            </div>

                            <Card.Title
                                class="truncate font-mono text-xl font-bold tracking-tight text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(fund.availableCashMinor)}
                            </Card.Title>

                            <Card.Description
                                class="text-[10px]/4  text-zinc-500"
                            >
                                Capital ready for release
                            </Card.Description>
                        </Card.Header>
                    </Card.Root>

                    <!-- Outstanding principal -->
                    <Card.Root
                        class="min-w-0 gap-0 rounded-lg border-zinc-200 bg-white py-0 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 p-3">
                            <Card.Description
                                class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Outstanding principal
                            </Card.Description>

                            <Card.Title
                                class="truncate font-mono text-xl font-bold tracking-tight text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(fund.outstandingPrincipalMinor)}
                            </Card.Title>

                            <Card.Description
                                class="text-[10px]/4  text-zinc-500"
                            >
                                Principal currently deployed
                            </Card.Description>
                        </Card.Header>
                    </Card.Root>

                    <!-- Net earnings -->
                    <Card.Root
                        class="min-w-0 gap-0 overflow-hidden rounded-lg border-amber-200/80 bg-amber-50/40 py-0 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5"
                    >
                        <Card.Header class="gap-1 p-3">
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <Card.Description
                                    class="text-[9px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                >
                                    Net earnings
                                </Card.Description>

                                <span
                                    class="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-amber-800 uppercase dark:bg-amber-500/15 dark:text-amber-300"
                                >
                                    Net
                                </span>
                            </div>

                            <Card.Title
                                class="truncate font-mono text-xl font-bold tracking-tight text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(fund.netEarningsMinor)}
                            </Card.Title>

                            <Card.Description
                                class="text-[10px]/4  text-zinc-500"
                            >
                                Interest less expenses and write-offs
                            </Card.Description>
                        </Card.Header>
                    </Card.Root>

                    <!-- Overdue accounts -->
                    <Card.Root
                        class="min-w-0 gap-0 rounded-lg border-zinc-200 bg-white py-0 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 p-3">
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <Card.Description
                                    class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >
                                    Overdue accounts
                                </Card.Description>

                                {#if report.currentOverdueLoanCount > 0}
                                    <span
                                        class="rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-red-700 uppercase dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                                    >
                                        Attention
                                    </span>
                                {/if}
                            </div>

                            <div class="flex items-baseline gap-1.5">
                                <Card.Title
                                    class="font-mono text-xl font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                                >
                                    {report.currentOverdueLoanCount}
                                </Card.Title>

                                <span
                                    class="text-[10px] font-medium text-zinc-400"
                                >
                                    accounts
                                </span>
                            </div>

                            <Card.Description
                                class="font-mono text-[10px]/4  tabular-nums"
                            >
                                {formatCurrency(
                                    report.currentOverdueAmountMinor,
                                )}
                                due
                            </Card.Description>
                        </Card.Header>
                    </Card.Root>
                </div>

                <!-- Secondary KPIs -->
                <div
                    class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
                >
                    <div
                        class="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <p
                            class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Principal recovered
                        </p>

                        <p
                            class="mt-1 truncate font-mono text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
                        >
                            {formatCurrency(fund.principalCollectedMinor)}
                        </p>
                    </div>

                    <div
                        class="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <p
                            class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Interest earned
                        </p>

                        <p
                            class="mt-1 truncate font-mono text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
                        >
                            {formatCurrency(fund.interestCollectedMinor)}
                        </p>
                    </div>

                    <div
                        class="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <p
                            class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Expenses
                        </p>

                        <p
                            class="mt-1 truncate font-mono text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
                        >
                            {formatCurrency(fund.expensesMinor)}
                        </p>
                    </div>

                    <div
                        class="min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <p
                            class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Write-offs
                        </p>

                        <p
                            class="mt-1 truncate font-mono text-base font-bold text-zinc-900 tabular-nums dark:text-zinc-100"
                        >
                            {formatCurrency(fund.writeOffsMinor)}
                        </p>
                    </div>
                </div>

                <!-- Main analytics -->
                <div class="grid min-w-0 grid-cols-1 gap-2.5 xl:grid-cols-12">
                    <!-- Cash movement -->
                    <Card.Root
                        class="min-w-0 gap-0 overflow-hidden rounded-lg border-zinc-200 bg-white py-0 shadow-sm xl:col-span-7 dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header
                            class="flex-row items-start justify-between gap-3 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                        >
                            <div class="min-w-0">
                                <Card.Title
                                    class="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
                                >
                                    Cash movement
                                </Card.Title>

                                <Card.Description class="mt-0.5 text-[10px]/4 ">
                                    Recorded cash inflows versus cash outflows.
                                </Card.Description>
                            </div>

                            <span
                                class="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[9px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                            >
                                All time
                            </span>
                        </Card.Header>

                        <Card.Content class="p-3">
                            {#if report.periodCashInMinor || report.periodCashOutMinor}
                                <Chart
                                    config={cashMovementConfig}
                                    label="All-time cash in and cash out comparison"
                                    description={`Cash in ${formatCurrency(
                                        report.periodCashInMinor,
                                    )}; cash out ${formatCurrency(
                                        report.periodCashOutMinor,
                                    )}.`}
                                    class="aspect-auto h-44 sm:h-48"
                                />
                            {:else}
                                <div
                                    class="flex h-44 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 sm:h-48 dark:border-zinc-800 dark:bg-zinc-900/20"
                                >
                                    <p
                                        class="text-xs text-zinc-500 dark:text-zinc-400"
                                    >
                                        No cash movement recorded yet.
                                    </p>
                                </div>
                            {/if}

                            <dl
                                class="mt-2 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800"
                            >
                                <div
                                    class="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-[#202020]"
                                >
                                    <dt
                                        class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    >
                                        Cash in
                                    </dt>

                                    <dd
                                        class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                    >
                                        {formatCurrency(
                                            report.periodCashInMinor,
                                        )}
                                    </dd>
                                </div>

                                <div
                                    class="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-[#202020]"
                                >
                                    <dt
                                        class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    >
                                        Cash out
                                    </dt>

                                    <dd
                                        class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                    >
                                        {formatCurrency(
                                            report.periodCashOutMinor,
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        </Card.Content>
                    </Card.Root>

                    <!-- Today's collections -->
                    <Card.Root
                        class="min-w-0 gap-0 overflow-hidden rounded-lg border-zinc-200 bg-white py-0 shadow-sm xl:col-span-5 dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header
                            class="flex-row items-start justify-between gap-3 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                        >
                            <div class="min-w-0">
                                <Card.Title
                                    class="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
                                >
                                    Today's collections
                                </Card.Title>

                                <Card.Description class="mt-0.5 text-[10px]/4 ">
                                    Collection progress for today's scheduled
                                    installments.
                                </Card.Description>
                            </div>

                            <span
                                class="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[9px] font-semibold text-amber-800 tabular-nums dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                            >
                                {today}
                            </span>
                        </Card.Header>

                        <Card.Content class="p-3">
                            {#if collectionQuery.isPending}
                                <Skeleton
                                    class="h-44 w-full rounded-lg sm:h-48"
                                />
                            {:else if collectionQuery.isError}
                                <Alert.Root
                                    class="min-h-44 rounded-lg sm:min-h-48"
                                    variant="destructive"
                                >
                                    <AlertCircleIcon />

                                    <Alert.Title>
                                        Collections could not be loaded
                                    </Alert.Title>

                                    <Alert.Description>
                                        Retry to load today's collection totals.
                                    </Alert.Description>

                                    <Button
                                        class="h-8"
                                        onclick={() =>
                                            void collectionQuery.refetch()}
                                        size="sm"
                                        variant="outline"
                                    >
                                        Retry
                                    </Button>
                                </Alert.Root>
                            {:else if expectedMinor > 0}
                                <Chart
                                    config={collectionsConfig}
                                    label="Today's expected collection: collected and still to collect"
                                    description={`Expected ${formatCurrency(
                                        expectedMinor,
                                    )}; collected so far ${formatCurrency(
                                        collectedMinor,
                                    )}; still to collect ${formatCurrency(
                                        remainingMinor,
                                    )}.`}
                                    class="aspect-auto h-44 sm:h-48"
                                />
                            {:else}
                                <div
                                    class="flex h-44 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 sm:h-48 dark:border-zinc-800 dark:bg-zinc-900/20"
                                >
                                    <p
                                        class="text-xs text-zinc-500 dark:text-zinc-400"
                                    >
                                        No installments are due today.
                                    </p>
                                </div>
                            {/if}

                            {#if !collectionQuery.isPending && !collectionQuery.isError}
                                <dl
                                    class="mt-2 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800"
                                >
                                    <div
                                        class="min-w-0 bg-white px-3 py-2 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[9px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Expected
                                        </dt>

                                        <dd
                                            class="mt-0.5 truncate font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(expectedMinor)}
                                        </dd>
                                    </div>

                                    <div
                                        class="min-w-0 bg-white px-3 py-2 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[9px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Collected
                                        </dt>

                                        <dd
                                            class="mt-0.5 truncate font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(collectedMinor)}
                                        </dd>
                                    </div>

                                    <div
                                        class="min-w-0 bg-amber-50/70 px-3 py-2 dark:bg-amber-500/5"
                                    >
                                        <dt
                                            class="text-[9px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                        >
                                            Remaining
                                        </dt>

                                        <dd
                                            class="mt-0.5 truncate font-mono text-xs font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                                        >
                                            {formatCurrency(remainingMinor)}
                                        </dd>
                                    </div>
                                </dl>
                            {/if}
                        </Card.Content>
                    </Card.Root>
                </div>

                <!-- Portfolio reconciliation footer -->
                <footer
                    class="flex flex-col gap-1 border-t border-zinc-200 px-0.5 pt-2 text-[10px]/4 text-zinc-500 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:text-zinc-400"
                >
                    <span>
                        Portfolio status as of
                        <strong
                            class="font-mono font-semibold text-zinc-700 tabular-nums dark:text-zinc-300"
                        >
                            {report.currentAsOfDate}
                        </strong>.
                    </span>

                    <span>
                        Returned principal restores available cash and is not
                        counted as earnings.
                    </span>
                </footer>
            {/if}
        </div>
    </div>
</section>
