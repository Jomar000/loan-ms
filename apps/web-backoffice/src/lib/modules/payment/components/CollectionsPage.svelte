<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Empty from '@loanms/ui/components/empty'
    import { Input } from '@loanms/ui/components/input'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { goto } from '$app/navigation'
    import StatusBadge from '$lib/components/dataWorkspace/StatusBadge.svelte'
    import type { AppRole } from '$lib/modules/app/utilities/navigation'
    import {
        formatCurrency,
        formatDate,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { createCollectionsDateQuery } from '../queries'
    import type { CollectionItem } from '../types'
    import PaymentWorkflowDialog from './PaymentWorkflowDialog.svelte'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let { role }: { role: AppRole } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let date = $state(manilaDate())
    let paymentOpen = $state(false)
    let selectedCollection = $state<CollectionItem | null>(null)
    /////////////////
    // 04. Derived //
    /////////////////
    const canRecordPayment = $derived(
        role === 'admin' || role === 'collector' || role === 'owner',
    )
    const canViewBorrower = $derived(role === 'admin' || role === 'owner')
    /////////////////
    // 05. Queries //
    /////////////////
    const collectionQuery = createCollectionsDateQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get date() {
                return date
            },
        },
    )
    const collections = $derived(collectionQuery.data ?? [])
    const collectedMinor = $derived(
        collections.reduce((total, item) => total + item.amountPaidMinor, 0),
    )
    const expectedMinor = $derived(
        collections.reduce((total, item) => total + item.amountDueMinor, 0),
    )
    const uncollectedMinor = $derived(
        Math.max(0, expectedMinor - collectedMinor),
    )
    const collectionRate = $derived(
        expectedMinor === 0 ? 0 : (collectedMinor / expectedMinor) * 100,
    )
    //////////////////
    // 09. Handlers //
    //////////////////
    function openPayment(collection: CollectionItem) {
        selectedCollection = collection
        paymentOpen = true
    }
    async function openBorrower(publicId: string) {
        await goto(`/app/${role}/borrowers/${publicId}`)
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function manilaDate(): string {
        const parts = new Intl.DateTimeFormat('en-CA', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'Asia/Manila',
            year: 'numeric',
        }).formatToParts(new Date())
        const part = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((entry) => entry.type === type)?.value ?? ''
        return `${part('year')}-${part('month')}-${part('day')}`
    }
    function formatProgress(item: CollectionItem): string {
        return `${formatCurrency(item.amountPaidMinor)} / ${formatCurrency(item.amountDueMinor)}`
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
                    Collections
                </h1>
                <p class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    Expected and received collections for the selected Manila
                    business date.
                </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
                <span
                    class="hidden text-[10px] font-semibold tracking-wider text-zinc-400 uppercase sm:inline dark:text-zinc-500"
                    >Business date</span
                >
                <Input
                    aria-label="Collection date"
                    bind:value={date}
                    class="h-8 w-auto min-w-40 text-xs"
                    type="date"
                />
            </div>
        </header>
    </div>
    <div class="mb-3 grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card.Root
            class="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
        >
            <Card.Header class="px-3 py-2.5">
                <Card.Description
                    class="text-[10px] font-semibold tracking-wider uppercase"
                    >Expected</Card.Description
                >
                <Card.Title
                    class="font-mono text-base font-semibold tabular-nums"
                    >{formatCurrency(expectedMinor)}</Card.Title
                >
            </Card.Header>
        </Card.Root>
        <Card.Root
            class="overflow-hidden border-amber-200/70 bg-amber-50/60 shadow-sm dark:border-amber-500/15 dark:bg-amber-500/5"
        >
            <Card.Header class="px-3 py-2.5">
                <Card.Description
                    class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                    >Collected</Card.Description
                >
                <Card.Title
                    class="font-mono text-base font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                    >{formatCurrency(collectedMinor)}</Card.Title
                >
            </Card.Header>
        </Card.Root>
        <Card.Root
            class="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
        >
            <Card.Header class="px-3 py-2.5">
                <Card.Description
                    class="text-[10px] font-semibold tracking-wider uppercase"
                    >Uncollected</Card.Description
                >
                <Card.Title
                    class="font-mono text-base font-semibold tabular-nums"
                    >{formatCurrency(uncollectedMinor)}</Card.Title
                >
            </Card.Header>
        </Card.Root>
        <Card.Root
            class="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
        >
            <Card.Header class="px-3 py-2.5">
                <Card.Description
                    class="text-[10px] font-semibold tracking-wider uppercase"
                    >Collection rate</Card.Description
                >
                <Card.Title
                    class="font-mono text-base font-semibold tabular-nums"
                    >{collectionRate.toFixed(2)}%</Card.Title
                >
            </Card.Header>
        </Card.Root>
    </div>
    <div
        class="flex min-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        {#if collectionQuery.isPending}
            <div
                role="status"
                class="flex min-h-0 flex-1 flex-col gap-2 p-3"
            >
                <span class="sr-only">Loading collections</span>
                <div
                    class="grid shrink-0 grid-cols-9 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
                >
                    {#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as column (column)}
                        <Skeleton class="h-4 w-full rounded-sm" />
                    {/each}
                </div>
                <Skeleton class="h-10 w-full rounded-lg" />
                <Skeleton class="h-10 w-full rounded-lg" />
                <Skeleton class="h-10 w-full rounded-lg" />
                <Skeleton class="h-10 w-full rounded-lg" />
                <Skeleton class="h-10 w-full rounded-lg" />
            </div>
        {:else if collectionQuery.isError}
            <div class="flex min-h-0 flex-1 items-start p-3">
                <Alert.Root
                    class="w-full rounded-xl border-red-200 bg-red-50/70 shadow-none dark:border-red-500/20 dark:bg-red-500/5"
                    variant="destructive"
                >
                    <AlertCircleIcon />
                    <Alert.Title>Collections could not be loaded</Alert.Title>
                    <Alert.Description>Refresh to try again.</Alert.Description>
                    <Button
                        class="mt-2 h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                        onclick={() => void collectionQuery.refetch()}
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
        {:else if collections.length === 0}
            <div class="flex min-h-0 flex-1 p-3">
                <Empty.Root
                    class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
                >
                    <Empty.Header>
                        <Empty.Title>No scheduled collections</Empty.Title>
                        <Empty.Description
                            >No active installments are due on {formatDate(
                                date,
                            )}.</Empty.Description
                        >
                    </Empty.Header>
                </Empty.Root>
            </div>
        {:else}
            <div class="min-h-0 table-scroll flex-1">
                <Table.Root class="min-w-[1180px] text-xs">
                    <Table.Caption class="sr-only"
                        >Collections for {formatDate(date)}</Table.Caption
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
                                >Payment type</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Installment</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Due period</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Expected</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Paid</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Progress</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Status</Table.Head
                            >
                            {#if canRecordPayment || canViewBorrower}
                                <Table.Head
                                    class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    ><span class="sr-only">Actions</span
                                    ></Table.Head
                                >
                            {/if}
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each collections as collection (`${collection.loanPublicId}-${collection.installmentNumber}`)}
                            <Table.Row
                                class="border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 font-medium text-zinc-900 dark:text-zinc-100"
                                    >{collection.borrowerName}</Table.Cell
                                >
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <span
                                        class="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                        >{collection.paymentFrequency}</span
                                    >
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                    >{collection.installmentNumber}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                    >{formatDate(
                                        collection.dueDate,
                                    )}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                    >{formatCurrency(
                                        collection.amountDueMinor,
                                    )}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                    >{formatCurrency(
                                        collection.amountPaidMinor,
                                    )}</Table.Cell
                                >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                                    >{formatProgress(collection)}</Table.Cell
                                >
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <StatusBadge status={collection.status} />
                                </Table.Cell>
                                {#if canRecordPayment || canViewBorrower}
                                    <Table.Cell
                                        class="h-11 px-3 py-1.5 text-right"
                                    >
                                        <div class="flex justify-end gap-1.5">
                                            {#if canRecordPayment}
                                                <Button
                                                    class="h-7 bg-amber-500 px-2 text-[11px] font-semibold text-zinc-950 shadow-none hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                                                    onclick={() =>
                                                        openPayment(collection)}
                                                    size="sm"
                                                    >Record payment</Button
                                                >
                                            {/if}
                                            {#if canViewBorrower}
                                                <Button
                                                    class="h-7 border-zinc-200 bg-white px-2 text-[11px] shadow-none hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                                                    onclick={() =>
                                                        void openBorrower(
                                                            collection.borrowerPublicId,
                                                        )}
                                                    size="sm"
                                                    variant="outline"
                                                    >View borrower</Button
                                                >
                                            {/if}
                                        </div>
                                    </Table.Cell>
                                {/if}
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}
    </div>
</section>
{#if canRecordPayment && selectedCollection}
    <PaymentWorkflowDialog
        bind:open={paymentOpen}
        collection={selectedCollection}
        loanPublicId={selectedCollection.loanPublicId}
        onRecorded={() => void collectionQuery.refetch()}
    />
{/if}
