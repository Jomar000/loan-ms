<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import LandmarkIcon from '@lucide/svelte/icons/landmark'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import LoanStatusBadge from '$lib/modules/loan/components/LoanStatusBadge.svelte'
    import { createLoanListQuery } from '$lib/modules/loan/queries'
    import {
        formatCurrency,
        formatDate,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let {
        borrowerPublicId,
        role,
    }: {
        borrowerPublicId: string
        role: 'admin' | 'owner'
    } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let pageNumber = $state(1)
    let pageSize = $state(25)
    /////////////////
    // 05. Queries //
    /////////////////
    const loansQuery = createLoanListQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get request() {
                return {
                    filters: { borrowerPublicId },
                    limit: pageSize,
                    offset: (pageNumber - 1) * pageSize,
                    sortOrder: 'desc' as const,
                }
            },
        },
    )
    const loans = $derived(loansQuery.data?.data ?? [])
    const count = $derived(loansQuery.data?.count ?? 0)
    //////////////////
    // 09. Handlers //
    //////////////////
    function handlePageChange(page: number) {
        pageNumber = page
    }
    function handlePageSizeChange(size: number) {
        pageSize = size
        pageNumber = 1
    }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    {#if loansQuery.isPending}
        <div
            role="status"
            class="flex min-h-0 flex-1 flex-col gap-2 p-3"
        >
            <span class="sr-only">Loading borrower loans</span>
            <div
                class="grid shrink-0 grid-cols-6 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
            >
                {#each [0, 1, 2, 3, 4, 5] as column (column)}
                    <Skeleton class="h-4 w-full rounded-sm" />
                {/each}
            </div>
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
        </div>
    {:else if loansQuery.isError}
        <div class="flex min-h-0 flex-1 items-start p-3">
            <Alert.Root
                class="w-full rounded-xl border-red-200 bg-red-50/70 shadow-none dark:border-red-500/20 dark:bg-red-500/5"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Loans could not be loaded</Alert.Title>
                <Alert.Description>
                    {getErrorMessage(
                        loansQuery.error,
                        'Try refreshing the loan list.',
                    )}
                </Alert.Description>
                <Button
                    class="mt-2 h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                    onclick={() => void loansQuery.refetch()}
                    size="sm"
                    variant="outline"
                >
                    <RefreshCwIcon
                        class="size-3.5"
                        data-icon="inline-start"
                    />
                    Refresh loans
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
                        <LandmarkIcon />
                    </Empty.Media>
                    <Empty.Title>No loans yet</Empty.Title>
                    <Empty.Description>
                        This borrower can remain independent of loans, or a new
                        loan can be prepared when needed.
                    </Empty.Description>
                </Empty.Header>
                <Button
                    class="h-8 border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
                    href={`/app/${role}/loans/new?borrowerPublicId=${encodeURIComponent(borrowerPublicId)}`}
                    size="sm"
                    variant="outline"
                >
                    <LandmarkIcon
                        class="size-3.5"
                        data-icon="inline-start"
                    />
                    Create Loan
                </Button>
            </Empty.Root>
        </div>
    {:else}
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
                class="min-h-0 flex-1 overflow-auto **:data-[slot=table-container]:overflow-visible"
            >
                <Table.Root class="min-w-[860px] text-xs">
                    <Table.Caption class="sr-only">
                        Loans for this borrower
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
                                Loan
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Principal
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Payable
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Outstanding
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Status
                            </Table.Head>
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                            >
                                Release
                            </Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each loans as loan (loan.publicId)}
                            <Table.Row
                                class="group border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <Button
                                        class="h-auto justify-start p-0 text-xs font-semibold text-zinc-900 decoration-amber-500 underline-offset-4 hover:text-amber-700 dark:text-zinc-100 dark:hover:text-amber-300"
                                        href={`/app/${role}/loans/${loan.publicId}`}
                                        variant="link"
                                    >
                                        {loan.loanNumber}
                                    </Button>
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                >
                                    {formatCurrency(loan.principalMinor)}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                >
                                    {formatCurrency(loan.totalPayableMinor)}
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(
                                        loan.actualOutstandingBalanceMinor,
                                    )}
                                </Table.Cell>
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <LoanStatusBadge status={loan.status} />
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                >
                                    {formatDate(loan.releaseDate)}
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
                    disabled={loansQuery.isFetching}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    page={pageNumber}
                    {pageSize}
                />
            </div>
        </div>
    {/if}
</div>
