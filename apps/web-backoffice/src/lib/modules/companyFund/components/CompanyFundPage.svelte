<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import { Textarea } from '@loanms/ui/components/textarea'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import BanknoteArrowDownIcon from '@lucide/svelte/icons/banknote-arrow-down'
    import BanknoteArrowUpIcon from '@lucide/svelte/icons/banknote-arrow-up'
    import ReceiptTextIcon from '@lucide/svelte/icons/receipt-text'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'

    import {
        formatCurrency,
        formatDate,
        toMinorUnits,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import type {
        CapitalInjectionInput,
        CapitalWithdrawalInput,
        CompanyFundSetupInput,
        ManualFundTransactionInput,
    } from '../api'
    import {
        createCapitalInjectionMutation,
        createCapitalTransactionsQuery,
        createCapitalWithdrawalMutation,
        createCompanyFundSetupMutation,
        createCompanyFundSummaryQuery,
        createManualFundTransactionMutation,
    } from '../queries'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let { role }: { role: 'admin' | 'owner' } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()
    const transactionRequest = {
        filters: {},
        limit: 25,
        offset: 0,
        sortOrder: 'desc' as const,
    }
    const setupIdempotencyKey = createIdempotencyKeyLifecycle()
    const injectionIdempotencyKey = createIdempotencyKeyLifecycle()
    const withdrawalIdempotencyKey = createIdempotencyKeyLifecycle()
    const manualIdempotencyKey = createIdempotencyKeyLifecycle()

    ///////////////
    // 03. State //
    ///////////////

    let setupOpen = $state(false)
    let injectionOpen = $state(false)
    let withdrawalOpen = $state(false)
    let manualOpen = $state(false)
    let setupDraft = $state(createSetupDraft())
    let injectionDraft = $state(createMovementDraft())
    let withdrawalDraft = $state(createMovementDraft())
    let manualDraft = $state(createManualDraft())
    let isSettingUp = $state(false)
    let isInjecting = $state(false)
    let isWithdrawing = $state(false)
    let isPostingManual = $state(false)

    /////////////////
    // 05. Queries //
    /////////////////

    const summaryQuery = createCompanyFundSummaryQuery({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const transactionsQuery = createCapitalTransactionsQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        { request: transactionRequest },
    )

    ///////////////////
    // 06. Mutations //
    ///////////////////

    const setupMutation = createCompanyFundSetupMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const injectionMutation = createCapitalInjectionMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const withdrawalMutation = createCapitalWithdrawalMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const manualMutation = createManualFundTransactionMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })

    /////////////////
    // 04. Derived //
    /////////////////

    const summary = $derived(summaryQuery.data ?? null)
    const transactions = $derived(transactionsQuery.data?.data ?? [])

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleSetupOpenChange(open: boolean) {
        if (isSettingUp) return
        setupOpen = open
        if (!open) {
            setupIdempotencyKey.abandonAttempt()
            setupDraft = createSetupDraft()
        }
    }

    function handleInjectionOpenChange(open: boolean) {
        if (isInjecting) return
        injectionOpen = open
        if (!open) {
            injectionIdempotencyKey.abandonAttempt()
            injectionDraft = createMovementDraft()
        }
    }

    function handleWithdrawalOpenChange(open: boolean) {
        if (isWithdrawing) return
        withdrawalOpen = open
        if (!open) {
            withdrawalIdempotencyKey.abandonAttempt()
            withdrawalDraft = createMovementDraft()
        }
    }

    function handleManualOpenChange(open: boolean) {
        if (isPostingManual) return
        manualOpen = open
        if (!open) {
            manualIdempotencyKey.abandonAttempt()
            manualDraft = createManualDraft()
        }
    }

    async function handleSetup(event: SubmitEvent) {
        event.preventDefault()
        if (isSettingUp) return
        const input = toSetupInput(setupDraft)
        if (!input) {
            toast.error(
                'Enter a fund name, a valid opening capital amount, and a transaction date.',
            )
            return
        }
        const claim = setupIdempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isSettingUp = true
        try {
            await setupMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            setupIdempotencyKey.confirmSuccess()
            toast.success(
                'Opening capital was configured and posted to the capital ledger.',
            )
            handleSetupOpenChange(false)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not configure opening capital.'),
            )
        } finally {
            isSettingUp = false
        }
    }

    async function handleInjection(event: SubmitEvent) {
        event.preventDefault()
        if (isInjecting) return
        const input = toMovementInput(injectionDraft)
        if (!input) {
            toast.error(
                'Enter a valid capital amount, reason, and transaction date.',
            )
            return
        }
        const claim = injectionIdempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isInjecting = true
        try {
            await injectionMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            injectionIdempotencyKey.confirmSuccess()
            toast.success('Capital injection was posted to the ledger.')
            handleInjectionOpenChange(false)
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not inject capital.'))
        } finally {
            isInjecting = false
        }
    }

    async function handleWithdrawal(event: SubmitEvent) {
        event.preventDefault()
        if (isWithdrawing) return
        const input = toMovementInput(withdrawalDraft)
        if (!input) {
            toast.error(
                'Enter a valid withdrawal amount, reason, and transaction date.',
            )
            return
        }
        const claim = withdrawalIdempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isWithdrawing = true
        try {
            await withdrawalMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            withdrawalIdempotencyKey.confirmSuccess()
            toast.success('Capital withdrawal was posted to the ledger.')
            handleWithdrawalOpenChange(false)
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not withdraw capital.'))
        } finally {
            isWithdrawing = false
        }
    }

    async function handleManualTransaction(event: SubmitEvent) {
        event.preventDefault()
        if (isPostingManual) return
        const input = toManualInput(manualDraft)
        if (!input) {
            toast.error(
                'Enter a valid amount, reason, transaction type, and date.',
            )
            return
        }
        const claim = manualIdempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isPostingManual = true
        try {
            await manualMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            manualIdempotencyKey.confirmSuccess()
            toast.success('The audited fund entry was posted to the ledger.')
            handleManualOpenChange(false)
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not post the fund entry.'),
            )
        } finally {
            isPostingManual = false
        }
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function createSetupDraft() {
        return {
            currency: 'PHP',
            fundName: '',
            openingCapital: '',
            transactionDate: todayInManila(),
        }
    }

    function createMovementDraft() {
        return {
            amount: '',
            reason: '',
            referenceNumber: '',
            transactionDate: todayInManila(),
        }
    }

    function createManualDraft() {
        return {
            ...createMovementDraft(),
            direction: 'OUT' as 'IN' | 'OUT',
            transactionType: 'EXPENSE' as
                'ADJUSTMENT' | 'EXPENSE' | 'WRITE_OFF',
        }
    }

    function toSetupInput(
        value: ReturnType<typeof createSetupDraft>,
    ): Omit<CompanyFundSetupInput, 'idempotencyKey'> | null {
        const openingCapitalMinor = toMinorUnits(value.openingCapital)
        const currency = value.currency.trim().toUpperCase()
        if (
            !value.fundName.trim() ||
            currency.length !== 3 ||
            openingCapitalMinor === null ||
            openingCapitalMinor <= 0 ||
            !value.transactionDate
        )
            return null
        return {
            currency,
            fundName: value.fundName.trim(),
            openingCapitalMinor,
            transactionDate: value.transactionDate,
        }
    }

    function toMovementInput(
        value: ReturnType<typeof createMovementDraft>,
    ): Omit<
        CapitalInjectionInput | CapitalWithdrawalInput,
        'idempotencyKey'
    > | null {
        const amountMinor = toMinorUnits(value.amount)
        if (
            amountMinor === null ||
            amountMinor <= 0 ||
            value.reason.trim().length < 3 ||
            !value.transactionDate
        )
            return null
        return {
            amountMinor,
            ...(value.referenceNumber.trim()
                ? { referenceNumber: value.referenceNumber.trim() }
                : {}),
            reason: value.reason.trim(),
            transactionDate: value.transactionDate,
        }
    }

    function todayInManila() {
        return new Intl.DateTimeFormat('en-CA', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'Asia/Manila',
            year: 'numeric',
        })
            .format(new Date())
            .split('/')
            .reverse()
            .join('-')
    }

    function toManualInput(
        value: ReturnType<typeof createManualDraft>,
    ): Omit<ManualFundTransactionInput, 'idempotencyKey'> | null {
        const movement = toMovementInput(value)
        if (!movement) return null
        return {
            ...movement,
            direction:
                value.transactionType === 'ADJUSTMENT'
                    ? value.direction
                    : 'OUT',
            transactionType: value.transactionType,
        }
    }
