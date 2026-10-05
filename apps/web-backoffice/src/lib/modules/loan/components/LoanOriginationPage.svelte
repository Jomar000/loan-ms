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

    let firstPaymentDate = $state(today())
    let isCreating = $state(false)
    let isQuoting = $state(false)
    let loanProductPublicId = $state('')
    let principalAmount = $state('')
    let quote = $state<LoanQuote | null>(null)
    let releaseDate = $state(today())

    /////////////////
    // 04. Derived //
    /////////////////

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
                'Enter a borrower, loan product, principal, and first payment date.',
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
        return new Date().toISOString().slice(0, 10)
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
    <header>
        <h2 class="text-xl font-semibold text-foreground">
            New loan calculator
        </h2>
        <p class="text-sm text-muted-foreground">
            The server calculates and snapshots every contractual value before a
            loan is created.
        </p>
    </header>

    {#if productsQuery.isPending}
        <Skeleton class="h-96 w-full" />
    {:else if productsQuery.isError}
        <Alert.Root variant="destructive"
            ><AlertCircleIcon /><Alert.Title
                >Loan products could not be loaded</Alert.Title
            ><Alert.Description
                >A current product is required to prepare a loan quote.</Alert.Description
            ></Alert.Root
        >
    {:else if activeProducts.length === 0}
        <Empty.Root class="border"
            ><Empty.Header
                ><Empty.Media variant="icon"><CalculatorIcon /></Empty.Media
                ><Empty.Title>No active loan product</Empty.Title
                ><Empty.Description
                    >Create or activate a product before originating a loan.</Empty.Description
                ></Empty.Header
            ></Empty.Root
        >
    {:else}
        <div
            class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]"
        >
            <Card.Root>
                <Card.Header
                    ><Card.Title>Loan details</Card.Title><Card.Description
                        >Changing a field clears the previous quote.</Card.Description
                    ></Card.Header
                >
                <Card.Content>
                    <form
                        class="grid gap-5"
                        onsubmit={handleQuote}
                    >
                        <Field.Group>
                            <Field.Field
                                ><Field.Label for="borrower-public-id"
                                    >Borrower ID</Field.Label
                                ><Input
                                    id="borrower-public-id"
                                    bind:value={borrowerPublicId}
                                    disabled={isLocked}
                                    oninput={handleDetailsChange}
                                    placeholder="Borrower public ID"
                                    required
                                /><Field.Description
                                    >Open this page from a borrower profile to
                                    prefill the borrower.</Field.Description
                                ></Field.Field
                            >
                            <Field.Field
                                ><Field.Label for="loan-product"
                                    >Loan product</Field.Label
                                ><NativeSelect.Root
                                    id="loan-product"
                                    bind:value={loanProductPublicId}
                                    disabled={isLocked}
                                    onchange={handleDetailsChange}
                                    required
                                    ><NativeSelect.Option value=""
                                        >Select a loan product</NativeSelect.Option
                                    >{#each activeProducts as product (product.publicId)}<NativeSelect.Option
                                            value={product.publicId}
                                            >{product.name}</NativeSelect.Option
                                        >{/each}</NativeSelect.Root
                                ></Field.Field
                            >
                            <div class="grid gap-4 sm:grid-cols-2">
                                <Field.Field
                                    ><Field.Label for="principal-amount"
                                        >Principal amount (PHP)</Field.Label
                                    ><Input
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
                                    /></Field.Field
                                >
                                <Field.Field
                                    ><Field.Label for="release-date"
                                        >Release date</Field.Label
                                    ><Input
                                        id="release-date"
                                        bind:value={releaseDate}
                                        disabled={isLocked}
                                        oninput={handleDetailsChange}
                                        required
                                        type="date"
                                    /></Field.Field
                                >
                            </div>
                            <Field.Field
                                ><Field.Label for="first-payment-date"
                                    >First payment date</Field.Label
                                ><Input
                                    id="first-payment-date"
                                    bind:value={firstPaymentDate}
                                    disabled={isLocked}
                                    min={releaseDate}
                                    oninput={handleDetailsChange}
                                    required
                                    type="date"
                                /></Field.Field
                            >
                        </Field.Group>
                        <Button
                            type="submit"
                            disabled={isLocked}
                            >{#if isQuoting}<Spinner
                                    data-icon="inline-start"
                                />{/if}Calculate quote</Button
                        >
                    </form>
                </Card.Content>
            </Card.Root>

            <Card.Root>
                <Card.Header
                    ><Card.Title>Loan quote</Card.Title><Card.Description
                        >Preview only. The same calculation is performed again
                        when the loan is created.</Card.Description
                    ></Card.Header
                >
                <Card.Content>
                    {#if quote}
                        <dl class="grid gap-3 text-sm">
                            <div class="flex justify-between gap-4">
                                <dt class="text-muted-foreground">Principal</dt>
                                <dd class="font-medium tabular-nums">
                                    {formatCurrency(quote.principalMinor)}
                                </dd>
                            </div>
                            <div class="flex justify-between gap-4">
                                <dt class="text-muted-foreground">Interest</dt>
                                <dd class="font-medium tabular-nums">
                                    {formatCurrency(quote.interestAmountMinor)}
                                </dd>
                            </div>
                            <div
                                class="flex justify-between gap-4 border-t pt-3"
                            >
                                <dt class="font-medium">Total payable</dt>
                                <dd class="font-semibold tabular-nums">
                                    {formatCurrency(quote.totalPayableMinor)}
                                </dd>
                            </div>
                            <div class="flex justify-between gap-4">
                                <dt class="text-muted-foreground">
                                    Payment type
                                </dt>
                                <dd>
                                    {quote.formulaSnapshot.paymentFrequency}
                                </dd>
                            </div>
                            <div class="flex justify-between gap-4">
                                <dt class="text-muted-foreground">
                                    Installment
                                </dt>
                                <dd class="tabular-nums">
                                    {formatCurrency(
                                        quote.installmentAmountMinor,
                                    )} × {quote.formulaSnapshot
                                        .installmentCount}
                                </dd>
                            </div>
                            <div class="flex justify-between gap-4">
                                <dt class="text-muted-foreground">
                                    First due date
                                </dt>
                                <dd>{formatDate(quote.firstPaymentDate)}</dd>
                            </div>
                            <div class="flex justify-between gap-4">
                                <dt class="text-muted-foreground">
                                    Expected completion
                                </dt>
                                <dd>
                                    {formatDate(quote.expectedCompletionDate)}
                                </dd>
                            </div>
                        </dl>
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            Enter the loan details and calculate a server-side
                            quote.
                        </p>
                    {/if}
                </Card.Content>
                {#if quote}
                    <Card.Footer
                        ><Button
                            class="w-full"
                            disabled={isLocked}
                            onclick={handleCreate}
                            >{#if isCreating}<Spinner
                                    data-icon="inline-start"
                                />{/if}Create loan for approval</Button
                        ></Card.Footer
                    >
                {/if}
            </Card.Root>
        </div>
    {/if}
</section>
