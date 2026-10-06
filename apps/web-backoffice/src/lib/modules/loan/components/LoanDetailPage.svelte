<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Empty from '@loanms/ui/components/empty'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
    import BanknoteArrowDownIcon from '@lucide/svelte/icons/banknote-arrow-down'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'
    import type { AppRole } from '$lib/modules/app/utilities/navigation'
    import PaymentWorkflowDialog from '$lib/modules/payment/components/PaymentWorkflowDialog.svelte'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import {
        createLoanApproveMutation,
        createLoanDetailQuery,
        createLoanReleaseMutation,
    } from '../queries'
    import { formatCurrency, formatDate } from '../utilities/format'
    import LoanStatusBadge from './LoanStatusBadge.svelte'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let {
        publicId,
        role,
    }: {
        publicId: string
        role: AppRole
    } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const session = useSessionContext()
    ///////////////
    // 03. State //
    ///////////////
    let approveOpen = $state(false)
    let isActionLocked = $state(false)
    let paymentOpen = $state(false)
    let releaseOpen = $state(false)
    /////////////////
    // 04. Derived //
    /////////////////
    const canManageLoan = $derived(role === 'admin' || role === 'owner')
    const canRecordPayment = $derived(
        canManageLoan || role === 'cashier' || role === 'collector',
    )
    /////////////////
    // 05. Queries //
    /////////////////
    const detailQuery = createLoanDetailQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get publicId() {
                return publicId
            },
        },
    )
    const loan = $derived(detailQuery.data)
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const approveMutation = createLoanApproveMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const releaseMutation = createLoanReleaseMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    //////////////////
    // 09. Handlers //
    //////////////////
    async function handleApprove() {
        if (isActionLocked) return
        isActionLocked = true
        try {
            await approveMutation.mutateAsync(publicId)
            approveOpen = false
            toast.success('Loan approved.')
            await detailQuery.refetch()
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not approve loan.'))
        } finally {
            isActionLocked = false
        }
    }
    function handleApproveOpenChange(open: boolean) {
        if (isActionLocked) return
        approveOpen = open
    }
    async function handleRelease() {
        if (isActionLocked) return
        isActionLocked = true
        try {
            await releaseMutation.mutateAsync(publicId)
            releaseOpen = false
            toast.success('Loan released and cash-out recorded.')
            await detailQuery.refetch()
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not release loan.'))
        } finally {
            isActionLocked = false
        }
    }
    function handleReleaseOpenChange(open: boolean) {
        if (isActionLocked) return
        releaseOpen = open
    }
    function handlePaymentOpenChange(open: boolean) {
        if (isActionLocked) return
        paymentOpen = open
    }
    async function handleBack() {
        await goto(`/app/${role}/loans`)
    }
    async function handleRenew() {
        await goto(
            `/app/${role}/renewals/new?previousLoanPublicId=${encodeURIComponent(publicId)}`,
        )
    }
</script>

