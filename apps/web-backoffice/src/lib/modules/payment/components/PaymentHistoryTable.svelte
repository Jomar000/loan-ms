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

<div class="grid gap-4">
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <NativeSelect.Root
            aria-label="Payment type"
            bind:value={paymentFrequency}
        >
            <NativeSelect.Option value="ALL"
                >All payment types</NativeSelect.Option
            >
            <NativeSelect.Option value="DAILY">Daily</NativeSelect.Option>
            <NativeSelect.Option value="WEEKLY">Weekly</NativeSelect.Option>
            <NativeSelect.Option value="MONTHLY">Monthly</NativeSelect.Option>
        </NativeSelect.Root>
        <NativeSelect.Root
            aria-label="Loan"
            bind:value={loanPublicId}
        >
            <NativeSelect.Option value="ALL">All loans</NativeSelect.Option>
            {#each loans as loan (loan)}<NativeSelect.Option value={loan}
                    >{loan}</NativeSelect.Option
                >{/each}
        </NativeSelect.Root>
        <NativeSelect.Root
            aria-label="Payment status"
            bind:value={status}
        >
            <NativeSelect.Option value="ALL">All statuses</NativeSelect.Option>
            <NativeSelect.Option value="POSTED">Posted</NativeSelect.Option>
            <NativeSelect.Option value="REVERSED">Reversed</NativeSelect.Option>
        </NativeSelect.Root>
        <Input
            aria-label="Payments from date"
            bind:value={dateFrom}
            type="date"
        />
        <Input
            aria-label="Payments to date"
            bind:value={dateTo}
            type="date"
        />
    </div>

    {#if listQuery.isPending}
        <div class="grid gap-3">
            <Skeleton class="h-16 w-full" /><Skeleton class="h-16 w-full" />
        </div>
    {:else if listQuery.isError}
        <Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Payment history could not be loaded</Alert.Title
            ><Alert.Description>Refresh to try again.</Alert.Description><Button
                onclick={() => void listQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else if payments.length === 0}
        <Empty.Root class="border"
            ><Empty.Header
                ><Empty.Title>No matching payments</Empty.Title
                ><Empty.Description
                    >Posted and reversed payments remain available here once a
                    collection is recorded.</Empty.Description
                ></Empty.Header
            ></Empty.Root
        >
    {:else}
        <div class="overflow-x-auto rounded-md border">
            <Table.Root>
                <Table.Header
                    ><Table.Row
                        ><Table.Head>Date</Table.Head><Table.Head
                            >Loan</Table.Head
                        ><Table.Head>Payment type</Table.Head><Table.Head
                            >Period covered</Table.Head
                        ><Table.Head>Amount paid</Table.Head><Table.Head
                            >Allocated</Table.Head
                        ><Table.Head>Partial credit</Table.Head><Table.Head
                            >Running balance</Table.Head
                        ><Table.Head>Status</Table.Head><Table.Head
                            ><span class="sr-only">Actions</span></Table.Head
                        ></Table.Row
                    ></Table.Header
                >
                <Table.Body>
                    {#each payments as payment (payment.publicId)}
                        <Table.Row>
                            <Table.Cell
                                >{formatDate(payment.paymentDate)}</Table.Cell
                            >
                            <Table.Cell
                                class="max-w-36 truncate font-mono text-xs"
                                title={payment.loanPublicId}
                                >{payment.loanPublicId}</Table.Cell
                            >
                            <Table.Cell
                                >{payment.paymentTypeSnapshot}</Table.Cell
                            >
                            <Table.Cell
                                >{formatPeriodCovered(payment)}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    payment.amountReceivedMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    payment.amountAllocatedMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    payment.partialPaymentCreditAfterPaymentMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    payment.actualOutstandingBalanceAfterPaymentMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell>{payment.status}</Table.Cell>
                            <Table.Cell>
                                {#if payment.status === 'POSTED'}<Button
                                        onclick={() => openReversal(payment)}
                                        size="sm"
                                        variant="outline">Reverse</Button
                                    >{/if}
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
