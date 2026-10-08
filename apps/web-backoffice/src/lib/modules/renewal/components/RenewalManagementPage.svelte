<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Badge } from '@loanms/ui/components/badge'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { goto } from '$app/navigation'
    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import {
        formatCurrency,
        formatDate,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { createRenewalListQuery } from '../queries'
    import type { RenewalStatus } from '../types'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let { role }: { role: 'admin' | 'owner' } = $props()
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
    let page = $state(1)
    let pageSize = $state(PAGE_SIZE)
    let status = $state<'ALL' | RenewalStatus>('ALL')
    /////////////////
    // 04. Derived //
    /////////////////
    const request = $derived({
        filters: status === 'ALL' ? {} : { status },
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sortOrder: 'desc' as const,
    })
    /////////////////
    // 05. Queries //
    /////////////////
    const listQuery = createRenewalListQuery(
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
    const renewals = $derived(listQuery.data?.data ?? [])
    const count = $derived(listQuery.data?.count ?? 0)
    //////////////////
    // 09. Handlers //
    //////////////////
    function handlePageChange(nextPage: number) {
        page = nextPage
    }
    function handlePageSizeChange(nextPageSize: number) {
        pageSize = nextPageSize
        page = 1
    }
    function handleStatusChange(event: Event) {
        status = (event.currentTarget as HTMLSelectElement)
            .value as typeof status
        page = 1
    }
    async function openLoan(publicId: string | null) {
        if (!publicId) return
        await goto(`/app/${role}/loans/${publicId}`)
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
                    Renewals
                </h1>
                <p class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    Server-posted renewals preserve the old/new loan link,
                    settlement, partial-credit handling, and cash release.
                </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
                <span
                    class="hidden text-[10px] font-semibold tracking-wider text-zinc-400 uppercase sm:inline dark:text-zinc-500"
                >
                    Status
                </span>
                <NativeSelect.Root
                    class="h-8 w-full min-w-48 text-xs sm:w-48"
                    aria-label="Renewal status"
                    onchange={handleStatusChange}
                    value={status}
                >
                    <NativeSelect.Option value="ALL"
                        >All statuses</NativeSelect.Option
                    >
                    <NativeSelect.Option value="RELEASED"
                        >Released</NativeSelect.Option
                    >
                    <NativeSelect.Option value="PENDING_APPROVAL"
                        >Pending approval</NativeSelect.Option
                    >
                    <NativeSelect.Option value="APPROVED"
                        >Approved</NativeSelect.Option
                    >
                    <NativeSelect.Option value="CANCELLED"
                        >Cancelled</NativeSelect.Option
                    >
                </NativeSelect.Root>
            </div>
        </header>
    </div>
    <div
        class="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        {#if listQuery.isPending}
            <div
                role="status"
                class="flex min-h-0 flex-1 flex-col gap-2 p-3"
            >
                <span class="sr-only">Loading renewals</span>
                <div
                    class="grid shrink-0 grid-cols-10 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
                >
                    {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as column (column)}
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
                    <Alert.Title>Renewals could not be loaded</Alert.Title>
                    <Alert.Description>Refresh to try again.</Alert.Description>
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
        {:else if renewals.length === 0}
            <div class="flex min-h-0 flex-1 p-3">
                <Empty.Root
                    class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
                >
                    <Empty.Header>
                        <Empty.Title>No renewals posted</Empty.Title>
                        <Empty.Description>
                            Open an active or overdue loan to calculate and
                            confirm its renewal.
                        </Empty.Description>
                    </Empty.Header>
                </Empty.Root>
            </div>
        {:else}
            <div class="min-h-0 table-scroll flex-1">
                <Table.Root class="min-w-[1280px] text-xs">
                    <Table.Caption class="sr-only">
                        Renewal records
                    </Table.Caption>
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                    >
                        <Table.Row
                            class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                        >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Borrower
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Previous loan
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Completed
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Remaining
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Settlement
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                New principal
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Cash release
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Date
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Status
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                <span class="sr-only">Actions</span>
                            </Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each renewals as renewal (renewal.publicId)}
                            <Table.Row
                                class="border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell
                                    class="h-11 max-w-40 truncate px-3 py-1.5 font-mono text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
                                    title={renewal.borrowerPublicId}
                                >
                                    {renewal.borrowerPublicId}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 font-semibold text-zinc-900 dark:text-zinc-100"
                                >
                                    {renewal.previousLoanNumber}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                >
                                    {renewal.previousCompletedInstallmentCount}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                >
                                    {renewal.previousRemainingInstallmentCount}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                >
                                    {formatCurrency(
                                        renewal.renewalSettlementBalanceMinor,
                                    )}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(
                                        renewal.renewalPrincipalMinor,
                                    )}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(
                                        renewal.cashReleaseAmountMinor,
                                    )}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                >
                                    {formatDate(renewal.processedAt)}
                                </Table.Cell>
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <Badge
                                        variant="outline"
                                        class="h-6 rounded-full border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                    >
                                        {renewal.status}
                                    </Badge>
                                </Table.Cell>
                                <Table.Cell class="h-11 px-3 py-1.5 text-right">
                                    {#if renewal.newLoanPublicId}
                                        <Button
                                            class="h-7 border-zinc-200 bg-white px-2 text-[11px] shadow-none hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                                            onclick={() =>
                                                void openLoan(
                                                    renewal.newLoanPublicId,
                                                )}
                                            size="sm"
                                            variant="outline"
                                        >
                                            View new loan
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
                    {page}
                    {pageSize}
                />
            </div>
        {/if}
    </div>
</section>
