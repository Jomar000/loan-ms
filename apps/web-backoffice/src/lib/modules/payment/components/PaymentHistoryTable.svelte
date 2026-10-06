<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Empty from '@loanms/ui/components/empty'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import {
        formatCurrency,
        formatDate,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { createPaymentListQuery } from '../queries'
    import type { Payment, PaymentFrequency, PaymentStatus } from '../types'
    import PaymentReversalDialog from './PaymentReversalDialog.svelte'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let { borrowerPublicId }: { borrowerPublicId: string } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const PAGE_SIZE = 100
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let dateFrom = $state('')
    let dateTo = $state('')
    let loanPublicId = $state('ALL')
    let paymentFrequency = $state<'ALL' | PaymentFrequency>('ALL')
    let reversalPayment = $state<Payment | null>(null)
    let reversalOpen = $state(false)
    let status = $state<'ALL' | PaymentStatus>('ALL')
    /////////////////
    // 04. Derived //
    /////////////////
    const request = $derived({
        filters: {
            borrowerPublicId,
            ...(loanPublicId === 'ALL' ? {} : { loanPublicId }),
            ...(status === 'ALL' ? {} : { status }),
        },
        limit: PAGE_SIZE,
        offset: 0,
        sortOrder: 'desc' as const,
    })
    const listQuery = createPaymentListQuery(
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
    const allPayments = $derived(listQuery.data?.data ?? [])
    const loans = $derived(
        Array.from(
            new Map(
                allPayments.map((payment) => [
                    payment.loanPublicId,
                    payment.loanPublicId,
                ]),
            ).values(),
        ),
    )
    const payments = $derived(
        allPayments.filter(
            (payment) =>
                (paymentFrequency === 'ALL' ||
                    payment.paymentTypeSnapshot === paymentFrequency) &&
                (!dateFrom || payment.paymentDate >= dateFrom) &&
                (!dateTo || payment.paymentDate <= dateTo),
        ),
    )
    //////////////////
    // 09. Handlers //
    //////////////////
    function openReversal(payment: Payment) {
        reversalPayment = payment
        reversalOpen = true
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function formatPeriodCovered(payment: Payment): string {
        if (payment.allocations.length === 0) return 'No installment allocation'
        const first = payment.allocations[0]
        const last = payment.allocations.at(-1) ?? first
        return first.installmentNumber === last.installmentNumber
            ? `Installment ${first.installmentNumber} · ${formatDate(first.dueDate)}`
            : `Installments ${first.installmentNumber}–${last.installmentNumber}`
    }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
        class="shrink-0 border-b border-zinc-100 bg-zinc-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/30"
    >
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <NativeSelect.Root
                aria-label="Payment type"
                bind:value={paymentFrequency}
                class="h-8 text-xs"
            >
                <NativeSelect.Option value="ALL"
                    >All payment types</NativeSelect.Option
                >
                <NativeSelect.Option value="DAILY">Daily</NativeSelect.Option>
                <NativeSelect.Option value="WEEKLY">Weekly</NativeSelect.Option>
                <NativeSelect.Option value="MONTHLY"
                    >Monthly</NativeSelect.Option
                >
            </NativeSelect.Root>
            <NativeSelect.Root
                aria-label="Loan"
                bind:value={loanPublicId}
                class="h-8 text-xs"
            >
                <NativeSelect.Option value="ALL">All loans</NativeSelect.Option>
                {#each loans as loan (loan)}
                    <NativeSelect.Option value={loan}
                        >{loan}</NativeSelect.Option
                    >
                {/each}
            </NativeSelect.Root>
            <NativeSelect.Root
                aria-label="Payment status"
                bind:value={status}
                class="h-8 text-xs"
            >
                <NativeSelect.Option value="ALL"
                    >All statuses</NativeSelect.Option
                >
                <NativeSelect.Option value="POSTED">Posted</NativeSelect.Option>
                <NativeSelect.Option value="REVERSED"
                    >Reversed</NativeSelect.Option
                >
            </NativeSelect.Root>
            <Input
                class="h-8 text-xs"
                aria-label="Payments from date"
                bind:value={dateFrom}
                type="date"
            />
            <Input
                class="h-8 text-xs"
                aria-label="Payments to date"
                bind:value={dateTo}
                type="date"
            />
        </div>
    </div>
    {#if listQuery.isPending}
        <div
            role="status"
            class="flex min-h-0 flex-1 flex-col gap-2 p-3"
        >
            <span class="sr-only">Loading payment history</span>
            <div
                class="grid shrink-0 grid-cols-10 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
            >
                {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as column (column)}
                    <Skeleton class="h-4 w-full rounded-sm" />
                {/each}
            </div>
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
            <Skeleton class="h-10 w-full rounded-lg" />
        </div>
    {:else if listQuery.isError}
        <div class="flex min-h-0 flex-1 items-start p-3">
            <Alert.Root
                class="w-full rounded-xl border-red-200 bg-red-50/70 shadow-none dark:border-red-500/20 dark:bg-red-500/5"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Payment history could not be loaded</Alert.Title>
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
    {:else if payments.length === 0}
        <div class="flex min-h-0 flex-1 p-3">
            <Empty.Root
                class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
            >
                <Empty.Header>
                    <Empty.Media
                        class="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                        variant="icon"
                    >
                        <RefreshCwIcon />
                    </Empty.Media>
                    <Empty.Title>No matching payments</Empty.Title>
                    <Empty.Description>
                        Posted and reversed payments remain available here once
                        a collection is recorded.
                    </Empty.Description>
                </Empty.Header>
            </Empty.Root>
        </div>
    {:else}
        <div
            class="min-h-0 flex-1 overflow-auto **:data-[slot=table-container]:overflow-visible"
        >
            <Table.Root class="min-w-[1180px] text-xs">
                <Table.Caption class="sr-only"
                    >Payment history for this borrower</Table.Caption
                >
                <Table.Header
                    class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                >
                    <Table.Row
                        class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                    >
                        <Table.Head
                            class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Date
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Loan
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Payment type
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Period covered
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Amount paid
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Allocated
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Partial credit
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Running balance
                        </Table.Head>
                        <Table.Head
                            class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            Status
                        </Table.Head>
                        <Table.Head
                            class="h-9 w-24 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                        >
                            <span class="sr-only">Actions</span>
                        </Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each payments as payment (payment.publicId)}
                        <Table.Row
                            class="group border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                        >
                            <Table.Cell
                                class="h-11 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-700 dark:text-zinc-300"
                            >
                                {formatDate(payment.paymentDate)}
                            </Table.Cell>
                            <Table.Cell
                                class="h-11 max-w-40 truncate px-3 py-1.5 font-mono text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
                                title={payment.loanPublicId}
                            >
                                {payment.loanPublicId}
                            </Table.Cell>
                            <Table.Cell class="h-11 px-3 py-1.5">
                                <span
                                    class="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                >
                                    {payment.paymentTypeSnapshot}
                                </span>
                            </Table.Cell>
                            <Table.Cell
                                class="h-11 min-w-48 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400"
                            >
                                {formatPeriodCovered(payment)}
                            </Table.Cell>
                            <Table.Cell
                                class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                            >
                                {formatCurrency(payment.amountReceivedMinor)}
                            </Table.Cell>
                            <Table.Cell
                                class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                            >
                                {formatCurrency(payment.amountAllocatedMinor)}
                            </Table.Cell>
                            <Table.Cell
                                class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                            >
                                {formatCurrency(
                                    payment.partialPaymentCreditAfterPaymentMinor,
                                )}
                            </Table.Cell>
                            <Table.Cell
                                class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                            >
                                {formatCurrency(
                                    payment.actualOutstandingBalanceAfterPaymentMinor,
                                )}
                            </Table.Cell>
                            <Table.Cell class="h-11 px-3 py-1.5">
                                <span
                                    class="inline-flex h-6 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold tracking-wide text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                                >
                                    {payment.status}
                                </span>
                            </Table.Cell>
                            <Table.Cell class="h-11 px-3 py-1.5 text-right">
                                {#if payment.status === 'POSTED'}
                                    <Button
                                        class="h-7 border-zinc-200 bg-white px-2 text-[11px] shadow-none hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                                        onclick={() => openReversal(payment)}
                                        size="sm"
                                        variant="outline"
                                    >
                                        Reverse
                                    </Button>
                                {/if}
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>
    {/if}
</div>
{#if reversalPayment}
    <PaymentReversalDialog
        bind:open={reversalOpen}
        onReversed={() => void listQuery.refetch()}
        paymentNumber={reversalPayment.paymentNumber}
        paymentPublicId={reversalPayment.publicId}
    />
{/if}
