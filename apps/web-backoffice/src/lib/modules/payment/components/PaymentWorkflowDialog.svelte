<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Spinner } from '@loanms/ui/components/spinner'
    import { Textarea } from '@loanms/ui/components/textarea'
    import CalculatorIcon from '@lucide/svelte/icons/calculator'
    import PrinterIcon from '@lucide/svelte/icons/printer'
    import { toast } from 'svelte-sonner'

    import {
        formatCurrency,
        formatDate,
        toMinorUnits,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        createPaymentCreateMutation,
        createPaymentQuoteMutation,
    } from '../queries'
    import type {
        CollectionItem,
        Payment,
        PaymentAllocation,
        PaymentDraft,
        PaymentQuote,
    } from '../types'
    import CoveredDatesField from './CoveredDatesField.svelte'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        collection,
        loanPublicId,
        onRecorded,
        open = $bindable(false),
    }: {
        collection?: CollectionItem
        loanPublicId: string
        onRecorded?: (payment: Payment) => void | Promise<void>
        open?: boolean
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const createIdempotencyKey = createIdempotencyKeyLifecycle()
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let amount = $state('')
    let coveredDates = $state<string[] | undefined>(undefined)
    let isCreating = $state(false)
    let isQuoting = $state(false)
    let notes = $state('')
    let paymentDate = $state(manilaDate())
    let paymentMethod = $state('CASH')
    let quote = $state<PaymentQuote | null>(null)
    let receipt = $state<Payment | null>(null)
    let referenceNumber = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const isLocked = $derived(isCreating || isQuoting)

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const createMutation = createPaymentCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const quoteMutation = createPaymentQuoteMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    async function handleCreate() {
        if (isLocked || !quote) return

        const draft = getDraft()
        if (!draft) {
            toast.error(
                'Enter a valid amount, payment date, and payment method.',
            )
            return
        }

        const claim = createIdempotencyKey.claim(draft)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }

        isCreating = true
        try {
            const payment = await createMutation.mutateAsync({
                ...draft,
                idempotencyKey: claim.key,
            })
            createIdempotencyKey.confirmSuccess()
            receipt = payment
            quote = null
            toast.success('Payment recorded and receipt issued.')
            await onRecorded?.(payment)
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not record the payment.'))
        } finally {
            isCreating = false
        }
    }

    function handleDetailsChange() {
        quote = null
    }

    function handleCoveredTotal(totalMinor: number) {
        if (isLocked) return
        amount = (totalMinor / 100).toFixed(2)
        handleDetailsChange()
    }

    function handlePaymentMethodChange(event: Event) {
        paymentMethod = (event.currentTarget as HTMLSelectElement).value
        referenceNumber = ''
        handleDetailsChange()
    }

    function handleOpenChange(nextOpen: boolean) {
        if (isLocked) return
        open = nextOpen
        if (!nextOpen) reset()
    }

    function handlePrint() {
        globalThis.print()
    }

    async function handleQuote(event: SubmitEvent) {
        event.preventDefault()
        if (isLocked) return

        const draft = getDraft()
        if (!draft) {
            toast.error(
                'Enter a valid amount, payment date, and payment method.',
            )
            return
        }

        isQuoting = true
        try {
            quote = await quoteMutation.mutateAsync(draft)
        } catch (error) {
            toast.error(
                getErrorMessage(
                    error,
                    'Could not calculate the payment quote.',
                ),
            )
        } finally {
            isQuoting = false
        }
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function getDraft(): PaymentDraft | null {
        const amountReceivedMinor = toMinorUnits(amount)
        if (
            amountReceivedMinor === null ||
            amountReceivedMinor <= 0 ||
            !loanPublicId ||
            !paymentDate ||
            (coveredDates !== undefined &&
                (coveredDates.length === 0 || coveredDates.length > 1000)) ||
            (paymentMethod !== 'CASH' && !referenceNumber.trim())
        ) {
            return null
        }

        return {
            amountReceivedMinor,
            ...(coveredDates === undefined
                ? {}
                : { coveredDates: [...coveredDates].sort() }),
            loanPublicId,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
            paymentDate,
            paymentMethod,
            ...(paymentMethod !== 'CASH' && referenceNumber.trim()
                ? { referenceNumber: referenceNumber.trim() }
                : {}),
        }
    }

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

    function reset() {
        amount = ''
        coveredDates = undefined
        notes = ''
        paymentDate = manilaDate()
        paymentMethod = 'CASH'
        quote = null
        receipt = null
        referenceNumber = ''
        createIdempotencyKey.abandonAttempt()
    }
</script>

{#snippet coveredInstallments(allocations: PaymentAllocation[])}
    {#if allocations.length > 0}
        <section
            aria-label="Covered installment dates"
            class="mt-3 grid gap-2 border-t pt-3"
        >
            <h3 class="text-xs font-medium text-muted-foreground">
                Covered installment dates
            </h3>
            <ul
                class="grid max-h-40 gap-2 overflow-y-auto overscroll-contain pr-1 text-sm print:max-h-none print:overflow-visible"
            >
                {#each allocations as allocation (allocation.loanInstallmentPublicId)}
                    <li class="flex items-start justify-between gap-3">
                        <div>
                            <p>{formatDate(allocation.dueDate)}</p>
                            <p class="text-xs text-muted-foreground">
                                Installment {allocation.installmentNumber} &middot;
                                {allocation.status === 'PAID'
                                    ? 'Paid'
                                    : 'Partial'}
                            </p>
                        </div>
                        <span class="font-mono tabular-nums"
                            >{formatCurrency(
                                allocation.allocatedAmountMinor,
                            )}</span
                        >
                    </li>
                {/each}
            </ul>
        </section>
    {/if}
{/snippet}

<Dialog.Root bind:open={() => open, handleOpenChange}>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-4 sm:max-w-4xl sm:p-5 print:max-h-none print:overflow-visible"
        showCloseButton={!isLocked}
    >
        {#if receipt}
            <Dialog.Header>
                <Dialog.Title class="pr-8">Payment receipt</Dialog.Title>
                <Dialog.Description
                    >Payment {receipt.paymentNumber} posted on {formatDate(
                        receipt.paymentDate,
                    )}.</Dialog.Description
                >
            </Dialog.Header>
            <Card.Root
                class="min-h-0 gap-0 overflow-y-auto py-0 print:overflow-visible print:border-0"
            >
                <Card.Content class="grid gap-3 p-4 text-sm">
                    <dl class="grid gap-2">
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Amount received
                            </dt>
                            <dd class="font-semibold tabular-nums">
                                {formatCurrency(receipt.amountReceivedMinor)}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Allocated to installments
                            </dt>
                            <dd class="tabular-nums">
                                {formatCurrency(receipt.amountAllocatedMinor)}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Partial credit
                            </dt>
                            <dd class="tabular-nums">
                                {formatCurrency(
                                    receipt.partialPaymentCreditAfterPaymentMinor,
                                )}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4 border-t pt-2">
                            <dt class="font-medium">Outstanding balance</dt>
                            <dd class="font-semibold tabular-nums">
                                {formatCurrency(
                                    receipt.actualOutstandingBalanceAfterPaymentMinor,
                                )}
                            </dd>
                        </div>
                    </dl>
                    <p class="text-muted-foreground">
                        {receipt.paymentMethod}{receipt.referenceNumber
                            ? ` / Ref. ${receipt.referenceNumber}`
                            : ''}
                    </p>
                    {@render coveredInstallments(receipt.allocations)}
                </Card.Content>
            </Card.Root>
            <Dialog.Footer class="flex-row justify-end border-t pt-3">
                <Button
                    disabled={isLocked}
                    onclick={() => handleOpenChange(false)}
                    variant="outline">Close</Button
                >
                <Button onclick={handlePrint}
                    ><PrinterIcon data-icon="inline-start" /> Print receipt</Button
                >
            </Dialog.Footer>
        {:else}
            <Dialog.Header class="gap-2">
                <Dialog.Title class="pr-8">Record payment</Dialog.Title>
                <Dialog.Description
                    >Enter payment details, then review the allocation.</Dialog.Description
                >
                {#if collection}
                    <section
                        aria-label="Selected collection"
                        class="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2"
                    >
                        <dl>
                            <dt class="text-xs text-muted-foreground">
                                Amount due for this collection
                            </dt>
                            <dd
                                class="font-mono text-lg font-semibold text-foreground tabular-nums"
                            >
                                {formatCurrency(
                                    collection.remainingAmountMinor,
                                )}
                            </dd>
                        </dl>
                        <div class="min-w-0 text-xs text-muted-foreground">
                            <p class="font-medium text-foreground">
                                {collection.borrowerName}
                            </p>
                            <p>
                                Installment {collection.installmentNumber} &middot;
                                Due {formatDate(collection.dueDate)}
                            </p>
                        </div>
                    </section>
                {/if}
            </Dialog.Header>
            <div
                class="grid min-h-0 gap-4 overflow-y-auto overscroll-contain pr-1 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.85fr)]"
            >
                <form
                    id="record-payment-form"
                    class="grid min-w-0 content-start gap-3"
                    onsubmit={handleQuote}
                >
                    <Field.Group class="gap-3">
                        <div class="grid grid-cols-2 gap-3">
                            <Field.Field class="min-w-0 gap-1.5">
                                <Field.Label for="payment-amount"
                                    >Amount received (PHP)</Field.Label
                                >
                                <Input
                                    id="payment-amount"
                                    bind:value={amount}
                                    disabled={isLocked}
                                    inputmode="decimal"
                                    min="0.01"
                                    oninput={handleDetailsChange}
                                    placeholder="0.00"
                                    required
                                    step="0.01"
                                    type="number"
                                />
                            </Field.Field>
                            <Field.Field class="min-w-0 gap-1.5">
                                <Field.Label for="payment-method"
                                    >Payment method</Field.Label
                                >
                                <NativeSelect.Root
                                    id="payment-method"
                                    bind:value={paymentMethod}
                                    disabled={isLocked}
                                    onchange={handlePaymentMethodChange}
                                >
                                    <NativeSelect.Option value="CASH"
                                        >Cash</NativeSelect.Option
                                    >
                                    <NativeSelect.Option value="GCASH"
                                        >GCash</NativeSelect.Option
                                    >
                                    <NativeSelect.Option value="BANK"
                                        >Bank</NativeSelect.Option
                                    >
                                </NativeSelect.Root>
                            </Field.Field>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <Field.Field class="min-w-0 gap-1.5">
                                <Field.Label for="payment-date"
                                    >Payment date</Field.Label
                                >
                                <Input
                                    id="payment-date"
                                    bind:value={paymentDate}
                                    disabled={isLocked}
                                    oninput={handleDetailsChange}
                                    required
                                    type="date"
                                />
                            </Field.Field>
                            <Field.Field class="min-w-0 gap-1.5">
                                <Field.Label for="payment-reference"
                                    >Reference number</Field.Label
                                >
                                {#if paymentMethod === 'CASH'}
                                    <Input
                                        id="payment-reference"
                                        value="Generated on posting"
                                        disabled
                                    />
                                {:else}
                                    <Input
                                        id="payment-reference"
                                        bind:value={referenceNumber}
                                        disabled={isLocked}
                                        maxlength={128}
                                        oninput={handleDetailsChange}
                                        required
                                    />
                                {/if}
                            </Field.Field>
                        </div>
                        {#if collection && open}
                            <CoveredDatesField
                                borrowerPublicId={collection.borrowerPublicId}
                                {loanPublicId}
                                disabled={isLocked}
                                bind:value={coveredDates}
                                onchange={handleDetailsChange}
                                onUseTotal={handleCoveredTotal}
                            />
                        {/if}
                    </Field.Group>
                    <details class="rounded-lg border px-3 py-2">
                        <summary class="cursor-pointer text-sm font-medium"
                            >Notes (optional)</summary
                        >
                        <Field.Field class="mt-2 gap-1.5">
                            <Field.Label
                                for="payment-notes"
                                class="sr-only">Notes</Field.Label
                            >
                            <Textarea
                                id="payment-notes"
                                bind:value={notes}
                                disabled={isLocked}
                                maxlength={500}
                                oninput={handleDetailsChange}
                                rows={2}
                            />
                        </Field.Field>
                    </details>
                </form>
                <Card.Root
                    class={[
                        'min-w-0 gap-3 py-4 shadow-none md:self-start',
                        !quote && 'hidden md:flex',
                    ]}
                >
                    <Card.Header class="gap-1 px-4">
                        <Card.Title class="text-sm">Payment quote</Card.Title>
                        <Card.Description class="text-xs"
                            >{quote
                                ? 'Review the covered dates before posting.'
                                : 'Calculate to preview the payment allocation.'}</Card.Description
                        >
                    </Card.Header>
                    <Card.Content class="px-4">
                        {#if quote}
                            <dl class="grid gap-2 text-sm">
                                <div class="flex justify-between gap-4">
                                    <dt class="text-muted-foreground">
                                        Received
                                    </dt>
                                    <dd class="font-medium tabular-nums">
                                        {formatCurrency(
                                            quote.amountReceivedMinor,
                                        )}
                                    </dd>
                                </div>
                                <div class="flex justify-between gap-4">
                                    <dt class="text-muted-foreground">
                                        Allocated
                                    </dt>
                                    <dd class="tabular-nums">
                                        {formatCurrency(
                                            quote.amountAllocatedMinor,
                                        )}
                                    </dd>
                                </div>
                                <div
                                    class="grid grid-cols-2 gap-3 border-t pt-2"
                                >
                                    <div>
                                        <dt
                                            class="text-xs text-muted-foreground"
                                        >
                                            Completed installments
                                        </dt>
                                        <dd
                                            class="mt-1 font-semibold tabular-nums"
                                        >
                                            {quote.completedInstallmentsAfterPayment}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt
                                            class="text-xs text-muted-foreground"
                                        >
                                            Partial credit
                                        </dt>
                                        <dd
                                            class="mt-1 font-semibold tabular-nums"
                                        >
                                            {formatCurrency(
                                                quote.partialPaymentCreditAfterPaymentMinor,
                                            )}
                                        </dd>
                                    </div>
                                </div>
                                <div
                                    class="flex items-center justify-between gap-4 border-t pt-2"
                                >
                                    <dt class="font-medium">Outstanding</dt>
                                    <dd
                                        class="font-mono text-lg font-semibold tabular-nums"
                                    >
                                        {formatCurrency(
                                            quote.actualOutstandingBalanceAfterPaymentMinor,
                                        )}
                                    </dd>
                                </div>
                            </dl>
                            {@render coveredInstallments(quote.allocations)}
                        {:else}
                            <p class="text-xs text-muted-foreground">
                                Your amount and covered dates will appear here.
                            </p>
                        {/if}
                    </Card.Content>
                </Card.Root>
            </div>
            <Dialog.Footer class="flex-row justify-end border-t pt-3">
                <Button
                    disabled={isLocked}
                    onclick={() => handleOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                >
                {#if quote}
                    <Button
                        disabled={isLocked}
                        onclick={handleCreate}
                    >
                        {#if isCreating}<Spinner
                                data-icon="inline-start"
                            />{/if}Post payment
                    </Button>
                {:else}
                    <Button
                        form="record-payment-form"
                        type="submit"
                        disabled={isLocked}
                    >
                        {#if isQuoting}<Spinner
                                data-icon="inline-start"
                            />{:else}<CalculatorIcon
                                data-icon="inline-start"
                            />{/if}Calculate allocation
                    </Button>
                {/if}
            </Dialog.Footer>
        {/if}
    </Dialog.Content>
</Dialog.Root>
