<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import Trash2Icon from '@lucide/svelte/icons/trash-2'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'
    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import type { AppRole } from '$lib/modules/app/utilities/navigation'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createLoanDeleteMutation, createLoanListQuery } from '../queries'
    import type { LoanStatus, LoanTableItem } from '../types'
    import { formatCurrency, formatDate } from '../utilities/format'
    import LoanStatusBadge from './LoanStatusBadge.svelte'
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
    let pageNumber = $state(1)
    let pageSize = $state(PAGE_SIZE)
    let status = $state<'ALL' | LoanStatus>('ALL')
    let deletingLoan = $state<LoanTableItem | null>(null)
    let isDeleting = $state(false)
    /////////////////
    // 04. Derived //
    /////////////////
    const request = $derived({
        filters: {
            ...(status === 'ALL' ? {} : { status }),
        },
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
        sortOrder: 'desc' as const,
    })
    const canCreateLoan = $derived(role === 'admin' || role === 'owner')
    /////////////////
    // 05. Queries //
    /////////////////
    const listQuery = createLoanListQuery(
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
    const loans = $derived(listQuery.data?.data ?? [])
    const count = $derived(listQuery.data?.count ?? 0)
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const deleteMutation = createLoanDeleteMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    //////////////////
    // 09. Handlers //
    //////////////////
    async function handleOpenLoan(publicId: string) {
        await goto(`/app/${role}/loans/${publicId}`)
    }
    async function handleCreateLoan() {
        await goto(`/app/${role}/loans/new`)
    }
    function handlePageChange(page: number) {
        pageNumber = page
    }
    function handlePageSizeChange(nextPageSize: number) {
        pageSize = nextPageSize
        pageNumber = 1
    }
    function handleStatusChange(event: Event) {
        status = (event.currentTarget as HTMLSelectElement)
            .value as typeof status
        pageNumber = 1
    }
    function handleDeleteOpenChange(open: boolean) {
        if (!open && !isDeleting) deletingLoan = null
    }
    async function handleDelete() {
        if (!deletingLoan || isDeleting) return
        isDeleting = true
        try {
            await deleteMutation.mutateAsync(deletingLoan.publicId)
            deletingLoan = null
            if (loans.length === 1 && pageNumber > 1) pageNumber -= 1
            toast.success('Pending loan deleted.')
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not delete loan.'))
        } finally {
            isDeleting = false
        }
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
            <div class="flex min-w-0 items-center gap-2.5">
                <div
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                    <PlusIcon class="size-4" />
                </div>
                <div class="min-w-0">
                    <h1
                        class="truncate text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                    >
                        Loans
                    </h1>
                    <p class="text-xs/5 text-zinc-500 dark:text-zinc-400">
                        Server-issued loan records and their contractual
                        schedules.
                    </p>
                </div>
            </div>
            {#if canCreateLoan}
                <Button
                    class="h-8 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                    onclick={handleCreateLoan}
                    size="sm"
                >
                    <PlusIcon
                        class="size-3.5"
                        data-icon="inline-start"
                    />
                    Create loan
                </Button>
            {/if}
        </header>
        <div
            class="border-t border-zinc-100 bg-zinc-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/30"
        >
            <div class="flex flex-wrap items-center gap-2">
                <span
                    class="hidden text-[10px] font-semibold tracking-wider text-zinc-400 uppercase sm:inline dark:text-zinc-500"
                    >Status</span
                >
                <NativeSelect.Root
                    aria-label="Loan status"
                    onchange={handleStatusChange}
                    value={status}
                    class="h-8 min-w-48 text-xs"
                >
                    <NativeSelect.Option value="ALL"
                        >All statuses</NativeSelect.Option
                    >
                    <NativeSelect.Option value="PENDING_APPROVAL"
                        >Pending approval</NativeSelect.Option
                    >
                    <NativeSelect.Option value="APPROVED"
                        >Approved</NativeSelect.Option
                    >
                    <NativeSelect.Option value="ACTIVE"
                        >Active</NativeSelect.Option
                    >
                    <NativeSelect.Option value="OVERDUE"
                        >Overdue</NativeSelect.Option
                    >
                    <NativeSelect.Option value="FULLY_PAID"
                        >Fully paid</NativeSelect.Option
                    >
                    <NativeSelect.Option value="CANCELLED"
                        >Cancelled</NativeSelect.Option
                    >
                    <NativeSelect.Option value="RENEWED"
                        >Renewed</NativeSelect.Option
                    >
                </NativeSelect.Root>
            </div>
        </div>
    </div>
    <div
        class="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        {#if listQuery.isPending}
            <div
                role="status"
                class="flex min-h-0 flex-1 flex-col gap-2 p-3"
            >
                <span class="sr-only">Loading loans</span>
                <div
                    class="grid shrink-0 grid-cols-9 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
                >
                    {#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as column (column)}
                        <Skeleton class="h-4 w-full rounded-sm" />
                    {/each}
                </div>
                {#each SKELETON_ROWS as row (row)}
                    <Skeleton class="h-10 w-full rounded-lg" />
                {/each}
            </div>
        {:else if listQuery.isError}
            <div class="flex min-h-0 flex-1 items-start p-3">
                <Alert.Root
                    class="w-full rounded-xl border-red-200 bg-red-50/70 shadow-none dark:border-red-500/20 dark:bg-red-500/5"
                    variant="destructive"
                >
                    <AlertCircleIcon />
                    <Alert.Title>Loans could not be loaded</Alert.Title>
                    <Alert.Description
                        >Try refreshing the loan list.</Alert.Description
                    >
                    <Button
                        class="mt-2 h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                        onclick={() => void listQuery.refetch()}
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
                        <Empty.Media
                            class="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            variant="icon"
                        >
                            <PlusIcon />
                        </Empty.Media>
                        <Empty.Title>No loans found</Empty.Title>
                        <Empty.Description>
                            {canCreateLoan
                                ? 'Create a loan from a borrower profile or use the loan calculator.'
                                : 'No loan records are available for this organization.'}
                        </Empty.Description>
                    </Empty.Header>
                    {#if canCreateLoan}
                        <Button
                            class="h-8 border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
                            onclick={handleCreateLoan}
                            size="sm"
                            variant="outline"
                        >
                            <PlusIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            />
                            Create loan
                        </Button>
                    {/if}
                </Empty.Root>
            </div>
        {:else}
            <div class="min-h-0 table-scroll flex-1">
                <Table.Root class="min-w-[1300px] text-xs">
                    <Table.Caption class="sr-only"
                        >Loans for this organization</Table.Caption
                    >
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                    >
                        <Table.Row
                            class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                        >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Loan</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Borrower</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Principal</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Payable</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Payment</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Progress</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Outstanding</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Status</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Release</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Actions</Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each loans as loan (loan.publicId)}
                            <Table.Row
                                class="group cursor-pointer border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                                onclick={() =>
                                    void handleOpenLoan(loan.publicId)}
                            >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 font-semibold text-zinc-950 group-hover:text-amber-800 dark:text-zinc-100 dark:group-hover:text-amber-300"
                                    >{loan.loanNumber}</Table.Cell
                                >
                                <Table.Cell class="h-11 max-w-60 px-3 py-1.5">
                                    <span
                                        class="block truncate font-medium text-zinc-900 dark:text-zinc-100"
                                        title={loan.borrowerName}
                                        >{loan.borrowerName}</span
                                    >
                                    <span
                                        class="block truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400"
                                        title={loan.borrowerPublicId}
                                        >{loan.borrowerPublicId}</span
                                    >
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                    >{formatCurrency(
                                        loan.principalMinor,
                                    )}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                    >{formatCurrency(
                                        loan.totalPayableMinor,
                                    )}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400"
                                >
                                    <div class="flex flex-col leading-tight">
                                        <span
                                            class="font-medium text-zinc-800 dark:text-zinc-200"
                                            >{loan.formulaSnapshot
                                                .paymentFrequency}</span
                                        >
                                        <span
                                            class="mt-0.5 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400"
                                            >{formatCurrency(
                                                loan.installmentAmountMinor,
                                            )}</span
                                        >
                                    </div>
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                    >{loan.completedInstallmentCount}/{loan
                                        .formulaSnapshot
                                        .installmentCount}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                    >{formatCurrency(
                                        loan.actualOutstandingBalanceMinor,
                                    )}</Table.Cell
                                >
                                <Table.Cell class="h-11 px-3 py-1.5"
                                    ><LoanStatusBadge
                                        status={loan.status}
                                    /></Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                    >{formatDate(loan.releaseDate)}</Table.Cell
                                >
                                <Table.Cell class="h-11 px-3 py-1.5 text-right">
                                    {#if canCreateLoan && loan.status === 'PENDING_APPROVAL'}
                                        <Button
                                            aria-label={`Delete ${loan.loanNumber}`}
                                            class="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onclick={(event) => {
                                                event.stopPropagation()
                                                deletingLoan = loan
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            <Trash2Icon
                                                data-icon="inline-start"
                                            />
                                            Delete
                                        </Button>
                                    {/if}
                                </Table.Cell>
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
                    disabled={listQuery.isFetching}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    page={pageNumber}
                    {pageSize}
                />
            </div>
        {/if}
    </div>
</section>

<AlertDialog.Root
    bind:open={() => deletingLoan !== null, handleDeleteOpenChange}
>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>Delete pending loan?</AlertDialog.Title>
            <AlertDialog.Description>
                Delete {deletingLoan?.loanNumber} for {deletingLoan?.borrowerName}?
                This permanently removes the pending loan and cannot be undone.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isDeleting}>Cancel</AlertDialog.Cancel
            >
            <AlertDialog.Action
                class="bg-destructive text-white hover:bg-destructive/90"
                disabled={isDeleting}
                onclick={handleDelete}
            >
                {#if isDeleting}<Spinner data-icon="inline-start" />{/if}
                Delete loan
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
