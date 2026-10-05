<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as Card from '@loanms/ui/components/card'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'

    import { formatCurrency } from '$lib/modules/loan/utilities/format'
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

    /////////////////
    // 04. Derived //
    /////////////////

    const fund = $derived(fundQuery.data ?? null)
    const report = $derived(reportQuery.data ?? null)
</script>

<section class="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4 md:p-6">
    <header>
        <h2 class="text-xl font-semibold text-foreground">{title}</h2>
        <p class="text-sm text-muted-foreground">
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
                    <Card.Title class="tabular-nums">
                        {formatCurrency(fund.availableCashMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Outstanding principal</Card.Description>
                    <Card.Title class="tabular-nums">
                        {formatCurrency(fund.outstandingPrincipalMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Principal recovered</Card.Description>
                    <Card.Title class="tabular-nums">
                        {formatCurrency(fund.principalCollectedMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Interest earned</Card.Description>
                    <Card.Title class="tabular-nums">
                        {formatCurrency(fund.interestCollectedMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Expenses</Card.Description>
                    <Card.Title class="tabular-nums">
                        {formatCurrency(fund.expensesMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Write-offs</Card.Description>
                    <Card.Title class="tabular-nums">
                        {formatCurrency(fund.writeOffsMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root>
                <Card.Header>
                    <Card.Description>Net earnings</Card.Description>
                    <Card.Title class="tabular-nums">
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
        <p class="text-xs text-muted-foreground">
            Portfolio status as of {report.currentAsOfDate}. Returned principal
            restores available cash and is not counted as earnings.
        </p>
    {/if}
</section>