<section
    class="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
    <div class="mb-2 flex items-center">
        <Button
            class="h-8 gap-1.5 px-2 text-xs text-zinc-600 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
            onclick={handleBack}
            size="sm"
            variant="ghost"
        >
            <ArrowLeftIcon
                class="size-3.5"
                data-icon="inline-start"
            />
            Back to loans
        </Button>
    </div>
    {#if detailQuery.isPending}
        <div class="grid min-h-0 flex-1 gap-3">
            <Skeleton class="h-32 w-full rounded-xl" />
            <Skeleton class="min-h-96 w-full rounded-xl" />
        </div>
    {:else if detailQuery.isError || !loan}
        <div class="flex min-h-0 flex-1 items-start">
            <Alert.Root
                class="w-full rounded-xl border-red-200 bg-white shadow-sm dark:border-red-500/20 dark:bg-[#202020]"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Loan could not be loaded</Alert.Title>
                <Alert.Description>
                    The record may be unavailable or no longer accessible in
                    this organization.
                </Alert.Description>
                <Button
                    class="mt-2 h-8"
                    onclick={() => void detailQuery.refetch()}
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
    {:else}
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
                    <div class="flex flex-wrap items-center gap-2">
                        <h1
                            class="truncate font-mono text-lg font-semibold tracking-tight text-zinc-950 tabular-nums md:text-xl dark:text-zinc-50"
                        >
                            {loan.loanNumber}
                        </h1>
                        <LoanStatusBadge status={loan.status} />
                    </div>
                    <div
                        class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
                    >
                        <span
                            class="font-mono font-medium text-zinc-700 dark:text-zinc-300"
                        >
                            {loan.borrowerPublicId}
                        </span>
                        <span
                            class="hidden text-zinc-300 sm:inline dark:text-zinc-700"
                            >•</span
                        >
                        <span
                            >{loan.formulaSnapshot.paymentFrequency} payments</span
                        >
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    {#if canManageLoan && loan.status === 'PENDING_APPROVAL'}
                        <Button
                            class="h-8 bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                            disabled={isActionLocked}
                            onclick={() => (approveOpen = true)}
                            size="sm"
                        >
                            Approve loan
                        </Button>
                    {/if}
                    {#if canManageLoan && loan.status === 'APPROVED'}
                        <Button
                            class="h-8 bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                            disabled={isActionLocked}
                            onclick={() => (releaseOpen = true)}
                            size="sm"
                        >
                            <BanknoteArrowDownIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            />
                            Release cash
                        </Button>
                    {/if}
                    {#if canRecordPayment && (loan.status === 'ACTIVE' || loan.status === 'OVERDUE')}
                        <Button
                            class="h-8 border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10"
                            disabled={isActionLocked}
                            onclick={() => (paymentOpen = true)}
                            size="sm"
                            variant="outline"
                        >
                            Record payment
                        </Button>
                    {/if}
                    {#if canManageLoan && (loan.status === 'ACTIVE' || loan.status === 'OVERDUE')}
                        <Button
                            class="h-8 border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10"
                            disabled={isActionLocked}
                            onclick={handleRenew}
                            size="sm"
                            variant="outline"
                        >
                            Renew loan
                        </Button>
                    {/if}
                </div>
            </header>
        </div>
        <div class="mb-3 grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Card.Root
                class="gap-0 overflow-hidden border-zinc-200 bg-white py-0 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider uppercase"
                        >Principal</Card.Description
                    >
                    <Card.Title
                        class="font-mono text-base font-semibold tabular-nums"
                    >
                        {formatCurrency(loan.principalMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root
                class="gap-0 overflow-hidden border-zinc-200 bg-white py-0 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider uppercase"
                        >Interest</Card.Description
                    >
                    <Card.Title
                        class="font-mono text-base font-semibold tabular-nums"
                    >
                        {formatCurrency(loan.interestAmountMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root
                class="gap-0 overflow-hidden border-amber-200/70 bg-white py-0 shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                        >Total payable</Card.Description
                    >
                    <Card.Title
                        class="font-mono text-base font-bold tabular-nums"
                    >
                        {formatCurrency(loan.totalPayableMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root
                class="gap-0 overflow-hidden border-zinc-200 bg-white py-0 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider uppercase"
                        >Installment</Card.Description
                    >
                    <Card.Title
                        class="font-mono text-base font-semibold tabular-nums"
                    >
                        {formatCurrency(loan.installmentAmountMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
        </div>
        <div class="mb-3 grid shrink-0 gap-3 xl:grid-cols-12">
            <Card.Root
                class="min-w-0 gap-0 overflow-hidden border-zinc-200 bg-white py-0 shadow-sm xl:col-span-7 dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header
                    class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                    <Card.Title class="text-sm font-semibold"
                        >Contract summary</Card.Title
                    >
                    <Card.Description class="text-xs">
                        The scheduled installments below are the authoritative
                        contract snapshot.
                    </Card.Description>
                </Card.Header>
                <Card.Content class="grid gap-0 p-0 text-sm">
                    <div
                        class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                    >
                        <span class="text-xs text-zinc-500 dark:text-zinc-400"
                            >Progress</span
                        >
                        <span
                            class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                        >
                            {loan.completedInstallmentCount}/{loan
                                .formulaSnapshot.installmentCount} installments
                        </span>
                    </div>
                    <div
                        class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                    >
                        <span class="text-xs text-zinc-500 dark:text-zinc-400"
                            >Actual outstanding</span
                        >
                        <span
                            class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                        >
                            {formatCurrency(loan.actualOutstandingBalanceMinor)}
                        </span>
                    </div>
                    <div
                        class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800"
                    >
                        <span class="text-xs text-zinc-500 dark:text-zinc-400"
                            >First payment</span
                        >
                        <span
                            class="text-xs font-medium text-zinc-900 dark:text-zinc-100"
                        >
                            {formatDate(loan.firstPaymentDate)}
                        </span>
                    </div>
                    <div
                        class="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5"
                    >
                        <span class="text-xs text-zinc-500 dark:text-zinc-400"
                            >Expected completion</span
                        >
                        <span
                            class="text-xs font-medium text-zinc-900 dark:text-zinc-100"
                        >
                            {formatDate(loan.expectedCompletionDate)}
                        </span>
                    </div>
                </Card.Content>
            </Card.Root>
            <Card.Root
                class="min-w-0 gap-0 overflow-hidden border-amber-200/70 bg-white py-0 shadow-sm xl:col-span-5 dark:border-amber-500/15 dark:bg-[#202020]"
            >
                <Card.Header
                    class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                    <Card.Title class="text-sm font-semibold"
                        >Cash-out</Card.Title
                    >
                    <Card.Description class="text-xs">
                        Release is posted atomically with the cash-out entry.
                    </Card.Description>
                </Card.Header>
                <Card.Content class="p-4 text-sm">
                    {#if loan.releasedAt}
                        <div
                            class="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5"
                        >
                            <p
                                class="font-mono text-base font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                            >
                                {formatCurrency(loan.principalMinor)}
                            </p>
                            <p
                                class="mt-1 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                            >
                                Loan release · {formatDate(loan.releasedAt)}
                            </p>
                        </div>
                    {:else}
                        <div
                            class="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400"
                        >
                            No cash has been released for this loan.
                        </div>
                    {/if}
                </Card.Content>
            </Card.Root>
        </div>
        <Card.Root
            class="flex min-h-150 flex-1 flex-col gap-0 overflow-hidden border-zinc-200 bg-white py-0 shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
        >
            <Card.Header
                class="shrink-0 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
            >
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <Card.Title class="text-sm font-semibold"
                            >Installment schedule</Card.Title
                        >
                        <Card.Description class="text-xs">
                            {loan.formulaSnapshot.paymentFrequency} schedule generated
                            when the loan was created.
                        </Card.Description>
                    </div>
                    <span
                        class="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                    >
                        {loan.installments.length} installments
                    </span>
                </div>
            </Card.Header>
            <Card.Content class="min-h-0 flex-1 overflow-hidden p-0">
                {#if loan.installments.length === 0}
                    <div class="flex h-full min-h-0 flex-1 p-3">
                        <Empty.Root class="min-h-full w-full border-0 py-8">
                            <Empty.Header>
                                <Empty.Title>No schedule available</Empty.Title>
                                <Empty.Description>
                                    The loan has no generated installments to
                                    display.
                                </Empty.Description>
                            </Empty.Header>
                        </Empty.Root>
                    </div>
                {:else}
                    <div
                        class="min-h-0 min-w-0 flex-1 **:data-[slot=table-container]:h-full **:data-[slot=table-container]:overflow-auto"
                    >
                        <Table.Root class="min-w-170 text-xs">
                            <Table.Header
                                class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                            >
                                <Table.Row
                                    class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                                >
                                    <Table.Head
                                        class="h-9 w-20 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    >
                                        #
                                    </Table.Head>
                                    <Table.Head
                                        class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    >
                                        Due date
                                    </Table.Head>
                                    <Table.Head
                                        class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    >
                                        Amount due
                                    </Table.Head>
                                    <Table.Head
                                        class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                    >
                                        Status
                                    </Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {#each loan.installments as installment (installment.installmentNumber)}
                                    <Table.Row
                                        class="border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                                    >
                                        <Table.Cell
                                            class="h-10 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-700 tabular-nums dark:text-zinc-300"
                                        >
                                            {installment.installmentNumber}
                                        </Table.Cell>
                                        <Table.Cell
                                            class="h-10 px-3 py-1.5 text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                        >
                                            {formatDate(installment.dueDate)}
                                        </Table.Cell>
                                        <Table.Cell
                                            class="h-10 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                installment.amountDueMinor,
                                            )}
                                        </Table.Cell>
                                        <Table.Cell class="h-10 px-3 py-1.5">
                                            <span
                                                class="inline-flex h-6 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                            >
                                                {installment.status}
                                            </span>
                                        </Table.Cell>
                                    </Table.Row>
                                {/each}
                            </Table.Body>
                        </Table.Root>
                    </div>
                {/if}
            </Card.Content>
        </Card.Root>
    {/if}
</section>
{#if canRecordPayment && loan && (loan.status === 'ACTIVE' || loan.status === 'OVERDUE')}
    <PaymentWorkflowDialog
        bind:open={() => paymentOpen, handlePaymentOpenChange}
        loanPublicId={loan.publicId}
        onRecorded={() => void detailQuery.refetch()}
    />
{/if}
<AlertDialog.Root bind:open={() => approveOpen, handleApproveOpenChange}>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <AlertDialog.Header>
            <AlertDialog.Title>Approve this loan?</AlertDialog.Title>
            <AlertDialog.Description>
                The contract values and installment schedule are already fixed.
                Approval makes the loan eligible for cash release.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isActionLocked}
                >Cancel</AlertDialog.Cancel
            >
            <AlertDialog.Action
                class="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                disabled={isActionLocked}
                onclick={handleApprove}
            >
                {#if isActionLocked}
                    <Spinner data-icon="inline-start" />
                {/if}
                Approve loan
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
<AlertDialog.Root bind:open={() => releaseOpen, handleReleaseOpenChange}>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <AlertDialog.Header>
            <div
                class="mb-1 flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
            >
                <BanknoteArrowDownIcon class="size-4" />
            </div>
            <AlertDialog.Title>
                Release {loan ? formatCurrency(loan.principalMinor) : 'cash'}?
            </AlertDialog.Title>
            <AlertDialog.Description>
                This creates the loan release and its cash-out entry together.
                It cannot be retried with changed data while the request is
                unresolved.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isActionLocked}
                >Cancel</AlertDialog.Cancel
            >
            <AlertDialog.Action
                class="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                disabled={isActionLocked}
                onclick={handleRelease}
            >
                {#if isActionLocked}
                    <Spinner data-icon="inline-start" />
                {/if}
                Release cash
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
