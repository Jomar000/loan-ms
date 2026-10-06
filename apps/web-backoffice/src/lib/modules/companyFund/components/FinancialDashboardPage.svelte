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
                            `${context.dataset.label}: ${formatCurrency((context.parsed.x ?? 0) * 100)}`,
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
                            `${context.label}: ${formatCurrency(context.parsed * 100)}`,
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
    class="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <header
        class="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        <h2
            class="text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
        >
            {title}
        </h2>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Current portfolio, collection, and company-fund figures reconciled
            from transaction-level records.
        </p>
    </header>

    {#if fundQuery.isPending || reportQuery.isPending}
        <div
            aria-label="Loading dashboard"
            class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
            {#each [0, 1, 2, 3, 4, 5, 6, 7] as item (item)}
                <Skeleton class="h-28" />
            {/each}
        </div>
    {:else if fundQuery.isError || reportQuery.isError}
        <Alert.Root variant="destructive">
            <AlertCircleIcon />
            <Alert.Title>Dashboard could not be loaded</Alert.Title>
            <Alert.Description>
                Refresh the page to retry the financial summary.
            </Alert.Description>
        </Alert.Root>
    {:else if fund && report}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card.Root>
                <Card.Header>
                    <Card.Description>Available cash</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.availableCashMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Outstanding principal</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.outstandingPrincipalMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Principal recovered</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.principalCollectedMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Interest earned</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.interestCollectedMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Expenses</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.expensesMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Write-offs</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.writeOffsMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Net earnings</Card.Description>
                    <Card.Title class="font-mono tabular-nums">
                        {formatCurrency(fund.netEarningsMinor)}
                    </Card.Title>
                    <Card.Description>
                        Interest minus expenses and write-offs
                    </Card.Description>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Overdue accounts</Card.Description>
                    <Card.Title>{report.currentOverdueLoanCount}</Card.Title>
                    <Card.Description class="tabular-nums">
                        {formatCurrency(report.currentOverdueAmountMinor)} due
                    </Card.Description>
                </Card.Header>
            </Card.Root>
        </div>
        <div class="grid gap-3 xl:grid-cols-12">
            <Card.Root class="xl:col-span-7">
                <Card.Header>
                    <Card.Title>Cash movement</Card.Title>
                    <Card.Description>
                        All-time cash in and cash out from recorded
                        transactions.
                    </Card.Description>
                </Card.Header>
                <Card.Content>
                    {#if report.periodCashInMinor || report.periodCashOutMinor}
                        <Chart
                            config={cashMovementConfig}
                            label="All-time cash in and cash out comparison"
                            description={`Cash in ${formatCurrency(report.periodCashInMinor)}; cash out ${formatCurrency(report.periodCashOutMinor)}.`}
                            class="aspect-auto h-52"
                        />
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            No cash movement recorded yet.
                        </p>
                    {/if}
                    <dl
                        class="mt-3 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2"
                    >
                        <div
                            class="flex items-center justify-between gap-3 sm:justify-start"
                        >
                            <dt class="text-muted-foreground">Cash in</dt>
                            <dd class="font-mono font-medium tabular-nums">
                                {formatCurrency(report.periodCashInMinor)}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-3 sm:justify-start"
                        >
                            <dt class="text-muted-foreground">Cash out</dt>
                            <dd class="font-mono font-medium tabular-nums">
                                {formatCurrency(report.periodCashOutMinor)}
                            </dd>
                        </div>
                    </dl>
                </Card.Content>
            </Card.Root>
            <Card.Root class="xl:col-span-5">
                <Card.Header>
                    <Card.Title>Today's collections</Card.Title>
                    <Card.Description>
                        Installments due on {today} (Manila business date).
                    </Card.Description>
                </Card.Header>
                <Card.Content>
                    {#if collectionQuery.isPending}
                        <Skeleton class="h-52 w-full" />
                    {:else if collectionQuery.isError}
                        <Alert.Root variant="destructive">
                            <AlertCircleIcon />
                            <Alert.Title
                                >Collections could not be loaded</Alert.Title
                            >
                            <Alert.Description>
                                Retry to load today's collection totals.
                            </Alert.Description>
                            <Button
                                onclick={() => void collectionQuery.refetch()}
                                size="sm"
                                variant="outline">Retry</Button
                            >
                        </Alert.Root>
                    {:else if expectedMinor > 0}
                        <Chart
                            config={collectionsConfig}
                            label="Today's expected collection: collected and still to collect"
                            description={`Expected ${formatCurrency(expectedMinor)}; collected so far ${formatCurrency(collectedMinor)}; still to collect ${formatCurrency(remainingMinor)}.`}
                            class="aspect-auto h-52"
                        />
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            No installments are due today.
                        </p>
                    {/if}
                    {#if !collectionQuery.isPending && !collectionQuery.isError}
                        <dl class="mt-3 grid gap-3 border-t pt-3 text-sm">
                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <dt class="text-muted-foreground">
                                    Expected today
                                </dt>
                                <dd class="font-mono font-medium tabular-nums">
                                    {formatCurrency(expectedMinor)}
                                </dd>
                            </div>
                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <dt class="text-muted-foreground">
                                    Collected so far
                                </dt>
                                <dd class="font-mono font-medium tabular-nums">
                                    {formatCurrency(collectedMinor)}
                                </dd>
                            </div>
                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <dt class="text-muted-foreground">
                                    Still to collect
                                </dt>
                                <dd class="font-mono font-medium tabular-nums">
                                    {formatCurrency(remainingMinor)}
                                </dd>
                            </div>
                        </dl>
                    {/if}
                </Card.Content>
            </Card.Root>
        </div>
        <p class="text-xs text-muted-foreground">
            Portfolio status as of {report.currentAsOfDate}. Returned principal
            restores available cash and is not counted as earnings.
        </p>
    {/if}
</section>
