<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
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

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header>
        <h2 class="text-xl font-semibold text-foreground">Renewals</h2>
        <p class="text-sm text-muted-foreground">
            Server-posted renewals preserve the old/new loan link, settlement,
            partial-credit handling, and cash release.
        </p>
    </header>
    <NativeSelect.Root
        aria-label="Renewal status"
        onchange={handleStatusChange}
        value={status}
        ><NativeSelect.Option value="ALL">All statuses</NativeSelect.Option
        ><NativeSelect.Option value="RELEASED">Released</NativeSelect.Option
        ><NativeSelect.Option value="PENDING_APPROVAL"
            >Pending approval</NativeSelect.Option
        ><NativeSelect.Option value="APPROVED">Approved</NativeSelect.Option
        ><NativeSelect.Option value="CANCELLED">Cancelled</NativeSelect.Option
        ></NativeSelect.Root
    >
    {#if listQuery.isPending}
        <div class="grid gap-3">
            {#each SKELETON_ROWS as row (row)}<Skeleton
                    class="h-15 w-full"
                />{/each}
        </div>
    {:else if listQuery.isError}
        <Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Renewals could not be loaded</Alert.Title
            ><Alert.Description>Refresh to try again.</Alert.Description><Button
                onclick={() => void listQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else if renewals.length === 0}
        <Empty.Root class="border"
            ><Empty.Header
                ><Empty.Title>No renewals posted</Empty.Title><Empty.Description
                    >Open an active or overdue loan to calculate and confirm its
                    renewal.</Empty.Description
                ></Empty.Header
            ></Empty.Root
        >
    {:else}
        <div class="overflow-x-auto rounded-md border">
            <Table.Root
                ><Table.Header
                    ><Table.Row
                        ><Table.Head>Borrower</Table.Head><Table.Head
                            >Previous loan</Table.Head
                        ><Table.Head>Completed</Table.Head><Table.Head
                            >Remaining</Table.Head
                        ><Table.Head>Settlement</Table.Head><Table.Head
                            >New principal</Table.Head
                        ><Table.Head>Cash release</Table.Head><Table.Head
                            >Date</Table.Head
                        ><Table.Head>Status</Table.Head><Table.Head
                            ><span class="sr-only">Actions</span></Table.Head
                        ></Table.Row
                    ></Table.Header
                ><Table.Body
                    >{#each renewals as renewal (renewal.publicId)}<Table.Row
                            ><Table.Cell
                                class="max-w-36 truncate font-mono text-xs"
                                title={renewal.borrowerPublicId}
                                >{renewal.borrowerPublicId}</Table.Cell
                            ><Table.Cell
                                >{renewal.previousLoanNumber}</Table.Cell
                            ><Table.Cell class="tabular-nums"
                                >{renewal.previousCompletedInstallmentCount}</Table.Cell
                            ><Table.Cell class="tabular-nums"
                                >{renewal.previousRemainingInstallmentCount}</Table.Cell
                            ><Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    renewal.renewalSettlementBalanceMinor,
                                )}</Table.Cell
                            ><Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    renewal.renewalPrincipalMinor,
                                )}</Table.Cell
                            ><Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    renewal.cashReleaseAmountMinor,
                                )}</Table.Cell
                            ><Table.Cell
                                >{formatDate(renewal.processedAt)}</Table.Cell
                            ><Table.Cell>{renewal.status}</Table.Cell
                            ><Table.Cell
                                >{#if renewal.newLoanPublicId}<Button
                                        onclick={() =>
                                            void openLoan(
                                                renewal.newLoanPublicId,
                                            )}
                                        size="sm"
                                        variant="outline">View new loan</Button
                                    >{/if}</Table.Cell
                            ></Table.Row
                        >{/each}</Table.Body
                ></Table.Root
            >
        </div>
        <PaginationFooter
            {count}
            disabled={listQuery.isFetching}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            {page}
            {pageSize}
        />
    {/if}
</section>
