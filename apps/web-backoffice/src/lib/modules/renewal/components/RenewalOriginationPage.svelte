<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import { Spinner } from '@loanms/ui/components/spinner'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
    import CalculatorIcon from '@lucide/svelte/icons/calculator'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'

    import { createLoanDetailQuery } from '$lib/modules/loan/queries'
    import {
        formatCurrency,
        formatDate,
        toMinorUnits,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        createRenewalCreateMutation,
        createRenewalQuoteMutation,
    } from '../queries'
    import type { RenewalQuote, RenewalQuoteInput } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        previousLoanPublicId = '',
        role,
    }: {
        previousLoanPublicId?: string
        role: 'admin' | 'owner'
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const createIdempotencyKey = createIdempotencyKeyLifecycle()
    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let confirmOpen = $state(false)
    let firstPaymentDate = $state(manilaDate())
    let isCreating = $state(false)
    let isQuoting = $state(false)
    let loanPublicId = $state('')
    let quote = $state<RenewalQuote | null>(null)
    let releaseDate = $state(manilaDate())
    let renewalPrincipal = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const isLocked = $derived(isCreating || isQuoting)
    const isFirstPaymentBeforeRelease = $derived(
        Boolean(
            firstPaymentDate && releaseDate && firstPaymentDate < releaseDate,
        ),
    )
    const resolvedLoanPublicId = $derived(loanPublicId || previousLoanPublicId)

    /////////////////
    // 05. Queries //
    /////////////////

    const loanQuery = createLoanDetailQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get publicId() {
                return resolvedLoanPublicId.trim()
            },
        },
    )
    const existingLoan = $derived(loanQuery.data)

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const createMutation = createRenewalCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const quoteMutation = createRenewalQuoteMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    //////////////////
    // 09. Handlers //
    //////////////////

    async function handleBack() {
        await goto(`/app/${role}/renewals`)
    }

    async function handleCreate() {
        if (isLocked || !quote) return

        const input = getQuoteInput()
        if (!input) return
        const claim = createIdempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }

        isCreating = true
        try {
            const renewal = await createMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            createIdempotencyKey.confirmSuccess()
            confirmOpen = false
            toast.success('Renewal posted, linked, and released.')
            if (renewal.newLoanPublicId) {
                await goto(`/app/${role}/loans/${renewal.newLoanPublicId}`)
                return
            }
            await goto(`/app/${role}/renewals`)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not confirm the renewal.'),
            )
        } finally {
            isCreating = false
        }
    }

    function handleConfirmOpenChange(open: boolean) {
        if (isLocked) return
        confirmOpen = open
    }

    function handleDetailsChange() {
        quote = null
        createIdempotencyKey.abandonAttempt()
    }

    function handleLoanPublicIdInput(event: Event) {
        loanPublicId = (event.currentTarget as HTMLInputElement).value
        handleDetailsChange()
    }

    async function handleQuote(event: SubmitEvent) {
        event.preventDefault()
        if (isLocked) return

        const input = getQuoteInput()
        if (!input) {
            toast.error(
                'Enter the loan ID, principal, release date, and first payment date.',
            )
            return
        }

        isQuoting = true
        try {
            quote = await quoteMutation.mutateAsync(input)
        } catch (error) {
            toast.error(
                getErrorMessage(
                    error,
                    'Could not calculate the renewal quote.',
                ),
            )
        } finally {
            isQuoting = false
        }
    }

    function useExistingPrincipal() {
        if (!existingLoan) return
        renewalPrincipal = (existingLoan.principalMinor / 100).toFixed(2)
        handleDetailsChange()
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function getQuoteInput(): RenewalQuoteInput | null {
        const renewalPrincipalMinor = toMinorUnits(renewalPrincipal)
        if (
            !resolvedLoanPublicId.trim() ||
            renewalPrincipalMinor === null ||
            renewalPrincipalMinor <= 0 ||
            !releaseDate ||
            !firstPaymentDate ||
            isFirstPaymentBeforeRelease
        ) {
            return null
        }

        return {
            firstPaymentDate,
            previousLoanPublicId: resolvedLoanPublicId.trim(),
            releaseDate,
            renewalPrincipalMinor,
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
</script>

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <Button
        class="w-fit"
        onclick={handleBack}
        size="sm"
        variant="ghost"
        ><ArrowLeftIcon data-icon="inline-start" /> Back to renewals</Button
    >
    <header>
        <h2 class="text-xl font-semibold text-foreground">
            Renewal calculator
        </h2>
        <p class="text-sm text-muted-foreground">
            The server calculates the settlement, partial-credit handling,
            linked loan, and cash release.
        </p>
    </header>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,0.85fr)]">
        <Card.Root>
            <Card.Header
                ><Card.Title>Renewal details</Card.Title><Card.Description
                    >Changing a value clears the previous quote.</Card.Description
                ></Card.Header
            >
            <Card.Content>
                <form
                    class="grid gap-5"
                    onsubmit={handleQuote}
                >
                    <Field.Group>
                        <Field.Field>
                            <Field.Label for="previous-loan-public-id"
                                >Existing loan ID</Field.Label
                            >
                            <Input
                                id="previous-loan-public-id"
                                value={resolvedLoanPublicId}
                                disabled={isLocked}
                                oninput={handleLoanPublicIdInput}
                                required
                            />
                            {#if loanQuery.isPending}<Field.Description
                                    >Loading existing loan…</Field.Description
                                >{:else if existingLoan}<Field.Description
                                    >{existingLoan.loanNumber} · {formatCurrency(
                                        existingLoan.principalMinor,
                                    )} original principal</Field.Description
                                >{/if}
                        </Field.Field>
                        <Field.Field>
                            <div
                                class="flex flex-wrap items-center justify-between gap-2"
                            >
                                <Field.Label for="renewal-principal"
                                    >Renewal principal (PHP)</Field.Label
                                >{#if existingLoan}<Button
                                        onclick={useExistingPrincipal}
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                        >Use existing principal</Button
                                    >{/if}
                            </div>
                            <Input
                                id="renewal-principal"
                                bind:value={renewalPrincipal}
                                disabled={isLocked}
                                inputmode="decimal"
                                min="0.01"
                                oninput={handleDetailsChange}
                                placeholder={existingLoan
                                    ? (
                                          existingLoan.principalMinor / 100
                                      ).toFixed(2)
                                    : '7,000.00'}
                                required
                                step="0.01"
                                type="number"
                            />
                        </Field.Field>
                        <div class="grid gap-4 sm:grid-cols-2">
                            <Field.Field
                                ><Field.Label for="renewal-release-date"
                                    >Release date</Field.Label
                                ><Input
                                    id="renewal-release-date"
                                    bind:value={releaseDate}
                                    disabled={isLocked}
                                    oninput={handleDetailsChange}
                                    required
                                    type="date"
                                /></Field.Field
                            >
                            <Field.Field
                                ><Field.Label for="renewal-first-payment-date"
                                    >First payment date</Field.Label
                                ><Input
                                    id="renewal-first-payment-date"
                                    bind:value={firstPaymentDate}
                                    disabled={isLocked}
                                    min={releaseDate}
                                    oninput={handleDetailsChange}
                                    required
                                    type="date"
                                />{#if isFirstPaymentBeforeRelease}<Field.Error
                                        >First payment must be on or after
                                        release.</Field.Error
                                    >{/if}</Field.Field
                            >
                        </div>
                    </Field.Group>
                    <Button
                        type="submit"
                        disabled={isLocked || isFirstPaymentBeforeRelease}
                        >{#if isQuoting}<Spinner
                                data-icon="inline-start"
                            />{/if}<CalculatorIcon data-icon="inline-start" /> Calculate
                        renewal</Button
                    >
                </form>
            </Card.Content>
        </Card.Root>

        <Card.Root>
            <Card.Header
                ><Card.Title>Renewal quote</Card.Title><Card.Description
                    >Confirming repeats this calculation against the current
                    authoritative loan state.</Card.Description
                ></Card.Header
            >
            <Card.Content>
                {#if quote}
                    <dl class="grid gap-3 text-sm">
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Completed installments
                            </dt>
                            <dd class="tabular-nums">
                                {quote.previousCompletedInstallmentCount}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Remaining scheduled installments
                            </dt>
                            <dd class="tabular-nums">
                                {quote.previousRemainingInstallmentCount}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Actual partial credit
                            </dt>
                            <dd class="tabular-nums">
                                {formatCurrency(
                                    quote.previousPartialCreditMinor,
                                )}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Renewal settlement
                            </dt>
                            <dd class="tabular-nums">
                                {formatCurrency(
                                    quote.renewalSettlementBalanceMinor,
                                )}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Partial-credit policy
                            </dt>
                            <dd>{quote.partialCreditHandling}</dd>
                        </div>
                        <div class="flex justify-between gap-4 border-t pt-3">
                            <dt class="font-medium">Cash release</dt>
                            <dd class="font-semibold tabular-nums">
                                {formatCurrency(quote.cashReleaseAmountMinor)}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                New total payable
                            </dt>
                            <dd class="tabular-nums">
                                {formatCurrency(quote.totalPayableMinor)}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                New installment
                            </dt>
                            <dd class="tabular-nums">
                                {formatCurrency(quote.dailyPaymentAmountMinor)}
                            </dd>
                        </div>
                        <div class="flex justify-between gap-4">
                            <dt class="text-muted-foreground">
                                Expected completion
                            </dt>
                            <dd>{formatDate(quote.expectedCompletionDate)}</dd>
                        </div>
                    </dl>
                    {#if quote.riskWarning}<Alert.Root
                            class="mt-4"
                            variant="default"
                            ><AlertCircleIcon /><Alert.Title
                                >Payment behavior notice</Alert.Title
                            ><Alert.Description
                                >{quote.riskWarning}</Alert.Description
                            ></Alert.Root
                        >{/if}
                {:else}
                    <p class="text-sm text-muted-foreground">
                        Calculate a server-side renewal quote before confirming.
                    </p>
                {/if}
            </Card.Content>
            {#if quote}<Card.Footer
                    ><Button
                        class="w-full"
                        disabled={isLocked}
                        onclick={() => (confirmOpen = true)}
                        >Confirm renewal</Button
                    ></Card.Footer
                >{/if}
        </Card.Root>
    </div>
</section>

<AlertDialog.Root bind:open={() => confirmOpen, handleConfirmOpenChange}>
    <AlertDialog.Content>
        <AlertDialog.Header
            ><AlertDialog.Title
                >Confirm renewal and cash release?</AlertDialog.Title
            ><AlertDialog.Description
                >{quote
                    ? `This closes ${quote.previousLoanNumber}, creates a linked renewal, and releases ${formatCurrency(quote.cashReleaseAmountMinor)}.`
                    : 'The renewal will be recalculated before posting.'}</AlertDialog.Description
            ></AlertDialog.Header
        >
        <AlertDialog.Footer
            ><AlertDialog.Cancel disabled={isLocked}>Cancel</AlertDialog.Cancel
            ><AlertDialog.Action
                disabled={isLocked}
                onclick={handleCreate}
                >{#if isCreating}<Spinner
                        data-icon="inline-start"
                    />{/if}Confirm renewal</AlertDialog.Action
            ></AlertDialog.Footer
        >
    </AlertDialog.Content>
</AlertDialog.Root>
