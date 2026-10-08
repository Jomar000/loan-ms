<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import { Input } from '@loanms/ui/components/input'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import DownloadIcon from '@lucide/svelte/icons/download'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { goto } from '$app/navigation'
    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import type { AppRole } from '$lib/modules/app/utilities/navigation'
    import { formatCurrency } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { createCsvFileName, downloadCsv, toCsv } from '$lib/utilities/csv'
    import { createOverdueLoansQuery } from '../queries'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let { role }: { role: AppRole } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const PAGE_SIZE = 25
    const SKELETON_ROWS = [
        0,
        1,
        2,
        3,
        4,
    ]
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let maxDaysLate = $state('')
    let minDaysLate = $state('')
    let page = $state(1)
    let pageSize = $state(PAGE_SIZE)
    /////////////////
    // 04. Derived //
    /////////////////
    const request = $derived({
        filters: {
            ...(parseDaysLate(minDaysLate)
                ? { minDaysLate: parseDaysLate(minDaysLate) }
                : {}),
            ...(parseDaysLate(maxDaysLate)
                ? { maxDaysLate: parseDaysLate(maxDaysLate) }
                : {}),
        },
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sortOrder: 'asc' as const,
    })
    /////////////////
    // 05. Queries //
    /////////////////
    const overdueQuery = createOverdueLoansQuery(
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
    const loans = $derived(overdueQuery.data?.data ?? [])
    const count = $derived(overdueQuery.data?.count ?? 0)
    const hasFilters = $derived(Boolean(minDaysLate || maxDaysLate))
    //////////////////
    // 09. Handlers //
    //////////////////
    async function openLoan(publicId: string) {
        await goto(`/app/${role}/loans/${publicId}`)
    }
    function handleClearFilters() {
        maxDaysLate = ''
        minDaysLate = ''
        page = 1
    }
    function handleDaysLateInput() {
        page = 1
    }
    function handlePageChange(nextPage: number) {
        page = nextPage
    }
    function handlePageSizeChange(nextPageSize: number) {
        pageSize = nextPageSize
        page = 1
    }
    function handleExport() {
        if (loans.length === 0) return
        const csv = toCsv(
            loans.map((loan) => ({
                borrower_name: loan.borrowerName,
                days_late: loan.daysLate,
                loan_number: loan.loanNumber,
                oldest_due_date: loan.oldestDueDate,
                overdue_amount_minor: loan.overdueAmountMinor,
            })),
            {
                columns: [
                    'borrower_name',
                    'loan_number',
                    'oldest_due_date',
                    'days_late',
                    'overdue_amount_minor',
                ],
            },
        )
        downloadCsv(csv, createCsvFileName(`overdue-loans-page-${page}`))
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function parseDaysLate(value: string) {
        const parsed = Number(value)
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650
            ? parsed
            : undefined
    }
</script>

<section
    class="flex min-h-0 page-scroll flex-1 flex-col bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div
        class="mb-3 overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
    >
        <div
            class="h-1 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
        ></div>
        <header
            class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
        >
            <div class="min-w-0">
                <h1
                    class="truncate text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                >
                    Overdue loans
                </h1>
                <p class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    Unpaid scheduled installments, ordered by the oldest missed
                    due date.
                </p>
            </div>
            <Button
                class="h-8 shrink-0 border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                disabled={loans.length === 0}
                onclick={handleExport}
                size="sm"
                variant="outline"
            >
                <DownloadIcon
                    class="size-3.5"
                    data-icon="inline-start"
                />
                Export page CSV
            </Button>
        </header>
    </div>
    <div
        class="mb-3 flex shrink-0 flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-end dark:border-zinc-800 dark:bg-[#202020]"
    >
        <label
            class="grid gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
        >
            Minimum days late
            <Input
                aria-label="Minimum days late"
                bind:value={minDaysLate}
                class="h-8 w-full text-xs sm:w-40"
                max={maxDaysLate || 3650}
                min="1"
                oninput={handleDaysLateInput}
                type="number"
            />
        </label>
        <label
            class="grid gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
        >
            Maximum days late
            <Input
                aria-label="Maximum days late"
                bind:value={maxDaysLate}
                class="h-8 w-full text-xs sm:w-40"
                max="3650"
                min={minDaysLate || 1}
                oninput={handleDaysLateInput}
                type="number"
            />
        </label>
        {#if hasFilters}
            <Button
                class="h-8 px-2.5 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/10"
                onclick={handleClearFilters}
                size="sm"
                variant="ghost"
            >
                Clear filters
            </Button>
        {/if}
    </div>
    <div
        class="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        {#if overdueQuery.isPending}
            <div
                role="status"
                class="flex min-h-0 flex-1 flex-col gap-2 p-3"
            >
                <span class="sr-only">Loading overdue loans</span>
                <div
                    class="grid shrink-0 grid-cols-5 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
                >
                    {#each [0, 1, 2, 3, 4] as column (column)}
                        <Skeleton class="h-4 w-full rounded-sm" />
                    {/each}
                </div>
                {#each SKELETON_ROWS as row (row)}
                    <Skeleton class="h-10 w-full rounded-lg" />
                {/each}
            </div>
        {:else if overdueQuery.isError}
            <div class="flex min-h-0 flex-1 items-start p-3">
                <Alert.Root
                    class="w-full rounded-xl border-red-200 bg-red-50/70 shadow-none dark:border-red-500/20 dark:bg-red-500/5"
                    variant="destructive"
                >
                    <AlertCircleIcon />
                    <Alert.Title>Overdue loans could not be loaded</Alert.Title>
                    <Alert.Description>Refresh to try again.</Alert.Description>
                    <Button
                        class="mt-2 h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                        onclick={() => void overdueQuery.refetch()}
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
            </div>
        {:else if loans.length === 0}
            <div class="flex min-h-0 flex-1 p-3">
                <Empty.Root
                    class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
                >
                    <Empty.Header>
                        <Empty.Title>No overdue installments</Empty.Title>
                        <Empty.Description
                            >All active loan schedules are current.</Empty.Description
                        >
                    </Empty.Header>
                </Empty.Root>
            </div>
        {:else}
            <div class="min-h-0 table-scroll flex-1">
                <Table.Root class="min-w-[760px] text-xs">
                    <Table.Caption class="sr-only"
                        >Overdue loan records</Table.Caption
                    >
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                    >
                        <Table.Row
                            class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                        >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Borrower</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Loan</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Oldest due</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Days late</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Overdue amount</Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each loans as loan (loan.loanPublicId)}
                            <Table.Row
                                class="cursor-pointer border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                                onclick={() => void openLoan(loan.loanPublicId)}
                            >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-100"
                                    >{loan.borrowerName}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 font-semibold text-zinc-900 dark:text-zinc-100"
                                    >{loan.loanNumber}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                    >{loan.oldestDueDate}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-amber-700 tabular-nums dark:text-amber-300"
                                    >{loan.daysLate}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                    >{formatCurrency(
                                        loan.overdueAmountMinor,
                                    )}</Table.Cell
                                >
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
            <div
                class="shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/35"
            >
                <PaginationFooter
                    {count}
                    disabled={overdueQuery.isFetching}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    {page}
                    {pageSize}
                />
            </div>
        {/if}
    </div>
</section>
