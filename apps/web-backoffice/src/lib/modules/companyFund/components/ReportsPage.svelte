<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import { Input } from '@loanms/ui/components/input'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import DownloadIcon from '@lucide/svelte/icons/download'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'

    import { formatCurrency } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { createCsvFileName, downloadCsv, toCsv } from '$lib/utilities/csv'
    import { createReportSummaryQuery } from '../queries'

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let dateFrom = $state('')
    let dateTo = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const request = $derived({
        filters: {
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
        },
    })

    /////////////////
    // 05. Queries //
    /////////////////

    const reportQuery = createReportSummaryQuery(
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
    const report = $derived(reportQuery.data ?? null)

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleClearDates() {
        dateFrom = ''
        dateTo = ''
    }

    function handleExport() {
        if (!report) return

        const csv = toCsv(
            [
                {
                    cash_in_minor: report.periodCashInMinor,
                    cash_out_minor: report.periodCashOutMinor,
                    interest_collected_minor:
                        report.periodInterestCollectedMinor,
                    expenses_minor: report.periodExpensesMinor,
                    loan_released_minor: report.periodLoanReleasedMinor,
                    net_earnings_minor: report.periodNetEarningsMinor,
                    principal_collected_minor:
                        report.periodPrincipalCollectedMinor,
                    refunded_minor: report.periodRefundedMinor,
                    renewal_released_minor: report.periodRenewalReleasedMinor,
                    write_offs_minor: report.periodWriteOffsMinor,
                },
            ],
            {
                columns: [
                    'cash_in_minor',
                    'cash_out_minor',
                    'principal_collected_minor',
                    'interest_collected_minor',
                    'loan_released_minor',
                    'renewal_released_minor',
                    'refunded_minor',
                    'expenses_minor',
                    'write_offs_minor',
                    'net_earnings_minor',
                ],
            },
        )
        downloadCsv(
            csv,
            createCsvFileName('loanms-period-report', reportDateStamp()),
        )
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function reportDateStamp() {
        if (dateFrom && dateTo) return `${dateFrom}_to_${dateTo}`
        return dateFrom || dateTo || undefined
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-xl font-semibold text-foreground">Reports</h2>
            <p class="text-sm text-muted-foreground">
                Period activity from transaction records, alongside a current
                portfolio snapshot.
            </p>
        </div>
        <Button
            disabled={!report}
            onclick={handleExport}
            variant="outline"
            ><DownloadIcon data-icon="inline-start" /> Export period CSV</Button
        >
    </header>

    <div class="flex flex-wrap items-end gap-3">
        <label class="grid gap-1 text-sm font-medium text-foreground">
            From date
            <Input
                aria-label="Reports from date"
                bind:value={dateFrom}
                max={dateTo || undefined}
                type="date"
            />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
            To date
            <Input
                aria-label="Reports to date"
                bind:value={dateTo}
                min={dateFrom || undefined}
                type="date"
            />
        </label>
        {#if dateFrom || dateTo}
            <Button
                onclick={handleClearDates}
                variant="ghost">Clear dates</Button
            >
        {/if}
    </div>

    {#if reportQuery.isPending}<div
            class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
            {#each [0, 1, 2, 3, 4, 5, 6, 7] as item (item)}<Skeleton
                    class="h-28"
                />{/each}
        </div>
    {:else if reportQuery.isError}<Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Reports could not be loaded</Alert.Title
            ><Alert.Description>Refresh to try again.</Alert.Description><Button
                onclick={() => void reportQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else if report}
        <section class="grid gap-3">
            <div>
                <h3 class="text-base font-semibold text-foreground">
                    Period activity
                </h3>
                <p class="text-sm text-muted-foreground">
                    Limited to the selected date range. These are the values in
                    the CSV export.
                </p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card.Root
                    ><Card.Header
                        ><Card.Description>Cash in</Card.Description><Card.Title
                            >{formatCurrency(
                                report.periodCashInMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Cash out</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodCashOutMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Principal recovered</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodPrincipalCollectedMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Interest collected</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodInterestCollectedMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Renewal releases</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodRenewalReleasedMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Loan releases</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodLoanReleasedMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Expenses</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodExpensesMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Write-offs</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodWriteOffsMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Net earnings</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.periodNetEarningsMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                >
            </div>
        </section>
        <section class="grid gap-3">
            <div>
                <h3 class="text-base font-semibold text-foreground">
                    Current portfolio
                </h3>
                <p class="text-sm text-muted-foreground">
                    Current balances and overdue status are not affected by the
                    selected period.
                </p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card.Root
                    ><Card.Header
                        ><Card.Description>Active principal</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.currentActivePrincipalMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Receivables</Card.Description
                        ><Card.Title
                            >{formatCurrency(
                                report.currentOutstandingReceivableMinor,
                            )}</Card.Title
                        ></Card.Header
                    ></Card.Root
                ><Card.Root
                    ><Card.Header
                        ><Card.Description>Overdue</Card.Description><Card.Title
                            >{formatCurrency(
                                report.currentOverdueAmountMinor,
                            )}</Card.Title
                        ><Card.Description
                            >{report.currentOverdueLoanCount} loan(s)</Card.Description
                        ></Card.Header
                    ></Card.Root
                >
            </div>
        </section>
    {/if}
</section>
