<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { goto } from '$app/navigation'

    import PaginationFooter from '$lib/components/dataWorkspace/PaginationFooter.svelte'
    import type { AppRole } from '$lib/modules/app/utilities/navigation'
    import { useSessionContext } from '$lib/states/session'
    import { createLoanListQuery } from '../queries'
    import type { LoanStatus } from '../types'
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
</script>

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-xl font-semibold text-foreground">Loans</h2>
            <p class="text-sm text-muted-foreground">
                Server-issued loan records and their contractual schedules.
            </p>
        </div>
        {#if canCreateLoan}
            <Button onclick={handleCreateLoan}
                ><PlusIcon data-icon="inline-start" /> Create loan</Button
            >
        {/if}
    </header>

    <div class="flex flex-wrap gap-3">
        <NativeSelect.Root
            aria-label="Loan status"
            onchange={handleStatusChange}
            value={status}
        >
            <NativeSelect.Option value="ALL">All statuses</NativeSelect.Option>
            <NativeSelect.Option value="PENDING_APPROVAL"
                >Pending approval</NativeSelect.Option
            >
            <NativeSelect.Option value="APPROVED">Approved</NativeSelect.Option>
            <NativeSelect.Option value="ACTIVE">Active</NativeSelect.Option>
            <NativeSelect.Option value="OVERDUE">Overdue</NativeSelect.Option>
            <NativeSelect.Option value="FULLY_PAID"
                >Fully paid</NativeSelect.Option
            >
            <NativeSelect.Option value="CANCELLED"
                >Cancelled</NativeSelect.Option
            >
            <NativeSelect.Option value="RENEWED">Renewed</NativeSelect.Option>
        </NativeSelect.Root>
    </div>

    {#if listQuery.isPending}
        <div class="grid gap-3">
            {#each SKELETON_ROWS as row (row)}<Skeleton
                    class="h-15 w-full"
                />{/each}
        </div>
    {:else if listQuery.isError}
        <Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Loans could not be loaded</Alert.Title
            ><Alert.Description>Try refreshing the loan list.</Alert.Description
            ><Button
                onclick={() => void listQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else if loans.length === 0}
        <Empty.Root class="border"
            ><Empty.Header
                ><Empty.Media variant="icon"><PlusIcon /></Empty.Media
                ><Empty.Title>No loans found</Empty.Title><Empty.Description>
                    {canCreateLoan
                        ? 'Create a loan from a borrower profile or use the loan calculator.'
                        : 'No loan records are available for this organization.'}
                </Empty.Description></Empty.Header
            ></Empty.Root
        >
    {:else}
        <div class="overflow-x-auto rounded-md border">
            <Table.Root>
                <Table.Header
                    ><Table.Row
                        ><Table.Head>Loan</Table.Head><Table.Head
                            >Borrower</Table.Head
                        ><Table.Head>Principal</Table.Head><Table.Head
                            >Payable</Table.Head
                        ><Table.Head>Payment</Table.Head><Table.Head
                            >Progress</Table.Head
                        ><Table.Head>Outstanding</Table.Head><Table.Head
                            >Status</Table.Head
                        ><Table.Head>Release</Table.Head></Table.Row
                    ></Table.Header
                >
                <Table.Body>
                    {#each loans as loan (loan.publicId)}
                        <Table.Row
                            class="cursor-pointer"
                            onclick={() => void handleOpenLoan(loan.publicId)}
                        >
                            <Table.Cell class="font-medium"
                                >{loan.loanNumber}</Table.Cell
                            >
                            <Table.Cell
                                class="max-w-48 truncate font-mono text-xs"
                                title={loan.borrowerPublicId}
                                >{loan.borrowerPublicId}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    loan.principalMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    loan.totalPayableMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell
                                >{loan.formulaSnapshot.paymentFrequency} · {formatCurrency(
                                    loan.installmentAmountMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{loan.completedInstallmentCount}/{loan
                                    .formulaSnapshot
                                    .installmentCount}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    loan.actualOutstandingBalanceMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell
                                ><LoanStatusBadge
                                    status={loan.status}
                                /></Table.Cell
                            >
                            <Table.Cell
                                >{formatDate(loan.releaseDate)}</Table.Cell
                            >
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>
        <PaginationFooter
            {count}
            disabled={listQuery.isFetching}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            page={pageNumber}
            {pageSize}
        />
    {/if}
</section>