</script>

<section class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h2 class="text-xl font-semibold text-foreground">Company fund</h2>
            <p class="text-sm text-muted-foreground">
                Cash, capital, principal recovery, and earnings are derived from
                the immutable capital ledger.
            </p>
        </div>
        {#if summary?.fundPublicId}
            <div class="flex flex-wrap gap-2">
                <Button onclick={() => (injectionOpen = true)}>
                    <BanknoteArrowUpIcon data-icon="inline-start" />Inject
                    capital
                </Button>
                <Button
                    onclick={() => (manualOpen = true)}
                    variant="outline"
                >
                    <ReceiptTextIcon data-icon="inline-start" />Record fund
                    entry
                </Button>
                {#if role === 'owner'}
                    <Button
                        onclick={() => (withdrawalOpen = true)}
                        variant="destructive"
                    >
                        <BanknoteArrowDownIcon
                            data-icon="inline-start"
                        />Withdraw capital
                    </Button>
                {/if}
            </div>
        {/if}
    </header>

    {#if summaryQuery.isPending}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {#each [0, 1, 2, 3] as item (item)}<Skeleton class="h-28" />{/each}
        </div>
    {:else if summaryQuery.isError}
        <Alert.Root variant="destructive">
            <AlertCircleIcon />
            <Alert.Title>Company fund could not be loaded</Alert.Title>
            <Alert.Description class="flex flex-wrap items-center gap-3">
                <span>Refresh to try again.</span>
                <Button
                    onclick={() => void summaryQuery.refetch()}
                    size="sm"
                    variant="outline"
                >
                    <RefreshCwIcon data-icon="inline-start" />Refresh
                </Button>
            </Alert.Description>
        </Alert.Root>
    {:else if !summary?.fundPublicId}
        <Empty.Root class="border"
            ><Empty.Header
                ><Empty.Title>Opening capital is not configured</Empty.Title
                ><Empty.Description
                    >Set up the primary company fund before posting loan
                    releases, payments, reversals, renewals, or refunds.</Empty.Description
                ></Empty.Header
            ><Empty.Content
                ><Button onclick={() => (setupOpen = true)}
                    >Configure opening capital</Button
                ></Empty.Content
            ></Empty.Root
        >
    {:else}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card.Root
                ><Card.Header
                    ><Card.Description>Available cash</Card.Description
                    ><Card.Title class="tabular-nums"
                        >{formatCurrency(
                            summary.availableCashMinor,
                        )}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
            <Card.Root
                ><Card.Header
                    ><Card.Description>Outstanding principal</Card.Description
                    ><Card.Title class="tabular-nums"
                        >{formatCurrency(
                            summary.outstandingPrincipalMinor,
                        )}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
            <Card.Root
                ><Card.Header
                    ><Card.Description>Interest collected</Card.Description
                    ><Card.Title class="tabular-nums"
                        >{formatCurrency(
                            summary.interestCollectedMinor,
                        )}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
            <Card.Root
                ><Card.Header
                    ><Card.Description>Net earnings</Card.Description
                    ><Card.Title class="tabular-nums"
                        >{formatCurrency(summary.netEarningsMinor)}</Card.Title
                    ></Card.Header
                ></Card.Root
            >
        </div>
        <div class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <p>
                Opening capital: <span class="font-medium tabular-nums"
                    >{formatCurrency(summary.openingCapitalMinor)}</span
                >
            </p>
            <p>
                Additional capital: <span class="font-medium tabular-nums"
                    >{formatCurrency(summary.additionalCapitalMinor)}</span
                >
            </p>
            <p>
                Principal recovered: <span class="font-medium tabular-nums"
                    >{formatCurrency(summary.principalCollectedMinor)}</span
                >
            </p>
            <p>
                Principal released: <span class="font-medium tabular-nums"
                    >{formatCurrency(summary.principalReleasedMinor)}</span
                >
            </p>
            <p>
                Expenses: <span class="font-medium tabular-nums"
                    >{formatCurrency(summary.expensesMinor)}</span
                >
            </p>
            <p>
                Write-offs: <span class="font-medium tabular-nums"
                    >{formatCurrency(summary.writeOffsMinor)}</span
                >
            </p>
        </div>
    {/if}

    <section class="min-h-0">
        <h3 class="mb-2 text-base font-semibold">Capital ledger</h3>
        {#if transactionsQuery.isPending}
            <div
                class="grid gap-2"
                aria-label="Loading capital ledger"
            >
                {#each [0, 1, 2] as item (item)}<Skeleton class="h-11" />{/each}
            </div>
        {:else if transactionsQuery.isError}<Alert.Root variant="destructive"
                ><AlertCircleIcon /><Alert.Title
                    >Capital ledger could not be loaded</Alert.Title
                ><Alert.Description class="flex flex-wrap items-center gap-3"
                    ><span>Refresh to try again.</span><Button
                        onclick={() => void transactionsQuery.refetch()}
                        size="sm"
                        variant="outline"
                        ><RefreshCwIcon
                            data-icon="inline-start"
                        />Refresh</Button
                    ></Alert.Description
                ></Alert.Root
            >
        {:else if transactions.length === 0}<Empty.Root class="border"
                ><Empty.Header
                    ><Empty.Title>No capital transactions yet</Empty.Title
                    ><Empty.Description
                        >Opening capital and later financial postings will
                        appear here.</Empty.Description
                    ></Empty.Header
                ></Empty.Root
            >
        {:else}<div class="overflow-x-auto rounded-md border">
                <Table.Root
                    ><Table.Header
                        ><Table.Row
                            ><Table.Head>Date</Table.Head><Table.Head
                                >Type</Table.Head
                            ><Table.Head>Reference</Table.Head><Table.Head
                                >Direction</Table.Head
                            ><Table.Head class="text-right">Amount</Table.Head
                            ></Table.Row
                        ></Table.Header
                    ><Table.Body
                        >{#each transactions as transaction (transaction.publicId)}<Table.Row
                                ><Table.Cell
                                    >{formatDate(
                                        transaction.transactionAt,
                                    )}</Table.Cell
                                ><Table.Cell
                                    >{transaction.transactionType}</Table.Cell
                                ><Table.Cell
                                    >{transaction.referenceNumber ??
                                        transaction.transactionNumber}</Table.Cell
                                ><Table.Cell>{transaction.direction}</Table.Cell
                                ><Table.Cell class="text-right tabular-nums"
                                    >{formatCurrency(
                                        transaction.amountMinor,
                                    )}</Table.Cell
                                ></Table.Row
                            >{/each}</Table.Body
                    ></Table.Root
                >
            </div>{/if}
    </section>
</section>

<Dialog.Root bind:open={() => setupOpen, handleSetupOpenChange}>
    <Dialog.Content class="max-w-xl">
        <form
            class="grid gap-5"
            onsubmit={handleSetup}
        >
            <Dialog.Header>
                <Dialog.Title>Configure opening capital</Dialog.Title>
                <Dialog.Description>
                    This creates the primary company fund and its first
                    immutable ledger entry. It can only be done once.
                </Dialog.Description>
            </Dialog.Header>
            <Field.Group>
                <Field.Field>
                    <Field.Label for="company-fund-name">Fund name</Field.Label>
                    <Input
                        id="company-fund-name"
                        bind:value={setupDraft.fundName}
                        disabled={isSettingUp}
                        maxlength={128}
                        required
                    />
                </Field.Field>
                <div class="grid gap-4 sm:grid-cols-2">
                    <Field.Field>
                        <Field.Label for="company-fund-currency"
                            >Currency</Field.Label
                        >
                        <Input
                            id="company-fund-currency"
                            bind:value={setupDraft.currency}
                            disabled={isSettingUp}
                            maxlength={3}
                            required
                        />
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="company-fund-opening-capital"
                            >Opening capital (PHP)</Field.Label
                        >
                        <Input
                            id="company-fund-opening-capital"
                            bind:value={setupDraft.openingCapital}
                            disabled={isSettingUp}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        />
                    </Field.Field>
                </div>
                <Field.Field>
                    <Field.Label for="company-fund-opening-date"
                        >Transaction date</Field.Label
                    >
                    <Input
                        id="company-fund-opening-date"
                        bind:value={setupDraft.transactionDate}
                        disabled={isSettingUp}
                        required
                        type="date"
                    />
                </Field.Field>
            </Field.Group>
            <Dialog.Footer>
                <Button
                    disabled={isSettingUp}
                    onclick={() => handleSetupOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                >
                <Button
                    disabled={isSettingUp}
                    type="submit"
                    >{#if isSettingUp}<Spinner
                            data-icon="inline-start"
                        />{/if}Configure fund</Button
                >
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={() => injectionOpen, handleInjectionOpenChange}>
    <Dialog.Content class="max-w-xl">
        <form
            class="grid gap-5"
            onsubmit={handleInjection}
        >
            <Dialog.Header>
                <Dialog.Title>Inject capital</Dialog.Title>
                <Dialog.Description
                    >Record additional capital received by the company fund. The
                    entry is immutable after posting.</Dialog.Description
                >
            </Dialog.Header>
            <Field.Group>
                <Field.Field>
                    <Field.Label for="capital-injection-amount"
                        >Capital amount (PHP)</Field.Label
                    >
                    <Input
                        id="capital-injection-amount"
                        bind:value={injectionDraft.amount}
                        disabled={isInjecting}
                        inputmode="decimal"
                        min="0.01"
                        required
                        step="0.01"
                        type="number"
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="capital-injection-date"
                        >Transaction date</Field.Label
                    >
                    <Input
                        id="capital-injection-date"
                        bind:value={injectionDraft.transactionDate}
                        disabled={isInjecting}
                        required
                        type="date"
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="capital-injection-reference"
                        >Reference number <span class="text-muted-foreground"
                            >(optional)</span
                        ></Field.Label
                    >
                    <Input
                        id="capital-injection-reference"
                        bind:value={injectionDraft.referenceNumber}
                        disabled={isInjecting}
                        maxlength={128}
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="capital-injection-reason"
                        >Reason</Field.Label
                    >
                    <Textarea
                        id="capital-injection-reason"
                        bind:value={injectionDraft.reason}
                        disabled={isInjecting}
                        maxlength={500}
                        minlength={3}
                        required
                    />
                    <Field.Description
                        >Include the source or approval context for the audit
                        record.</Field.Description
                    >
                </Field.Field>
            </Field.Group>
            <Dialog.Footer>
                <Button
                    disabled={isInjecting}
                    onclick={() => handleInjectionOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                >
                <Button
                    disabled={isInjecting}
                    type="submit"
                    >{#if isInjecting}<Spinner
                            data-icon="inline-start"
                        />{/if}Post capital injection</Button
                >
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>

{#if role === 'owner'}
    <AlertDialog.Root
        bind:open={() => withdrawalOpen, handleWithdrawalOpenChange}
    >
        <AlertDialog.Content>
            <form
                class="grid gap-5"
                onsubmit={handleWithdrawal}
            >
                <AlertDialog.Header>
                    <AlertDialog.Title
                        >Withdraw company capital?</AlertDialog.Title
                    >
                    <AlertDialog.Description
                        >This irreversible cash-out entry is limited to owners
                        and cannot exceed available company cash.</AlertDialog.Description
                    >
                </AlertDialog.Header>
                <Field.Group>
                    <Field.Field>
                        <Field.Label for="capital-withdrawal-amount"
                            >Withdrawal amount (PHP)</Field.Label
                        >
                        <Input
                            id="capital-withdrawal-amount"
                            bind:value={withdrawalDraft.amount}
                            disabled={isWithdrawing}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        />
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="capital-withdrawal-date"
                            >Transaction date</Field.Label
                        >
                        <Input
                            id="capital-withdrawal-date"
                            bind:value={withdrawalDraft.transactionDate}
                            disabled={isWithdrawing}
                            required
                            type="date"
                        />
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="capital-withdrawal-reference"
                            >Reference number <span
                                class="text-muted-foreground">(optional)</span
                            ></Field.Label
                        >
                        <Input
                            id="capital-withdrawal-reference"
                            bind:value={withdrawalDraft.referenceNumber}
                            disabled={isWithdrawing}
                            maxlength={128}
                        />
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="capital-withdrawal-reason"
                            >Reason</Field.Label
                        >
                        <Textarea
                            id="capital-withdrawal-reason"
                            bind:value={withdrawalDraft.reason}
                            disabled={isWithdrawing}
                            maxlength={500}
                            minlength={3}
                            required
                        />
                        <Field.Description
                            >State the purpose and authorization for this
                            audited withdrawal.</Field.Description
                        >
                    </Field.Field>
                </Field.Group>
                <AlertDialog.Footer>
                    <Button
                        disabled={isWithdrawing}
                        onclick={() => handleWithdrawalOpenChange(false)}
                        type="button"
                        variant="outline">Cancel</Button
                    >
                    <Button
                        disabled={isWithdrawing}
                        type="submit"
                        variant="destructive"
                        >{#if isWithdrawing}<Spinner
                                data-icon="inline-start"
                            />{/if}Withdraw capital</Button
                    >
                </AlertDialog.Footer>
            </form>
        </AlertDialog.Content>
    </AlertDialog.Root>
{/if}

<AlertDialog.Root bind:open={() => manualOpen, handleManualOpenChange}>
    <AlertDialog.Content class="max-w-xl">
        <form
            class="grid gap-5"
            onsubmit={handleManualTransaction}
        >
            <AlertDialog.Header>
                <AlertDialog.Title>Record fund entry</AlertDialog.Title>
                <AlertDialog.Description>
                    Expenses, write-offs, and adjustments are immutable audited
                    ledger entries. Confirm the type, direction, and reason
                    before posting.
                </AlertDialog.Description>
            </AlertDialog.Header>
            <Field.Group>
                <div class="grid gap-4 sm:grid-cols-2">
                    <Field.Field>
                        <Field.Label for="manual-fund-type"
                            >Transaction type</Field.Label
                        >
                        <select
                            class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            id="manual-fund-type"
                            bind:value={manualDraft.transactionType}
                            disabled={isPostingManual}
                        >
                            <option value="EXPENSE">Expense</option>
                            <option value="WRITE_OFF">Write-off</option>
                            <option value="ADJUSTMENT">Adjustment</option>
                        </select>
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="manual-fund-direction"
                            >Direction</Field.Label
                        >
                        <select
                            class="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                            id="manual-fund-direction"
                            bind:value={manualDraft.direction}
                            disabled={isPostingManual ||
                                manualDraft.transactionType !== 'ADJUSTMENT'}
                        >
                            <option value="OUT">Cash out</option>
                            <option value="IN">Cash in</option>
                        </select>
                        <Field.Description>
                            Expense and write-off entries are always cash out.
                        </Field.Description>
                    </Field.Field>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                    <Field.Field>
                        <Field.Label for="manual-fund-amount"
                            >Amount (PHP)</Field.Label
                        >
                        <Input
                            id="manual-fund-amount"
                            bind:value={manualDraft.amount}
                            disabled={isPostingManual}
                            inputmode="decimal"
                            min="0.01"
                            required
                            step="0.01"
                            type="number"
                        />
                    </Field.Field>
                    <Field.Field>
                        <Field.Label for="manual-fund-date"
                            >Transaction date</Field.Label
                        >
                        <Input
                            id="manual-fund-date"
                            bind:value={manualDraft.transactionDate}
                            disabled={isPostingManual}
                            required
                            type="date"
                        />
                    </Field.Field>
                </div>
                <Field.Field>
                    <Field.Label for="manual-fund-reference"
                        >Reference number <span class="text-muted-foreground"
                            >(optional)</span
                        ></Field.Label
                    >
                    <Input
                        id="manual-fund-reference"
                        bind:value={manualDraft.referenceNumber}
                        disabled={isPostingManual}
                        maxlength={128}
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="manual-fund-reason">Reason</Field.Label>
                    <Textarea
                        id="manual-fund-reason"
                        bind:value={manualDraft.reason}
                        disabled={isPostingManual}
                        maxlength={500}
                        minlength={3}
                        required
                    />
                </Field.Field>
            </Field.Group>
            <AlertDialog.Footer>
                <Button
                    disabled={isPostingManual}
                    onclick={() => handleManualOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                >
                <Button
                    disabled={isPostingManual}
                    type="submit"
                    variant="destructive"
                    >{#if isPostingManual}<Spinner
                            data-icon="inline-start"
                        />{/if}Post audited entry</Button
                >
            </AlertDialog.Footer>
        </form>
    </AlertDialog.Content>
</AlertDialog.Root>
