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
            Back to renewals
        </Button>
    </div>
    <div
        class="mb-3 overflow-hidden rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
    >
        <div
            class="h-1 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
        ></div>
        <header
            class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
        >
            <div class="flex min-w-0 items-center gap-2.5">
                <div
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                    <CalculatorIcon class="size-4.5" />
                </div>
                <div class="min-w-0">
                    <h1
                        class="truncate text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                    >
                        Renewal calculator
                    </h1>
                    <p class="text-xs/5 text-zinc-500 dark:text-zinc-400">
                        The server calculates the settlement, partial-credit
                        handling, linked loan, and cash release.
                    </p>
                </div>
            </div>
            <div
                class="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            >
                Server-calculated renewal
            </div>
        </header>
    </div>
    <div class="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
        <Card.Root
            class="flex min-h-0 flex-col overflow-hidden border-zinc-200 bg-white shadow-sm xl:col-span-7 dark:border-zinc-800 dark:bg-[#202020]"
        >
            <Card.Header
                class="shrink-0 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
            >
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <Card.Title class="text-sm font-semibold"
                            >Renewal details</Card.Title
                        >
                        <Card.Description class="text-xs">
                            Changing any value clears the previous quote.
                        </Card.Description>
                    </div>
                    <span
                        class="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                    >
                        Origination
                    </span>
                </div>
            </Card.Header>
            <Card.Content class="min-h-0 flex-1 overflow-auto p-4">
                <form
                    class="grid gap-4"
                    onsubmit={handleQuote}
                >
                    <Field.Group class="gap-4">
                        <Field.Field>
                            <Field.Label for="previous-loan-public-id">
                                Existing loan ID
                            </Field.Label>
                            <Input
                                class="h-9 font-mono"
                                id="previous-loan-public-id"
                                value={resolvedLoanPublicId}
                                disabled={isLocked}
                                oninput={handleLoanPublicIdInput}
                                required
                            />
                            {#if loanQuery.isPending}
                                <Field.Description class="text-xs">
                                    Loading existing loan…
                                </Field.Description>
                            {:else if existingLoan}
                                <Field.Description class="text-xs">
                                    {existingLoan.loanNumber} · {formatCurrency(
                                        existingLoan.principalMinor,
                                    )} original principal
                                </Field.Description>
                            {/if}
                        </Field.Field>
                        <Field.Field>
                            <div
                                class="flex flex-wrap items-center justify-between gap-2"
                            >
                                <Field.Label for="renewal-principal">
                                    Renewal principal (PHP)
                                </Field.Label>
                                {#if existingLoan}
                                    <Button
                                        class="h-7 px-2 text-[11px] text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/10"
                                        onclick={useExistingPrincipal}
                                        size="sm"
                                        type="button"
                                        variant="ghost"
                                    >
                                        Use existing principal
                                    </Button>
                                {/if}
                            </div>
                            <Input
                                class="h-9 font-mono tabular-nums"
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
                        <div class="grid gap-3 sm:grid-cols-2">
                            <Field.Field>
                                <Field.Label for="renewal-release-date">
                                    Release date
                                </Field.Label>
                                <Input
                                    class="h-9"
                                    id="renewal-release-date"
                                    bind:value={releaseDate}
                                    disabled={isLocked}
                                    oninput={handleDetailsChange}
                                    required
                                    type="date"
                                />
                            </Field.Field>
                            <Field.Field>
                                <Field.Label for="renewal-first-payment-date">
                                    First payment date
                                </Field.Label>
                                <Input
                                    class="h-9"
                                    id="renewal-first-payment-date"
                                    bind:value={firstPaymentDate}
                                    disabled={isLocked}
                                    min={releaseDate}
                                    oninput={handleDetailsChange}
                                    required
                                    type="date"
                                />
                                {#if isFirstPaymentBeforeRelease}
                                    <Field.Error>
                                        First payment must be on or after
                                        release.
                                    </Field.Error>
                                {/if}
                            </Field.Field>
                        </div>
                    </Field.Group>
                    <div
                        class="flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800"
                    >
                        <Button
                            class="h-8 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                            type="submit"
                            disabled={isLocked || isFirstPaymentBeforeRelease}
                            size="sm"
                        >
                            {#if isQuoting}
                                <Spinner data-icon="inline-start" />
                            {:else}
                                <CalculatorIcon
                                    class="size-3.5"
                                    data-icon="inline-start"
                                />
                            {/if}
                            Calculate renewal
                        </Button>
                    </div>
                </form>
            </Card.Content>
        </Card.Root>
        <Card.Root
            class="flex min-h-0 flex-col overflow-hidden border-amber-200/70 bg-white shadow-sm xl:col-span-5 dark:border-amber-500/15 dark:bg-[#202020]"
        >
            <Card.Header
                class="shrink-0 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
            >
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <Card.Title class="text-sm font-semibold"
                            >Renewal quote</Card.Title
                        >
                        <Card.Description class="text-xs">
                            Confirming repeats this calculation against the
                            current authoritative loan state.
                        </Card.Description>
                    </div>
                    <div
                        class="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                    >
                        <CalculatorIcon class="size-4" />
                    </div>
                </div>
            </Card.Header>
            <Card.Content class="min-h-0 flex-1 overflow-auto p-0">
                {#if quote}
                    <dl
                        class="divide-y divide-zinc-100 text-sm dark:divide-zinc-800"
                    >
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                Completed installments
                            </dt>
                            <dd
                                class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                            >
                                {quote.previousCompletedInstallmentCount}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                Remaining scheduled installments
                            </dt>
                            <dd
                                class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                            >
                                {quote.previousRemainingInstallmentCount}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                Actual partial credit
                            </dt>
                            <dd
                                class="font-mono text-xs font-medium text-zinc-900 tabular-nums dark:text-zinc-100"
                            >
                                {formatCurrency(
                                    quote.previousPartialCreditMinor,
                                )}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                Renewal settlement
                            </dt>
                            <dd
                                class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                            >
                                {formatCurrency(
                                    quote.renewalSettlementBalanceMinor,
                                )}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                Partial-credit policy
                            </dt>
                            <dd
                                class="text-xs font-medium text-zinc-900 dark:text-zinc-100"
                            >
                                {quote.partialCreditHandling}
                            </dd>
                        </div>
                        <div
                            class="bg-amber-50/60 px-4 py-3 dark:bg-amber-500/5"
                        >
                            <div
                                class="flex items-center justify-between gap-4"
                            >
                                <dt
                                    class="text-xs font-semibold text-amber-800 dark:text-amber-300"
                                >
                                    Cash release
                                </dt>
                                <dd
                                    class="font-mono text-sm font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                                >
                                    {formatCurrency(
                                        quote.cashReleaseAmountMinor,
                                    )}
                                </dd>
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                New total payable
                            </dt>
                            <dd
                                class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                            >
                                {formatCurrency(quote.totalPayableMinor)}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                New installment
                            </dt>
                            <dd
                                class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                            >
                                {formatCurrency(quote.dailyPaymentAmountMinor)}
                            </dd>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 px-4 py-3"
                        >
                            <dt
                                class="text-xs text-zinc-500 dark:text-zinc-400"
                            >
                                Expected completion
                            </dt>
                            <dd
                                class="text-xs font-medium text-zinc-900 dark:text-zinc-100"
                            >
                                {formatDate(quote.expectedCompletionDate)}
                            </dd>
                        </div>
                    </dl>
                    {#if quote.riskWarning}
                        <div class="p-3">
                            <Alert.Root
                                class="border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/5"
                            >
                                <AlertCircleIcon />
                                <Alert.Title
                                    >Payment behavior notice</Alert.Title
                                >
                                <Alert.Description
                                    >{quote.riskWarning}</Alert.Description
                                >
                            </Alert.Root>
                        </div>
                    {/if}
                {:else}
                    <div
                        class="flex h-full min-h-60 items-center justify-center p-6 text-center"
                    >
                        <div class="max-w-xs">
                            <div
                                class="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                                <CalculatorIcon class="size-5" />
                            </div>
                            <p
                                class="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                            >
                                No renewal quote yet
                            </p>
                            <p
                                class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400"
                            >
                                Calculate a server-side renewal quote before
                                confirming.
                            </p>
                        </div>
                    </div>
                {/if}
            </Card.Content>
            {#if quote}
                <Card.Footer
                    class="shrink-0 border-t border-zinc-100 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/35"
                >
                    <Button
                        class="h-9 w-full bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                        disabled={isLocked}
                        onclick={() => (confirmOpen = true)}
                    >
                        Confirm renewal
                    </Button>
                </Card.Footer>
            {/if}
        </Card.Root>
    </div>
</section>
<AlertDialog.Root bind:open={() => confirmOpen, handleConfirmOpenChange}>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <AlertDialog.Header>
            <AlertDialog.Title
                >Confirm renewal and cash release?</AlertDialog.Title
            >
            <AlertDialog.Description>
                {quote
                    ? `This closes ${quote.previousLoanNumber}, creates a linked renewal, and releases ${formatCurrency(quote.cashReleaseAmountMinor)}.`
                    : 'The renewal will be recalculated before posting.'}
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isLocked}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
                class="bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                disabled={isLocked}
                onclick={handleCreate}
            >
                {#if isCreating}
                    <Spinner data-icon="inline-start" />
                {/if}
                Confirm renewal
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
