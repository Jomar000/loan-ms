<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left'
    import CalculatorIcon from '@lucide/svelte/icons/calculator'
    import { toast } from 'svelte-sonner'
    import { goto } from '$app/navigation'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        createLoanCreateMutation,
        createLoanProductsQuery,
        createLoanQuoteMutation,
    } from '../queries'
    import type { LoanQuote, LoanQuoteInput } from '../types'
    import {
        formatCurrency,
        formatDate,
        toMinorUnits,
    } from '../utilities/format'
    import { getFirstPaymentDate } from '../utilities/schedule'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let {
        borrowerPublicId = '',
        role,
    }: {
        borrowerPublicId?: string
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
    let isCreating = $state(false)
    let isQuoting = $state(false)
    let loanProductPublicId = $state('')
    let principalAmount = $state('')
    let quote = $state<LoanQuote | null>(null)
    let releaseDate = $state(today())
    /////////////////
    // 04. Derived //
    /////////////////
    const firstPaymentDate = $derived.by(() =>
        getFirstPaymentDate(
            releaseDate,
            productsQuery.data?.find(
                (product) => product.publicId === loanProductPublicId,
            )?.paymentFrequency,
        ),
    )
    const isLocked = $derived(isCreating || isQuoting)
    /////////////////
    // 05. Queries //
    /////////////////
    const productsQuery = createLoanProductsQuery({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const activeProducts = $derived(
        (productsQuery.data ?? []).filter((product) => product.isActive),
    )
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const createMutation = createLoanCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const quoteMutation = createLoanQuoteMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    //////////////////
    // 09. Handlers //
    //////////////////
    async function handleCreate() {
        if (isLocked || !quote) return
        const payload = getQuoteInput()
        if (!payload) {
            toast.error('Complete the loan details before creating a loan.')
            return
        }
        const claim = createIdempotencyKey.claim(payload)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isCreating = true
        try {
            const loan = await createMutation.mutateAsync({
                ...payload,
                idempotencyKey: claim.key,
            })
            createIdempotencyKey.confirmSuccess()
            toast.success('Loan created and submitted for approval.')
            await goto(`/app/${role}/loans/${loan.publicId}`)
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not create loan.'))
        } finally {
            isCreating = false
        }
    }
    async function handleQuote(event: SubmitEvent) {
        event.preventDefault()
        if (isLocked) return
        const payload = getQuoteInput()
        if (!payload) {
            toast.error(
                'Enter a borrower, loan product, principal, and release date.',
            )
            return
        }
        isQuoting = true
        try {
            quote = await quoteMutation.mutateAsync(payload)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not calculate the loan quote.'),
            )
        } finally {
            isQuoting = false
        }
    }
    function handleDetailsChange() {
        quote = null
        createIdempotencyKey.abandonAttempt()
    }
    async function handleBack() {
        await goto(`/app/${role}/loans`)
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function getQuoteInput(): LoanQuoteInput | null {
        const principalAmountMinor = toMinorUnits(principalAmount)
        if (
            !borrowerPublicId.trim() ||
            !loanProductPublicId ||
            !firstPaymentDate ||
            principalAmountMinor === null ||
            principalAmountMinor <= 0
        ) {
            return null
        }
        return {
            borrowerPublicId: borrowerPublicId.trim(),
            firstPaymentDate,
            loanProductPublicId,
            principalMinor: principalAmountMinor,
            releaseDate,
        }
    }
    function today(): string {
        const parts = new Intl.DateTimeFormat('en-CA', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'Asia/Manila',
            year: 'numeric',
        }).formatToParts(new Date())
        const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((part) => part.type === type)!.value
        return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`
    }
</script>

<section
    class="flex min-h-0 page-scroll flex-1 flex-col bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
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
                        New loan calculator
                    </h1>
                    <p class="text-xs/5 text-zinc-500 dark:text-zinc-400">
                        The server calculates and snapshots every contractual
                        value before a loan is created.
                    </p>
                </div>
            </div>
            <div
                class="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            >
                Server-calculated quote
            </div>
        </header>
    </div>
    {#if productsQuery.isPending}
        <div
            class="grid min-w-0 grow gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]"
        >
            <Skeleton class="min-h-96 w-full rounded-xl" />
            <Skeleton class="min-h-96 w-full rounded-xl" />
        </div>
    {:else if productsQuery.isError}
        <div class="flex min-h-0 flex-1 items-start">
            <Alert.Root
                class="w-full rounded-xl border-red-200 bg-white shadow-sm dark:border-red-500/20 dark:bg-[#202020]"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Loan products could not be loaded</Alert.Title>
                <Alert.Description>
                    A current product is required to prepare a loan quote.
                </Alert.Description>
            </Alert.Root>
        </div>
    {:else if activeProducts.length === 0}
        <div class="flex min-h-0 flex-1">
            <Empty.Root
                class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-10 dark:border-amber-500/20 dark:bg-amber-500/5"
            >
                <Empty.Header>
                    <Empty.Media
                        class="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                        variant="icon"
                    >
                        <CalculatorIcon />
                    </Empty.Media>
                    <Empty.Title>No active loan product</Empty.Title>
                    <Empty.Description>
                        Create or activate a product before originating a loan.
                    </Empty.Description>
                </Empty.Header>
            </Empty.Root>
        </div>
    {:else}
        <div
            class="grid min-w-0 grow gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]"
        >
            <Card.Root
                class="flex min-h-0 flex-col overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header
                    class="shrink-0 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <Card.Title class="text-sm font-semibold"
                                >Loan details</Card.Title
                            >
                            <Card.Description class="text-xs">
                                Changing any field clears the previous quote.
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
                                <Field.Label for="borrower-public-id"
                                    >Borrower ID</Field.Label
                                >
                                <Input
                                    class="h-9"
                                    id="borrower-public-id"
                                    bind:value={borrowerPublicId}
                                    disabled={isLocked}
                                    oninput={handleDetailsChange}
                                    placeholder="Borrower public ID"
                                    required
                                />
                                <Field.Description class="text-xs">
                                    Open this page from a borrower profile to
                                    prefill the borrower.
                                </Field.Description>
                            </Field.Field>
                            <Field.Field>
                                <Field.Label for="loan-product"
                                    >Loan product</Field.Label
                                >
                                <NativeSelect.Root
                                    class="h-9"
                                    id="loan-product"
                                    bind:value={loanProductPublicId}
                                    disabled={isLocked}
                                    onchange={handleDetailsChange}
                                    required
                                >
                                    <NativeSelect.Option value=""
                                        >Select a loan product</NativeSelect.Option
                                    >
                                    {#each activeProducts as product (product.publicId)}
                                        <NativeSelect.Option
                                            value={product.publicId}
                                        >
                                            {product.name}
                                        </NativeSelect.Option>
                                    {/each}
                                </NativeSelect.Root>
                            </Field.Field>
                            <div class="grid gap-3 sm:grid-cols-2">
                                <Field.Field>
                                    <Field.Label for="principal-amount"
                                        >Principal amount (PHP)</Field.Label
                                    >
                                    <Input
                                        class="h-9 font-mono tabular-nums"
                                        id="principal-amount"
                                        bind:value={principalAmount}
                                        disabled={isLocked}
                                        inputmode="decimal"
                                        min="0.01"
                                        oninput={handleDetailsChange}
                                        placeholder="7,000.00"
                                        required
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>
                                <Field.Field>
                                    <Field.Label for="release-date"
                                        >Release date</Field.Label
                                    >
                                    <Input
                                        class="h-9"
                                        id="release-date"
                                        bind:value={releaseDate}
                                        disabled={isLocked}
                                        oninput={handleDetailsChange}
                                        required
                                        type="date"
                                    />
                                </Field.Field>
                            </div>
                            <Field.Field>
                                <Field.Label for="first-payment-date"
                                    >Estimated first collection date</Field.Label
                                >
                                <Input
                                    class="h-9"
                                    id="first-payment-date"
                                    value={firstPaymentDate}
                                    disabled
                                    type="date"
                                />
                                <Field.Description class="text-xs">
                                    Collection starts one day, one week, or one
                                    month after cash is actually released,
                                    according to the payment type.
                                </Field.Description>
                            </Field.Field>
                        </Field.Group>
                        <div
                            class="flex justify-end border-t border-zinc-100 pt-3 dark:border-zinc-800"
                        >
                            <Button
                                class="h-8 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                                type="submit"
                                disabled={isLocked}
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
                                Calculate quote
                            </Button>
                        </div>
                    </form>
                </Card.Content>
            </Card.Root>
            <Card.Root
                class="flex min-h-0 flex-col overflow-hidden border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
            >
                <Card.Header
                    class="shrink-0 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <Card.Title class="text-sm font-semibold"
                                >Loan quote</Card.Title
                            >
                            <Card.Description class="text-xs">
                                Preview only. The calculation runs again when
                                the loan is created.
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
                                    Principal
                                </dt>
                                <dd
                                    class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(quote.principalMinor)}
                                </dd>
                            </div>
                            <div
                                class="flex items-center justify-between gap-4 px-4 py-3"
                            >
                                <dt
                                    class="text-xs text-zinc-500 dark:text-zinc-400"
                                >
                                    Interest
                                </dt>
                                <dd
                                    class="font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(quote.interestAmountMinor)}
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
                                        Total payable
                                    </dt>
                                    <dd
                                        class="font-mono text-sm font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                                    >
                                        {formatCurrency(
                                            quote.totalPayableMinor,
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
                                    Payment type
                                </dt>
                                <dd
                                    class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold tracking-wide text-zinc-700 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                >
                                    {quote.formulaSnapshot.paymentFrequency}
                                </dd>
                            </div>
                            <div
                                class="flex items-center justify-between gap-4 px-4 py-3"
                            >
                                <dt
                                    class="text-xs text-zinc-500 dark:text-zinc-400"
                                >
                                    Installment
                                </dt>
                                <dd
                                    class="font-mono text-xs font-medium text-zinc-900 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(
                                        quote.installmentAmountMinor,
                                    )} × {quote.formulaSnapshot
                                        .installmentCount -
                                        (quote.installmentResidueMinor > 0
                                            ? 1
                                            : 0)}
                                    {#if quote.installmentResidueMinor > 0}
                                        + {formatCurrency(
                                            quote.totalPayableMinor -
                                                quote.installmentAmountMinor *
                                                    (quote.formulaSnapshot
                                                        .installmentCount -
                                                        1),
                                        )} final
                                    {/if}
                                </dd>
                            </div>
                            <div
                                class="flex items-center justify-between gap-4 px-4 py-3"
                            >
                                <dt
                                    class="text-xs text-zinc-500 dark:text-zinc-400"
                                >
                                    First due date
                                </dt>
                                <dd
                                    class="text-xs font-medium text-zinc-900 dark:text-zinc-100"
                                >
                                    {formatDate(quote.firstPaymentDate)}
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
                                    No quote calculated yet
                                </p>
                                <p
                                    class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400"
                                >
                                    Enter the loan details and calculate a
                                    server-side quote.
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
                            onclick={handleCreate}
                        >
                            {#if isCreating}
                                <Spinner data-icon="inline-start" />
                            {/if}
                            Create loan for approval
                        </Button>
                    </Card.Footer>
                {/if}
            </Card.Root>
        </div>
    {/if}
</section>
