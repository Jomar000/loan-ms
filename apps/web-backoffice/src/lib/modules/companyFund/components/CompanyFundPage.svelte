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

<section
    class="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]"
>
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
                <h1
                    class="truncate text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                >
                    Company fund
                </h1>
                <p class="mt-1 text-xs/5 text-zinc-500 dark:text-zinc-400">
                    Cash, capital, principal recovery, and earnings are derived
                    from the immutable capital ledger.
                </p>
            </div>
            {#if summary?.fundPublicId}
                <div class="flex flex-wrap items-center gap-1.5">
                    <Button
                        class="h-8 bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                        onclick={() => (injectionOpen = true)}
                        size="sm"
                    >
                        <BanknoteArrowUpIcon
                            class="size-3.5"
                            data-icon="inline-start"
                        />
                        Inject capital
                    </Button>
                    <Button
                        class="h-8 border-zinc-200 bg-white px-2.5 text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                        onclick={() => (manualOpen = true)}
                        size="sm"
                        variant="outline"
                    >
                        <ReceiptTextIcon
                            class="size-3.5"
                            data-icon="inline-start"
                        />
                        Record fund entry
                    </Button>
                    {#if role === 'owner'}
                        <Button
                            class="h-8 px-2.5 text-xs"
                            onclick={() => (withdrawalOpen = true)}
                            size="sm"
                            variant="destructive"
                        >
                            <BanknoteArrowDownIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            />
                            Withdraw capital
                        </Button>
                    {/if}
                </div>
            {/if}
        </header>
    </div>
    {#if summaryQuery.isPending}
        <div class="mb-3 grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {#each [0, 1, 2, 3] as item (item)}
                <Skeleton class="h-20 rounded-xl" />
            {/each}
        </div>
    {:else if summaryQuery.isError}
        <div class="mb-3 shrink-0">
            <Alert.Root
                class="rounded-xl border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/5"
                variant="destructive"
            >
                <AlertCircleIcon />
                <Alert.Title>Company fund could not be loaded</Alert.Title>
                <Alert.Description class="flex flex-wrap items-center gap-2">
                    <span>Refresh to try again.</span>
                    <Button
                        class="h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                        onclick={() => void summaryQuery.refetch()}
                        size="sm"
                        variant="outline"
                    >
                        <RefreshCwIcon
                            class="size-3.5"
                            data-icon="inline-start"
                        />
                        Refresh
                    </Button>
                </Alert.Description>
            </Alert.Root>
        </div>
    {:else if !summary?.fundPublicId}
        <div class="mb-3 shrink-0">
            <Empty.Root
                class="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
            >
                <Empty.Header>
                    <Empty.Title>Opening capital is not configured</Empty.Title>
                    <Empty.Description>
                        Set up the primary company fund before posting loan
                        releases, payments, reversals, renewals, or refunds.
                    </Empty.Description>
                </Empty.Header>
                <Empty.Content>
                    <Button
                        class="h-8 bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
                        onclick={() => (setupOpen = true)}
                        size="sm"
                    >
                        Configure opening capital
                    </Button>
                </Empty.Content>
            </Empty.Root>
        </div>
    {:else}
        <div class="mb-3 grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Card.Root
                class="overflow-hidden border-amber-200/70 bg-amber-50/60 shadow-sm dark:border-amber-500/15 dark:bg-amber-500/5"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                    >
                        Available cash
                    </Card.Description>
                    <Card.Title
                        class="font-mono text-base font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                    >
                        {formatCurrency(summary.availableCashMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root
                class="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider uppercase"
                    >
                        Outstanding principal
                    </Card.Description>
                    <Card.Title
                        class="font-mono text-base font-semibold tabular-nums"
                    >
                        {formatCurrency(summary.outstandingPrincipalMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root
                class="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider uppercase"
                    >
                        Interest collected
                    </Card.Description>
                    <Card.Title
                        class="font-mono text-base font-semibold tabular-nums"
                    >
                        {formatCurrency(summary.interestCollectedMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
            <Card.Root
                class="overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
            >
                <Card.Header class="px-3 py-2.5">
                    <Card.Description
                        class="text-[10px] font-semibold tracking-wider uppercase"
                    >
                        Net earnings
                    </Card.Description>
                    <Card.Title
                        class="font-mono text-base font-semibold tabular-nums"
                    >
                        {formatCurrency(summary.netEarningsMinor)}
                    </Card.Title>
                </Card.Header>
            </Card.Root>
        </div>
        <div
            class="mb-3 grid shrink-0 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 shadow-sm sm:grid-cols-2 xl:grid-cols-6 dark:border-zinc-800 dark:bg-zinc-800"
        >
            <div class="bg-white px-3 py-2.5 dark:bg-[#202020]">
                <p
                    class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                    Opening capital
                </p>
                <p
                    class="mt-1 font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                >
                    {formatCurrency(summary.openingCapitalMinor)}
                </p>
            </div>
            <div class="bg-white px-3 py-2.5 dark:bg-[#202020]">
                <p
                    class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                    Additional capital
                </p>
                <p
                    class="mt-1 font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                >
                    {formatCurrency(summary.additionalCapitalMinor)}
                </p>
            </div>
            <div class="bg-white px-3 py-2.5 dark:bg-[#202020]">
                <p
                    class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                    Principal recovered
                </p>
                <p
                    class="mt-1 font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                >
                    {formatCurrency(summary.principalCollectedMinor)}
                </p>
            </div>
            <div class="bg-white px-3 py-2.5 dark:bg-[#202020]">
                <p
                    class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                    Principal released
                </p>
                <p
                    class="mt-1 font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                >
                    {formatCurrency(summary.principalReleasedMinor)}
                </p>
            </div>
            <div class="bg-white px-3 py-2.5 dark:bg-[#202020]">
                <p
                    class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                    Expenses
                </p>
                <p
                    class="mt-1 font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                >
                    {formatCurrency(summary.expensesMinor)}
                </p>
            </div>
            <div class="bg-white px-3 py-2.5 dark:bg-[#202020]">
                <p
                    class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                >
                    Write-offs
                </p>
                <p
                    class="mt-1 font-mono text-xs font-semibold text-zinc-900 tabular-nums dark:text-zinc-100"
                >
                    {formatCurrency(summary.writeOffsMinor)}
                </p>
            </div>
        </div>
    {/if}
    <section
        class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
    >
        <div
            class="shrink-0 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800"
        >
            <h2 class="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Capital ledger
            </h2>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Immutable fund movements and audited capital activity.
            </p>
        </div>
        {#if transactionsQuery.isPending}
            <div
                class="flex min-h-0 flex-1 flex-col gap-2 p-3"
                aria-label="Loading capital ledger"
            >
                <div
                    class="grid shrink-0 grid-cols-5 gap-3 border-b border-zinc-100 px-3 pb-2 dark:border-zinc-800"
                >
                    {#each [0, 1, 2, 3, 4] as item (item)}
                        <Skeleton class="h-4 w-full rounded-sm" />
                    {/each}
                </div>
                {#each [0, 1, 2] as item (item)}
                    <Skeleton class="h-10 w-full rounded-lg" />
                {/each}
            </div>
        {:else if transactionsQuery.isError}
            <div class="flex min-h-0 flex-1 items-start p-3">
                <Alert.Root
                    class="w-full rounded-xl border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/5"
                    variant="destructive"
                >
                    <AlertCircleIcon />
                    <Alert.Title>Capital ledger could not be loaded</Alert.Title
                    >
                    <Alert.Description
                        class="flex flex-wrap items-center gap-2"
                    >
                        <span>Refresh to try again.</span>
                        <Button
                            class="h-8 border-red-200 bg-white px-2.5 text-xs hover:bg-red-50 dark:border-red-500/20 dark:bg-zinc-900 dark:hover:bg-red-500/10"
                            onclick={() => void transactionsQuery.refetch()}
                            size="sm"
                            variant="outline"
                        >
                            <RefreshCwIcon
                                class="size-3.5"
                                data-icon="inline-start"
                            />
                            Refresh
                        </Button>
                    </Alert.Description>
                </Alert.Root>
            </div>
        {:else if transactions.length === 0}
            <div class="flex min-h-0 flex-1 p-3">
                <Empty.Root
                    class="min-h-full w-full rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-8 dark:border-amber-500/20 dark:bg-amber-500/5"
                >
                    <Empty.Header>
                        <Empty.Title>No capital transactions yet</Empty.Title>
                        <Empty.Description>
                            Opening capital and later financial postings will
                            appear here.
                        </Empty.Description>
                    </Empty.Header>
                </Empty.Root>
            </div>
        {:else}
            <div class="max-h-[min(60vh,40rem)] min-h-48 flex-1 overflow-auto">
                <Table.Root class="min-w-[760px] text-xs">
                    <Table.Caption class="sr-only"
                        >Capital ledger transactions</Table.Caption
                    >
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95"
                    >
                        <Table.Row
                            class="border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800"
                        >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Date</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Type</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Reference</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Direction</Table.Head
                            >
                            <Table.Head
                                class="h-9 px-3 text-right text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                >Amount</Table.Head
                            >
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {#each transactions as transaction (transaction.publicId)}
                            <Table.Row
                                class="border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-xs whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                                >
                                    {formatDate(transaction.transactionAt)}
                                </Table.Cell>
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <span
                                        class="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                    >
                                        {transaction.transactionType}
                                    </span>
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 max-w-64 truncate px-3 py-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400"
                                >
                                    {transaction.referenceNumber ??
                                        transaction.transactionNumber}
                                </Table.Cell>
                                <Table.Cell class="h-11 px-3 py-1.5">
                                    <span
                                        class="inline-flex h-6 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                                    >
                                        {transaction.direction}
                                    </span>
                                </Table.Cell>
                                <Table.Cell
                                    class="h-11 px-3 py-1.5 text-right font-mono text-xs font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                >
                                    {formatCurrency(transaction.amountMinor)}
                                </Table.Cell>
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}
    </section>
</section>
<Dialog.Root bind:open={() => setupOpen, handleSetupOpenChange}>
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl sm:max-w-xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="grid gap-4"
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
                        class="h-9"
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
                            class="h-9"
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
                            class="h-9"
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
                        class="h-9"
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
    <Dialog.Content
        class="max-h-[calc(100svh-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl sm:max-w-xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="grid gap-4"
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
                        class="h-9"
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
                        class="h-9"
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
                        class="h-9"
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
                        class="min-h-24 text-sm"
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
        <AlertDialog.Content
            class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-red-200 bg-white shadow-2xl dark:border-red-500/20 dark:bg-[#202020]"
        >
            <form
                class="grid gap-4"
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
                            class="h-9"
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
                            class="h-9"
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
                            class="h-9"
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
                            class="min-h-24 text-sm"
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
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-amber-200/70 bg-white shadow-2xl data-[size=default]:sm:max-w-xl dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="grid gap-4"
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
                            class="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
                            class="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
                            class="h-9"
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
                            class="h-9"
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
                        class="h-9"
                        id="manual-fund-reference"
                        bind:value={manualDraft.referenceNumber}
                        disabled={isPostingManual}
                        maxlength={128}
                    />
                </Field.Field>
                <Field.Field>
                    <Field.Label for="manual-fund-reason">Reason</Field.Label>
                    <Textarea
                        class="min-h-24 text-sm"
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
