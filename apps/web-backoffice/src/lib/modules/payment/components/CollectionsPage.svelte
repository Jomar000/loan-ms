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

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-xl font-semibold text-foreground">Collections</h2>
            <p class="text-sm text-muted-foreground">
                Expected and received collections for the selected Manila
                business date.
            </p>
        </div>
        <Input
            aria-label="Collection date"
            bind:value={date}
            class="w-auto"
            type="date"
        />
    </header>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card.Root
            ><Card.Header
                ><Card.Description>Expected</Card.Description><Card.Title
                    class="tabular-nums"
                    >{formatCurrency(expectedMinor)}</Card.Title
                ></Card.Header
            ></Card.Root
        >
        <Card.Root
            ><Card.Header
                ><Card.Description>Collected</Card.Description><Card.Title
                    class="tabular-nums"
                    >{formatCurrency(collectedMinor)}</Card.Title
                ></Card.Header
            ></Card.Root
        >
        <Card.Root
            ><Card.Header
                ><Card.Description>Uncollected</Card.Description><Card.Title
                    class="tabular-nums"
                    >{formatCurrency(uncollectedMinor)}</Card.Title
                ></Card.Header
            ></Card.Root
        >
        <Card.Root
            ><Card.Header
                ><Card.Description>Collection rate</Card.Description><Card.Title
                    class="tabular-nums"
                    >{collectionRate.toFixed(2)}%</Card.Title
                ></Card.Header
            ></Card.Root
        >
    </div>

    {#if collectionQuery.isPending}
        <div class="grid gap-3">
            <Skeleton class="h-16 w-full" /><Skeleton class="h-16 w-full" />
        </div>
    {:else if collectionQuery.isError}
        <Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Collections could not be loaded</Alert.Title
            ><Alert.Description>Refresh to try again.</Alert.Description><Button
                onclick={() => void collectionQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else if collections.length === 0}
        <Empty.Root class="border"
            ><Empty.Header
                ><Empty.Title>No scheduled collections</Empty.Title
                ><Empty.Description
                    >No active installments are due on {formatDate(
                        date,
                    )}.</Empty.Description
                ></Empty.Header
            ></Empty.Root
        >
    {:else}
        <div class="overflow-x-auto rounded-md border">
            <Table.Root>
                <Table.Header
                    ><Table.Row
                        ><Table.Head>Borrower</Table.Head><Table.Head
                            >Payment type</Table.Head
                        ><Table.Head>Installment</Table.Head><Table.Head
                            >Due period</Table.Head
                        ><Table.Head>Expected</Table.Head><Table.Head
                            >Paid</Table.Head
                        ><Table.Head>Progress</Table.Head><Table.Head
                            >Status</Table.Head
                        >{#if canRecordPayment || canViewBorrower}<Table.Head
                                ><span class="sr-only">Actions</span
                                ></Table.Head
                            >{/if}</Table.Row
                    ></Table.Header
                >
                <Table.Body>
                    {#each collections as collection (`${collection.loanPublicId}-${collection.installmentNumber}`)}
                        <Table.Row>
                            <Table.Cell class="font-medium"
                                >{collection.borrowerName}</Table.Cell
                            >
                            <Table.Cell
                                >{collection.paymentFrequency}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{collection.installmentNumber}</Table.Cell
                            >
                            <Table.Cell
                                >{formatDate(collection.dueDate)}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    collection.amountDueMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatCurrency(
                                    collection.amountPaidMinor,
                                )}</Table.Cell
                            >
                            <Table.Cell class="tabular-nums"
                                >{formatProgress(collection)}</Table.Cell
                            >
                            <Table.Cell>{collection.status}</Table.Cell>
                            {#if canRecordPayment || canViewBorrower}<Table.Cell
                                    ><div class="flex flex-wrap gap-2">
                                        {#if canRecordPayment}<Button
                                                onclick={() =>
                                                    openPayment(collection)}
                                                size="sm">Record payment</Button
                                            >{/if}{#if canViewBorrower}<Button
                                                onclick={() =>
                                                    void openBorrower(
                                                        collection.borrowerPublicId,
                                                    )}
                                                size="sm"
                                                variant="outline"
                                                >View borrower</Button
                                            >{/if}
                                    </div></Table.Cell
                                >{/if}
                        </Table.Row>
                    {/each}
                </Table.Body>
            </Table.Root>
        </div>
    {/if}
</section>

{#if canRecordPayment && selectedCollection}
    <PaymentWorkflowDialog
        bind:open={paymentOpen}
        loanPublicId={selectedCollection.loanPublicId}
        onRecorded={() => void collectionQuery.refetch()}
    />
{/if}
