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
        sortOrder: 'desc' as const,
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

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-xl font-semibold text-foreground">Overdue loans</h2>
            <p class="text-sm text-muted-foreground">
                Unpaid scheduled installments, ordered by the oldest missed due
                date.
            </p>
        </div>
        <Button
            disabled={loans.length === 0}
            onclick={handleExport}
            variant="outline"
            ><DownloadIcon data-icon="inline-start" /> Export page CSV</Button
        >
    </header>

    <div class="flex flex-wrap items-end gap-3">
        <label class="grid gap-1 text-sm font-medium text-foreground">
            Minimum days late
            <Input
                aria-label="Minimum days late"
                bind:value={minDaysLate}
                max={maxDaysLate || 3650}
                min="1"
                oninput={handleDaysLateInput}
                type="number"
            />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
            Maximum days late
            <Input
                aria-label="Maximum days late"
                bind:value={maxDaysLate}
                max="3650"
                min={minDaysLate || 1}
                oninput={handleDaysLateInput}
                type="number"
            />
        </label>
        {#if hasFilters}
            <Button
                onclick={handleClearFilters}
                variant="ghost">Clear filters</Button
            >
        {/if}
    </div>

    {#if overdueQuery.isPending}<div class="grid gap-3">
            {#each SKELETON_ROWS as row (row)}<Skeleton class="h-15" />{/each}
        </div>
    {:else if overdueQuery.isError}<Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Overdue loans could not be loaded</Alert.Title
            ><Alert.Description>Refresh to try again.</Alert.Description><Button
                onclick={() => void overdueQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else if loans.length === 0}<Empty.Root class="border"
            ><Empty.Header
                ><Empty.Title>No overdue installments</Empty.Title
                ><Empty.Description
                    >All active loan schedules are current.</Empty.Description
                ></Empty.Header
            ></Empty.Root
        >
    {:else}<div class="overflow-x-auto rounded-md border">
            <Table.Root
                ><Table.Header
                    ><Table.Row
                        ><Table.Head>Borrower</Table.Head><Table.Head
                            >Loan</Table.Head
                        ><Table.Head>Oldest due</Table.Head><Table.Head
                            >Days late</Table.Head
                        ><Table.Head class="text-right"
                            >Overdue amount</Table.Head
                        ></Table.Row
                    ></Table.Header
                ><Table.Body
                    >{#each loans as loan (loan.loanPublicId)}<Table.Row
                            class="cursor-pointer"
                            onclick={() => void openLoan(loan.loanPublicId)}
                            ><Table.Cell>{loan.borrowerName}</Table.Cell
                            ><Table.Cell>{loan.loanNumber}</Table.Cell
                            ><Table.Cell>{loan.oldestDueDate}</Table.Cell
                            ><Table.Cell class="tabular-nums"
                                >{loan.daysLate}</Table.Cell
                            ><Table.Cell class="text-right tabular-nums"
                                >{formatCurrency(
                                    loan.overdueAmountMinor,
                                )}</Table.Cell
                            ></Table.Row
                        >{/each}</Table.Body
                ></Table.Root
            >
        </div>
        <PaginationFooter
            {count}
            disabled={overdueQuery.isFetching}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            {page}
            {pageSize}
        />
    {/if}
</section>
