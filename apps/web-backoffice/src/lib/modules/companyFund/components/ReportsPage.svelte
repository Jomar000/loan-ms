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

<section
    class="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div
        class="shrink-0 overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
    >
        <div
            class="h-1 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
        ></div>
        <header
            class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <div class="min-w-0">
                <h1
                    class="text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                >
                    Reports
                </h1>
                <p class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    Period activity from transaction records, alongside a
                    current portfolio snapshot.
                </p>
            </div>
            <Button
                class="h-8 shrink-0 self-start border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 sm:self-auto dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                disabled={!report}
                onclick={handleExport}
                size="sm"
                variant="outline"
            >
                <DownloadIcon
                    class="size-3.5"
                    data-icon="inline-start"
                />
                Export period CSV
            </Button>
        </header>
    </div>
    <div
        class="flex shrink-0 flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end dark:border-zinc-800 dark:bg-[#202020]"
    >
        <label
            class="grid gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
        >
            From date
            <Input
                aria-label="Reports from date"
                bind:value={dateFrom}
                class="h-8 w-full text-xs sm:w-44"
                max={dateTo || undefined}
                type="date"
            />
        </label>
        <label
            class="grid gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
        >
            To date
            <Input
                aria-label="Reports to date"
                bind:value={dateTo}
                class="h-8 w-full text-xs sm:w-44"
                min={dateFrom || undefined}
                type="date"
            />
        </label>
        {#if dateFrom || dateTo}
            <Button
                class="h-8 px-2.5 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/10"
                onclick={handleClearDates}
                size="sm"
                variant="ghost"
            >
                Clear dates
            </Button>
        {/if}
    </div>
    {#if reportQuery.isPending}
        <div
            role="status"
            class="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
            <span class="sr-only">Loading reports</span>
            {#each [0, 1, 2, 3, 4, 5, 6, 7] as item (item)}
                <Skeleton class="h-20 rounded-xl" />
            {/each}
        </div>
    {:else if reportQuery.isError}
        <Alert.Root
            class="shrink-0 rounded-xl border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/5"
            variant="destructive"
        >
            <AlertCircleIcon />
            <Alert.Title>Reports could not be loaded</Alert.Title>
            <Alert.Description>Refresh to try again.</Alert.Description>
            <Button
                class="mt-2 h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                onclick={() => void reportQuery.refetch()}
                size="sm"
                variant="outline"
            >
                <RefreshCwIcon
                    class="size-3.5"
                    data-icon="inline-start"
                />
                Refresh
            </Button>
        </Alert.Root>
    {:else if report}
        <div class="grid shrink-0 gap-3 pb-1">
            <section
                class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <div
                    class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                    <h2
                        class="text-sm font-semibold text-zinc-950 dark:text-zinc-50"
                    >
                        Period activity
                    </h2>
                    <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Limited to the selected date range. These are the values
                        in the CSV export.
                    </p>
                </div>
                <div
                    class="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Cash in</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(report.periodCashInMinor)}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Cash out</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(report.periodCashOutMinor)}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Principal recovered</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(
                                    report.periodPrincipalCollectedMinor,
                                )}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Interest collected</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(
                                    report.periodInterestCollectedMinor,
                                )}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Renewal releases</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(
                                    report.periodRenewalReleasedMinor,
                                )}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Loan releases</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(report.periodLoanReleasedMinor)}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Expenses</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(report.periodExpensesMinor)}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Write-offs</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(report.periodWriteOffsMinor)}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-amber-200/70 bg-amber-50/60 shadow-none dark:border-amber-500/15 dark:bg-amber-500/5"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                >Net earnings</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(report.periodNetEarningsMinor)}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                </div>
            </section>
            <section
                class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <div
                    class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                    <h2
                        class="text-sm font-semibold text-zinc-950 dark:text-zinc-50"
                    >
                        Current portfolio
                    </h2>
                    <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Current balances and overdue status are not affected by
                        the selected period.
                    </p>
                </div>
                <div class="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Active principal</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(
                                    report.currentActivePrincipalMinor,
                                )}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Receivables</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(
                                    report.currentOutstandingReceivableMinor,
                                )}
                            </Card.Title>
                        </Card.Header>
                    </Card.Root>
                    <Card.Root
                        class="min-w-0 border border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <Card.Header class="gap-1 px-3 py-2.5">
                            <Card.Description
                                class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Overdue</Card.Description
                            >
                            <Card.Title
                                class="font-mono text-base font-semibold wrap-break-word text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(
                                    report.currentOverdueAmountMinor,
                                )}
                            </Card.Title>
                            <Card.Description
                                class="text-[11px] text-zinc-500 dark:text-zinc-400"
                            >
                                {report.currentOverdueLoanCount} loan(s)
                            </Card.Description>
                        </Card.Header>
                    </Card.Root>
                </div>
            </section>
        </div>
    {/if}
</section>
