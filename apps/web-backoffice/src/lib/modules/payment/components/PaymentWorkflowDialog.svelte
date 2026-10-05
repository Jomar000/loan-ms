<script lang="ts">
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
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
    import type { Payment, PaymentDraft, PaymentQuote } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        loanPublicId,
        onRecorded,
        open = $bindable(false),
    }: {
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
        createIdempotencyKey.abandonAttempt()
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
            !paymentMethod.trim()
        ) {
            return null
        }

        return {
            amountReceivedMinor,
            loanPublicId,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
            paymentDate,
            paymentMethod: paymentMethod.trim(),
            ...(referenceNumber.trim()
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
        notes = ''
        paymentDate = manilaDate()
        paymentMethod = 'CASH'
        quote = null
        receipt = null
        referenceNumber = ''
        createIdempotencyKey.abandonAttempt()
    }
</script>

<Dialog.Root bind:open={() => open, handleOpenChange}>
    <Dialog.Content class="max-h-[90vh] max-w-4xl overflow-y-auto">
        {#if receipt}
            <Dialog.Header>
                <Dialog.Title>Payment receipt</Dialog.Title>
                <Dialog.Description>
                    Payment {receipt.paymentNumber} was posted on {formatDate(
                        receipt.paymentDate,
                    )}.
                </Dialog.Description>
            </Dialog.Header>
            <Card.Root class="print:border-0">
                <Card.Content class="grid gap-3 pt-6 text-sm">
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground"
                            >Amount received</span
                        ><span class="font-semibold tabular-nums"
                            >{formatCurrency(receipt.amountReceivedMinor)}</span
                        >
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground"
                            >Allocated to installments</span
                        ><span class="tabular-nums"
                            >{formatCurrency(
                                receipt.amountAllocatedMinor,
                            )}</span
                        >
                    </div>
                    <div class="flex justify-between gap-4">
                        <span class="text-muted-foreground">Partial credit</span
                        ><span class="tabular-nums"
                            >{formatCurrency(
                                receipt.partialPaymentCreditAfterPaymentMinor,
                            )}</span
                        >
                    </div>
                    <div class="flex justify-between gap-4 border-t pt-3">
                        <span class="font-medium">Outstanding balance</span
                        ><span class="font-semibold tabular-nums"
                            >{formatCurrency(
                                receipt.actualOutstandingBalanceAfterPaymentMinor,
                            )}</span
                        >
                    </div>
                    <p class="text-muted-foreground">
                        {receipt.paymentMethod}{receipt.referenceNumber
                            ? ` · Ref. ${receipt.referenceNumber}`
                            : ''}
                    </p>
                </Card.Content>
            </Card.Root>
            <Dialog.Footer>
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
            <Dialog.Header>
                <Dialog.Title>Record payment</Dialog.Title>
                <Dialog.Description>
                    Calculate the server-side allocation before posting this
                    cash-in transaction.
                </Dialog.Description>
            </Dialog.Header>
            <div
                class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]"
            >
                <form
                    class="grid gap-5"
                    onsubmit={handleQuote}
                >
                    <Field.Group>
                        <Field.Field>
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
                                placeholder="140.00"
                                required
                                step="0.01"
                                type="number"
                            />
                        </Field.Field>
                        <div class="grid gap-4 sm:grid-cols-2">
                            <Field.Field>
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
                            <Field.Field>
                                <Field.Label for="payment-method"
                                    >Payment method</Field.Label
                                >
                                <Input
                                    id="payment-method"
                                    bind:value={paymentMethod}
                                    disabled={isLocked}
                                    maxlength={64}
                                    oninput={handleDetailsChange}
                                    required
                                />
                            </Field.Field>
                        </div>
                        <Field.Field>
                            <Field.Label for="payment-reference"
                                >Reference number</Field.Label
                            >
                            <Input
                                id="payment-reference"
                                bind:value={referenceNumber}
                                disabled={isLocked}
                                maxlength={128}
                                oninput={handleDetailsChange}
                            />
                        </Field.Field>
                        <Field.Field>
                            <Field.Label for="payment-notes">Notes</Field.Label>
                            <Textarea
                                id="payment-notes"
                                bind:value={notes}
                                disabled={isLocked}
                                maxlength={500}
                                oninput={handleDetailsChange}
                            />
                        </Field.Field>
                    </Field.Group>
                    <Button
                        type="submit"
                        disabled={isLocked}
                        >{#if isQuoting}<Spinner
                                data-icon="inline-start"
                            />{/if}<CalculatorIcon data-icon="inline-start" /> Calculate
                        allocation</Button
                    >
                </form>
                <Card.Root>
                    <Card.Header
                        ><Card.Title>Payment quote</Card.Title><Card.Description
                            >Preview only. Posting repeats the allocation
                            against the latest loan state.</Card.Description
                        ></Card.Header
                    >
                    <Card.Content>
                        {#if quote}
                            <dl class="grid gap-3 text-sm">
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
                                <div class="flex justify-between gap-4">
                                    <dt class="text-muted-foreground">
                                        Completed installments
                                    </dt>
                                    <dd class="tabular-nums">
                                        {quote.completedInstallmentsAfterPayment}
                                    </dd>
                                </div>
                                <div class="flex justify-between gap-4">
                                    <dt class="text-muted-foreground">
                                        Partial credit
                                    </dt>
                                    <dd class="tabular-nums">
                                        {formatCurrency(
                                            quote.partialPaymentCreditAfterPaymentMinor,
                                        )}
                                    </dd>
                                </div>
                                <div
                                    class="flex justify-between gap-4 border-t pt-3"
                                >
                                    <dt class="font-medium">Outstanding</dt>
                                    <dd class="font-semibold tabular-nums">
                                        {formatCurrency(
                                            quote.actualOutstandingBalanceAfterPaymentMinor,
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        {:else}
                            <p class="text-sm text-muted-foreground">
                                Enter the received amount, then calculate the
                                allocation.
                            </p>
                        {/if}
                    </Card.Content>
                    {#if quote}<Card.Footer
                            ><Button
                                class="w-full"
                                disabled={isLocked}
                                onclick={handleCreate}
                                >{#if isCreating}<Spinner
                                        data-icon="inline-start"
                                    />{/if}Post payment</Button
                            ></Card.Footer
                        >{/if}
                </Card.Root>
            </div>
            <Dialog.Footer>
                <Button
                    disabled={isLocked}
                    onclick={() => handleOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                >
            </Dialog.Footer>
        {/if}
    </Dialog.Content>
</Dialog.Root>
