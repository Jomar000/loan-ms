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

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <Button
        class="w-fit"
        onclick={handleBack}
        size="sm"
        variant="ghost"
        ><ArrowLeftIcon data-icon="inline-start" /> Back to loans</Button
    >

    {#if detailQuery.isPending}
        <div class="grid gap-4">
            <Skeleton class="h-32 w-full" /><Skeleton class="h-96 w-full" />
        </div>
    {:else if detailQuery.isError || !loan}
        <Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Loan could not be loaded</Alert.Title
            ><Alert.Description
                >The record may be unavailable or no longer accessible in this
                organization.</Alert.Description
            ><Button
                onclick={() => void detailQuery.refetch()}
                size="sm"
                variant="outline"
                ><RefreshCwIcon data-icon="inline-start" /> Refresh</Button
            ></Alert.Root
        >
    {:else}
        <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
                <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-xl font-semibold text-foreground">
                        {loan.loanNumber}
                    </h2>
                    <LoanStatusBadge status={loan.status} />
                </div>
                <p class="text-sm text-muted-foreground">
                    {loan.borrowerPublicId} · {loan.formulaSnapshot
                        .paymentFrequency} payments
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                {#if canManageLoan && loan.status === 'PENDING_APPROVAL'}<Button
                        disabled={isActionLocked}
                        onclick={() => (approveOpen = true)}
                        >Approve loan</Button
                    >{/if}
                {#if canManageLoan && loan.status === 'APPROVED'}<Button
                        disabled={isActionLocked}
                        onclick={() => (releaseOpen = true)}
                        ><BanknoteArrowDownIcon data-icon="inline-start" /> Release
                        cash</Button
                    >{/if}
                {#if canRecordPayment && (loan.status === 'ACTIVE' || loan.status === 'OVERDUE')}<Button
                        disabled={isActionLocked}
                        onclick={() => (paymentOpen = true)}
                        >Record payment</Button
                    >{/if}
                {#if canManageLoan && (loan.status === 'ACTIVE' || loan.status === 'OVERDUE')}<Button
                        disabled={isActionLocked}
                        onclick={handleRenew}
                        variant="outline">Renew loan</Button
                    >{/if}
            </div>
        </header>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card.Root
                ><Card.Header
                    ><Card.Description>Principal</Card.Description><Card.Title
                        class="tabular-nums"
                        >{formatCurrency(loan.principalMinor)}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
            <Card.Root
                ><Card.Header
                    ><Card.Description>Interest</Card.Description><Card.Title
                        class="tabular-nums"
                        >{formatCurrency(loan.interestAmountMinor)}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
            <Card.Root
                ><Card.Header
                    ><Card.Description>Total payable</Card.Description
                    ><Card.Title class="tabular-nums"
                        >{formatCurrency(loan.totalPayableMinor)}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
            <Card.Root
                ><Card.Header
                    ><Card.Description>Installment</Card.Description><Card.Title
                        class="tabular-nums"
                        >{formatCurrency(
                            loan.installmentAmountMinor,
                        )}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
        </div>

        <div
            class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]"
        >
            <Card.Root>
                <Card.Header
                    ><Card.Title>Contract summary</Card.Title><Card.Description
                        >The scheduled installments below are the authoritative
                        contract snapshot.</Card.Description
                    ></Card.Header
                >
                <Card.Content class="grid gap-3 text-sm">
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground">Progress</span><span
                            class="tabular-nums"
                            >{loan.completedInstallmentCount}/{loan
                                .formulaSnapshot.installmentCount} installments</span
                        >
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground"
                            >Actual outstanding</span
                        ><span class="tabular-nums"
                            >{formatCurrency(
                                loan.actualOutstandingBalanceMinor,
                            )}</span
                        >
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground">First payment</span
                        ><span>{formatDate(loan.firstPaymentDate)}</span>
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground"
                            >Expected completion</span
                        ><span>{formatDate(loan.expectedCompletionDate)}</span>
                    </div>
                </Card.Content>
            </Card.Root>
            <Card.Root>
                <Card.Header
                    ><Card.Title>Cash-out</Card.Title><Card.Description
                        >Release is posted atomically with the cash-out entry.</Card.Description
                    ></Card.Header
                >
                <Card.Content class="grid gap-2 text-sm">
                    {#if loan.releasedAt}<p class="font-semibold tabular-nums">
                            {formatCurrency(loan.principalMinor)}
                        </p>
                        <p class="text-muted-foreground">
                            LOAN RELEASE · {formatDate(loan.releasedAt)}
                        </p>{:else}<p class="text-muted-foreground">
                            No cash has been released for this loan.
                        </p>{/if}
                </Card.Content>
            </Card.Root>
        </div>

        <Card.Root>
            <Card.Header
                ><Card.Title>Installment schedule</Card.Title><Card.Description
                    >{loan.formulaSnapshot.paymentFrequency} schedule generated when
                    the loan was created.</Card.Description
                ></Card.Header
            >
            <Card.Content>
                {#if loan.installments.length === 0}
                    <Empty.Root class="border"
                        ><Empty.Header
                            ><Empty.Title>No schedule available</Empty.Title
                            ><Empty.Description
                                >The loan has no generated installments to
                                display.</Empty.Description
                            ></Empty.Header
                        ></Empty.Root
                    >
                {:else}
                    <div class="overflow-x-auto rounded-md border">
                        <Table.Root
                            ><Table.Header
                                ><Table.Row
                                    ><Table.Head>#</Table.Head><Table.Head
                                        >Due date</Table.Head
                                    ><Table.Head>Amount due</Table.Head
                                    ><Table.Head>Status</Table.Head></Table.Row
                                ></Table.Header
                            ><Table.Body
                                >{#each loan.installments as installment (installment.installmentNumber)}<Table.Row
                                        ><Table.Cell
                                            >{installment.installmentNumber}</Table.Cell
                                        ><Table.Cell
                                            >{formatDate(
                                                installment.dueDate,
                                            )}</Table.Cell
                                        ><Table.Cell class="tabular-nums"
                                            >{formatCurrency(
                                                installment.amountDueMinor,
                                            )}</Table.Cell
                                        ><Table.Cell
                                            >{installment.status}</Table.Cell
                                        ></Table.Row
                                    >{/each}</Table.Body
                            ></Table.Root
                        >
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
        ><AlertDialog.Header
            ><AlertDialog.Title>Approve this loan?</AlertDialog.Title
            ><AlertDialog.Description
                >The contract values and installment schedule are already fixed.
                Approval makes the loan eligible for cash release.</AlertDialog.Description
            ></AlertDialog.Header
        ><AlertDialog.Footer
            ><AlertDialog.Cancel disabled={isActionLocked}
                >Cancel</AlertDialog.Cancel
            ><AlertDialog.Action
                disabled={isActionLocked}
                onclick={handleApprove}
                >{#if isActionLocked}<Spinner
                        data-icon="inline-start"
                    />{/if}Approve loan</AlertDialog.Action
            ></AlertDialog.Footer
        ></AlertDialog.Content
    >
</AlertDialog.Root>

<AlertDialog.Root bind:open={() => releaseOpen, handleReleaseOpenChange}>
    <AlertDialog.Content
        ><AlertDialog.Header
            ><AlertDialog.Title
                >Release {loan
                    ? formatCurrency(loan.principalMinor)
                    : 'cash'}?</AlertDialog.Title
            ><AlertDialog.Description
                >This creates the loan release and its cash-out entry together.
                It cannot be retried with changed data while the request is
                unresolved.</AlertDialog.Description
            ></AlertDialog.Header
        ><AlertDialog.Footer
            ><AlertDialog.Cancel disabled={isActionLocked}
                >Cancel</AlertDialog.Cancel
            ><AlertDialog.Action
                disabled={isActionLocked}
                onclick={handleRelease}
                >{#if isActionLocked}<Spinner
                        data-icon="inline-start"
                    />{/if}Release cash</AlertDialog.Action
            ></AlertDialog.Footer
        ></AlertDialog.Content
    >
</AlertDialog.Root>
