<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import BadgeCheckIcon from '@lucide/svelte/icons/badge-check'
    import CalculatorIcon from '@lucide/svelte/icons/calculator'
    import CircleDotIcon from '@lucide/svelte/icons/circle-dot'
    import FlaskConicalIcon from '@lucide/svelte/icons/flask-conical'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import { formatCurrency, toMinorUnits } from '../../loan/utilities/format'
    import {
        createFormulaProfileActivateMutation,
        createFormulaProfileCreateMutation,
        createFormulaProfilePreviewMutation,
        createFormulaProfileRetireMutation,
        createFormulaProfilesQuery,
        createFormulaProfileVersionMutation,
    } from '../queries'
    import type {
        FormulaProfile,
        FormulaProfileCreateInput,
        FormulaProfileInput,
        FormulaProfilePreview,
    } from '../types'
    type TFormulaDraft = {
        allowRenewalPrincipalChange: boolean
        effectiveDate: string
        fixedInterestAmount: string
        installmentCount: number
        interestMethod: 'FIXED_AMOUNT' | 'FLAT_PERCENTAGE'
        interestRatePercent: number
        minimumRenewalCompletedInstallments: number
        name: string
        partialCreditPolicy:
            'APPLY_TO_SETTLEMENT' | 'CARRY_FORWARD' | 'MANUAL_REVIEW' | 'REFUND'
        paymentFrequency: 'DAILY' | 'MONTHLY' | 'WEEKLY'
        renewalSettlementMethod:
            'COMPLETED_INSTALLMENT_BALANCE' | 'EXACT_OUTSTANDING_BALANCE'
        roundingMode: 'DOWN' | 'HALF_UP' | 'UP'
        termDays: number
        version: number
    }
    ///////////////////
    // 02. Constants //
    ///////////////////
    const createKey = createIdempotencyKeyLifecycle()
    const session = useSessionContext()
    const settlementDescriptions: Record<
        TFormulaDraft['renewalSettlementMethod'],
        string
    > = {
        COMPLETED_INSTALLMENT_BALANCE:
            'Counts the full amount of each installment that is not yet complete. The choice below decides what happens to any partial payment.',
        EXACT_OUTSTANDING_BALANCE:
            'Uses the amount still unpaid after all recorded payments, including partial payments.',
    }
    const partialCreditDescriptions: Record<
        TFormulaDraft['partialCreditPolicy'],
        string
    > = {
        APPLY_TO_SETTLEMENT:
            'Counts the partial payment toward settling the old loan. With actual unpaid balance, it is already included.',
        CARRY_FORWARD:
            'Applies the partial payment to installments on the new loan.',
        MANUAL_REVIEW:
            'Blocks renewal posting for manual handling, even when there is no partial payment.',
        REFUND: 'Returns the partial payment to the borrower as a separate refund.',
    }
    ///////////////
    // 03. State //
    ///////////////
    let draft = $state(createDraft())
    let editingSource = $state<FormulaProfile | null>(null)
    let isActing = $state(false)
    let profileDialogOpen = $state(false)
    let preview = $state<FormulaProfilePreview | null>(null)
    let previewPrincipal = $state('7000')
    let previewTotalPaid = $state('4000')

    /////////////////
    // 04. Derived //
    /////////////////
    const renewalInstallmentMaximum = $derived(
        Math.max(0, Number(draft.installmentCount) || 0),
    )
    const hasInvalidRenewalMinimum = $derived(
        Number(draft.minimumRenewalCompletedInstallments) >
            renewalInstallmentMaximum,
    )

    /////////////////
    // 05. Queries //
    /////////////////
    const profilesQuery = createFormulaProfilesQuery({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const profiles = $derived(profilesQuery.data ?? [])
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const createMutation = createFormulaProfileCreateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const versionMutation = createFormulaProfileVersionMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const previewMutation = createFormulaProfilePreviewMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const activateMutation = createFormulaProfileActivateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    const retireMutation = createFormulaProfileRetireMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    //////////////////
    // 09. Handlers //
    //////////////////
    function handleDialogOpenChange(open: boolean) {
        if (isActing) return
        profileDialogOpen = open
        if (!open) resetDraft()
    }
    function handleNewProfile() {
        resetDraft()
        profileDialogOpen = true
    }
    function handleNewVersion(profile: FormulaProfile) {
        editingSource = profile
        draft = {
            allowRenewalPrincipalChange: profile.allowRenewalPrincipalChange,
            effectiveDate: today(),
            fixedInterestAmount:
                profile.fixedInterestAmountMinor === null
                    ? ''
                    : String(profile.fixedInterestAmountMinor / 100),
            installmentCount: profile.installmentCount,
            interestMethod: profile.interestMethod,
            interestRatePercent: profile.interestRateBasisPoints / 100,
            minimumRenewalCompletedInstallments:
                profile.minimumRenewalCompletedInstallments,
            name: profile.name,
            partialCreditPolicy: profile.partialCreditPolicy,
            paymentFrequency: profile.paymentFrequency,
            renewalSettlementMethod: profile.renewalSettlementMethod,
            roundingMode: profile.roundingMode,
            termDays: profile.termDays,
            version: profile.version + 1,
        }
        preview = null
        createKey.abandonAttempt()
        profileDialogOpen = true
    }

    function handleUseDefaultExample() {
        resetDraft()
    }

    function handleInstallmentCountInput() {
        if (
            Number.isInteger(renewalInstallmentMaximum) &&
            renewalInstallmentMaximum >= 1 &&
            Number(draft.minimumRenewalCompletedInstallments) >
                renewalInstallmentMaximum
        ) {
            draft.minimumRenewalCompletedInstallments =
                renewalInstallmentMaximum
        }
    }

    async function handlePreview() {
        if (isActing) return
        const formulaProfile = toFormulaInput()
        const principalMinor = toMinorUnits(previewPrincipal)
        const totalPaidMinor = toMinorUnits(previewTotalPaid)
        if (
            !formulaProfile ||
            principalMinor === null ||
            principalMinor <= 0 ||
            totalPaidMinor === null ||
            totalPaidMinor < 0
        ) {
            toast.error('Complete the profile and enter valid preview amounts.')
            return
        }
        isActing = true
        try {
            preview = await previewMutation.mutateAsync({
                firstPaymentDate: draft.effectiveDate,
                formulaProfile,
                principalMinor,
                releaseDate: draft.effectiveDate,
                totalPaidMinor,
            })
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not preview the profile.'),
            )
        } finally {
            isActing = false
        }
    }
    async function handleSave(event: SubmitEvent) {
        event.preventDefault()
        if (isActing) return
        if (hasInvalidRenewalMinimum) {
            toast.error(
                `Minimum payments before renewal must be between 0 and ${renewalInstallmentMaximum}.`,
            )
            return
        }
        const formulaProfile = toFormulaInput()
        if (!formulaProfile) {
            toast.error('Complete all formula profile fields.')
            return
        }
        const unresolvedPayload = {
            formulaProfile,
            sourcePublicId: editingSource?.publicId ?? null,
        }
        const claim = createKey.claim(unresolvedPayload)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        const input: FormulaProfileCreateInput = {
            formulaProfile,
            idempotencyKey: claim.key,
        }
        isActing = true
        try {
            if (editingSource) {
                await versionMutation.mutateAsync({
                    input,
                    publicId: editingSource.publicId,
                })
            } else {
                await createMutation.mutateAsync(input)
            }
            createKey.confirmSuccess()
            toast.success(
                editingSource
                    ? 'Formula profile version created.'
                    : 'Formula profile created.',
            )
            profileDialogOpen = false
            resetDraft()
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not save the profile.'))
        } finally {
            isActing = false
        }
    }
    async function handleActivate(profile: FormulaProfile) {
        if (isActing) return
        isActing = true
        try {
            await activateMutation.mutateAsync({
                isDefault: true,
                publicId: profile.publicId,
            })
            toast.success('Formula profile activated as the default.')
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not activate the profile.'),
            )
        } finally {
            isActing = false
        }
    }
    async function handleRetire(profile: FormulaProfile) {
        if (isActing) return
        isActing = true
        try {
            await retireMutation.mutateAsync(profile.publicId)
            toast.success('Formula profile retired for future products.')
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not retire the profile.'))
        } finally {
            isActing = false
        }
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function today() {
        return new Date().toISOString().slice(0, 10)
    }
    function createDraft(): TFormulaDraft {
        return {
            allowRenewalPrincipalChange: false,
            effectiveDate: today(),
            fixedInterestAmount: '',
            installmentCount: 60,
            interestMethod: 'FLAT_PERCENTAGE',
            interestRatePercent: 20,
            minimumRenewalCompletedInstallments: 30,
            name: 'Sample daily loan',
            partialCreditPolicy: 'CARRY_FORWARD',
            paymentFrequency: 'DAILY',
            renewalSettlementMethod: 'COMPLETED_INSTALLMENT_BALANCE',
            roundingMode: 'HALF_UP',
            termDays: 60,
            version: 1,
        }
    }
    function resetDraft() {
        draft = createDraft()
        editingSource = null
        preview = null
        createKey.abandonAttempt()
    }
    function toFormulaInput(): FormulaProfileInput | null {
        if (!draft.name.trim()) return null
        if (hasInvalidRenewalMinimum) return null
        const common = {
            allowRenewalPrincipalChange: draft.allowRenewalPrincipalChange,
            effectiveDate: draft.effectiveDate,
            installmentCount: Number(draft.installmentCount),
            minimumRenewalCompletedInstallments: Number(
                draft.minimumRenewalCompletedInstallments,
            ),
            name: draft.name.trim(),
            partialCreditPolicy: draft.partialCreditPolicy,
            paymentFrequency: draft.paymentFrequency,
            renewalSettlementMethod: draft.renewalSettlementMethod,
            roundingMode: draft.roundingMode,
            roundingPrecision: 0 as const,
            termDays: Number(draft.termDays),
            version: Number(draft.version),
        }
        if (draft.interestMethod === 'FLAT_PERCENTAGE') {
            return {
                ...common,
                interestMethod: draft.interestMethod,
                interestRateBasisPoints: Math.round(
                    Number(draft.interestRatePercent) * 100,
                ),
            }
        }
        const fixedInterestAmountMinor = toMinorUnits(draft.fixedInterestAmount)
        if (fixedInterestAmountMinor === null || fixedInterestAmountMinor <= 0)
            return null
        return {
            ...common,
            fixedInterestAmountMinor,
            interestMethod: draft.interestMethod,
        }
    }
</script>

<Card.Root class="overflow-hidden border-border/60 shadow-sm">
    <Card.Header class="border-b border-border/50 bg-muted/20">
        <div
            class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
            <div class="flex items-start gap-3">
                <div
                    class="grid size-10 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
                >
                    <CalculatorIcon class="size-5" />
                </div>
                <div>
                    <Card.Title class="tracking-tight"
                        >Calculation formula profiles</Card.Title
                    >
                    <Card.Description>
                        Preview controlled formulas, then activate a version for
                        future loan products. Existing products and loans keep
                        their snapshots.
                    </Card.Description>
                </div>
            </div>
            <Button
                disabled={isActing}
                onclick={handleNewProfile}
                size="sm"
            >
                <PlusIcon data-icon="inline-start" /> New profile
            </Button>
        </div>
    </Card.Header>
    <Card.Content class="p-0">
        {#if profilesQuery.isPending}
            <div class="flex min-h-48 items-center justify-center">
                <Spinner />
            </div>
        {:else if profilesQuery.isError}
            <Alert.Root variant="destructive">
                <AlertCircleIcon />
                <Alert.Title>Formula profiles could not be loaded</Alert.Title>
                <Alert.Description
                    >Retry before configuring loan products.</Alert.Description
                >
                <Button
                    onclick={() => profilesQuery.refetch()}
                    size="sm"
                    variant="outline"
                >
                    <RefreshCwIcon data-icon="inline-start" /> Retry
                </Button>
            </Alert.Root>
        {:else if profiles.length === 0}
            <Empty.Root class="border">
                <Empty.Header>
                    <Empty.Media variant="icon"
                        ><FlaskConicalIcon /></Empty.Media
                    >
                    <Empty.Title>No formula profiles</Empty.Title>
                    <Empty.Description
                        >Create and preview the first controlled formula.</Empty.Description
                    >
                </Empty.Header>
            </Empty.Root>
        {:else}
            <div
                class="max-h-[min(60vh,40rem)] min-h-48 overflow-auto **:data-[slot=table-container]:overflow-visible"
            >
                <Table.Root>
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm dark:bg-[#1b1b1b]/95 [&_th]:h-9 [&_th]:px-3 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:tracking-wider [&_th]:text-zinc-500 [&_th]:uppercase dark:[&_th]:text-zinc-400"
                        ><Table.Row
                            ><Table.Head>Profile</Table.Head><Table.Head
                                >Terms</Table.Head
                            ><Table.Head>Status</Table.Head><Table.Head
                                class="text-right">Actions</Table.Head
                            ></Table.Row
                        ></Table.Header
                    >
                    <Table.Body
                        class="[&_td]:h-10 [&_td]:px-3 [&_td]:py-1.5 [&_tr]:hover:bg-amber-50/60 dark:[&_tr]:hover:bg-amber-500/5"
                    >
                        {#each profiles as profile (profile.publicId)}
                            <Table.Row
                                class="transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell
                                    ><span class="font-medium"
                                        >{profile.name}</span
                                    ><span
                                        class="block text-xs text-muted-foreground"
                                        >Version {profile.version}</span
                                    ></Table.Cell
                                >
                                <Table.Cell
                                    >{profile.paymentFrequency.toLowerCase()} · {profile.installmentCount}
                                    installments · {profile.termDays} days</Table.Cell
                                >
                                <Table.Cell>
                                    <span
                                        class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${profile.isDefault ? 'border-foreground/15 bg-foreground text-background' : profile.isActive ? 'border-border bg-muted text-foreground' : 'border-border/70 bg-background text-muted-foreground'}`}
                                    >
                                        {#if profile.isDefault}<BadgeCheckIcon
                                                class="size-3.5"
                                            />{:else}<CircleDotIcon
                                                class="size-3.5"
                                            />{/if}
                                        {profile.isDefault
                                            ? 'Default'
                                            : profile.isActive
                                              ? 'Active'
                                              : 'Inactive'}
                                    </span>
                                </Table.Cell>
                                <Table.Cell
                                    ><div class="flex justify-end gap-2">
                                        <Button
                                            disabled={isActing}
                                            onclick={() =>
                                                handleNewVersion(profile)}
                                            size="sm"
                                            variant="outline"
                                            >New version</Button
                                        >{#if !profile.isDefault}<Button
                                                disabled={isActing}
                                                onclick={() =>
                                                    handleActivate(profile)}
                                                size="sm">Activate</Button
                                            >{/if}{#if profile.isActive}<Button
                                                disabled={isActing}
                                                onclick={() =>
                                                    handleRetire(profile)}
                                                size="sm"
                                                variant="outline">Retire</Button
                                            >{/if}
                                    </div></Table.Cell
                                >
                            </Table.Row>
                        {/each}
                    </Table.Body>
                </Table.Root>
            </div>
        {/if}
    </Card.Content>
</Card.Root>
<Dialog.Root bind:open={() => profileDialogOpen, handleDialogOpenChange}>
    <Dialog.Content
        class="flex max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-7xl flex-col gap-0 overflow-hidden border-amber-200/70 bg-white p-0 shadow-2xl sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] dark:border-amber-500/20 dark:bg-[#202020]"
    >
        <form
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
            onsubmit={handleSave}
        >
            <div
                class="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 pr-12 sm:px-5 sm:py-4 sm:pr-14 dark:border-zinc-800 dark:bg-[#1b1b1b]"
            >
                <Dialog.Header class="gap-1.5 text-left">
                    <div class="flex flex-wrap items-center gap-2">
                        <Dialog.Title
                            class="text-base font-semibold tracking-tight text-zinc-950 sm:text-lg dark:text-zinc-50"
                        >
                            {editingSource
                                ? 'Create formula version'
                                : 'Create formula profile'}
                        </Dialog.Title>
                        <span
                            class="inline-flex h-6 items-center rounded-full border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold tracking-wider text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                        >
                            Immutable rules
                        </span>
                    </div>
                    <Dialog.Description
                        class="max-w-3xl text-xs/5  text-zinc-500 dark:text-zinc-400"
                    >
                        Saved rules are immutable. Changes create another
                        version.
                    </Dialog.Description>
                </Dialog.Header>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div class="grid gap-3 p-3 sm:p-4">
                    {#if !editingSource}
                        <section
                            class="flex flex-col gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/15 dark:bg-amber-500/5"
                        >
                            <div class="min-w-0">
                                <p
                                    class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                                >
                                    Default example: 60-day daily loan
                                </p>
                                <p
                                    class="mt-1 max-w-3xl text-xs/5 text-zinc-500 dark:text-zinc-400"
                                >
                                    20% flat interest, 60 payments, and renewal
                                    after 30 completed payments. Edit these
                                    values to match your policy before saving.
                                </p>
                            </div>

                            <Button
                                class="h-8 shrink-0 border-amber-300 bg-white px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
                                disabled={isActing}
                                onclick={handleUseDefaultExample}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                Use default example
                            </Button>
                        </section>
                    {/if}

                    <section
                        class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <div
                            class="border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/30"
                        >
                            <h3
                                class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                            >
                                Profile basics
                            </h3>
                            <p
                                class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400"
                            >
                                Identify this formula version and define when it
                                becomes effective.
                            </p>
                        </div>

                        <div
                            class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <Field.Field>
                                <Field.Label for="formula-name">
                                    Profile name
                                </Field.Label>
                                <Input
                                    class="h-9"
                                    id="formula-name"
                                    bind:value={draft.name}
                                    disabled={isActing ||
                                        Boolean(editingSource)}
                                    required
                                />
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="formula-version">
                                    Version
                                </Field.Label>
                                <Input
                                    class="h-9 bg-zinc-50 font-mono tabular-nums dark:bg-zinc-900"
                                    id="formula-version"
                                    bind:value={draft.version}
                                    disabled
                                    min="1"
                                    type="number"
                                />
                            </Field.Field>

                            <Field.Field class="sm:col-span-2 lg:col-span-1">
                                <Field.Label for="formula-effective">
                                    Effective date
                                </Field.Label>
                                <Input
                                    class="h-9"
                                    id="formula-effective"
                                    bind:value={draft.effectiveDate}
                                    disabled={isActing}
                                    required
                                    type="date"
                                />
                            </Field.Field>
                        </div>
                    </section>

                    <section
                        class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <div
                            class="border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/30"
                        >
                            <h3
                                class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                            >
                                Interest and payment schedule
                            </h3>
                            <p
                                class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400"
                            >
                                Configure how interest is calculated and how
                                repayment is scheduled.
                            </p>
                        </div>

                        <div
                            class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <Field.Field>
                                <Field.Label for="formula-interest-method">
                                    Interest method
                                </Field.Label>
                                <NativeSelect.Root
                                    class="h-9 text-sm"
                                    id="formula-interest-method"
                                    bind:value={draft.interestMethod}
                                    disabled={isActing}
                                >
                                    <NativeSelect.Option
                                        value="FLAT_PERCENTAGE"
                                    >
                                        Flat percentage
                                    </NativeSelect.Option>
                                    <NativeSelect.Option value="FIXED_AMOUNT">
                                        Fixed amount
                                    </NativeSelect.Option>
                                </NativeSelect.Root>
                            </Field.Field>

                            {#if draft.interestMethod === 'FLAT_PERCENTAGE'}
                                <Field.Field>
                                    <Field.Label for="formula-rate">
                                        Interest rate (%)
                                    </Field.Label>
                                    <Input
                                        class="h-9 font-mono tabular-nums"
                                        id="formula-rate"
                                        bind:value={draft.interestRatePercent}
                                        disabled={isActing}
                                        min="0"
                                        required
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>
                            {:else}
                                <Field.Field>
                                    <Field.Label for="formula-fixed-interest">
                                        Fixed interest (PHP)
                                    </Field.Label>
                                    <Input
                                        class="h-9 font-mono tabular-nums"
                                        id="formula-fixed-interest"
                                        bind:value={draft.fixedInterestAmount}
                                        disabled={isActing}
                                        min="0.01"
                                        required
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>
                            {/if}

                            <Field.Field>
                                <Field.Label for="formula-term">
                                    Term days
                                </Field.Label>
                                <Input
                                    class="h-9 font-mono tabular-nums"
                                    id="formula-term"
                                    bind:value={draft.termDays}
                                    disabled={isActing}
                                    min="1"
                                    required
                                    type="number"
                                />
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="formula-frequency">
                                    Payment frequency
                                </Field.Label>
                                <NativeSelect.Root
                                    class="h-9 text-sm"
                                    id="formula-frequency"
                                    bind:value={draft.paymentFrequency}
                                    disabled={isActing}
                                >
                                    <NativeSelect.Option value="DAILY">
                                        Daily
                                    </NativeSelect.Option>
                                    <NativeSelect.Option value="WEEKLY">
                                        Weekly
                                    </NativeSelect.Option>
                                    <NativeSelect.Option value="MONTHLY">
                                        Monthly
                                    </NativeSelect.Option>
                                </NativeSelect.Root>
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="formula-installments">
                                    Installment count
                                </Field.Label>
                                <Input
                                    class="h-9 font-mono tabular-nums"
                                    id="formula-installments"
                                    bind:value={draft.installmentCount}
                                    disabled={isActing}
                                    min="1"
                                    oninput={handleInstallmentCountInput}
                                    required
                                    type="number"
                                />
                            </Field.Field>
                        </div>
                    </section>

                    <section
                        class="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <div
                            class="border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/30"
                        >
                            <h3
                                class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                            >
                                Renewal policy
                            </h3>
                            <p
                                class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400"
                            >
                                Define renewal eligibility, settlement behavior,
                                and partial-payment handling.
                            </p>
                        </div>

                        <div class="grid gap-3 p-4 lg:grid-cols-2">
                            <Field.Field>
                                <Field.Label for="formula-min-renewal">
                                    Minimum payments before renewal
                                </Field.Label>
                                <Input
                                    aria-invalid={hasInvalidRenewalMinimum}
                                    class="h-9 font-mono tabular-nums"
                                    id="formula-min-renewal"
                                    bind:value={
                                        draft.minimumRenewalCompletedInstallments
                                    }
                                    disabled={isActing}
                                    min="0"
                                    max={renewalInstallmentMaximum}
                                    required
                                    type="number"
                                />
                                <Field.Description class="text-[11px]/4 ">
                                    Enter 0–{renewalInstallmentMaximum}.
                                    Example: 30 means 30 of {renewalInstallmentMaximum}
                                    payments must be completed before renewal.
                                </Field.Description>

                                {#if hasInvalidRenewalMinimum}
                                    <Field.Error>
                                        Cannot be higher than the installment
                                        count.
                                    </Field.Error>
                                {/if}
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="formula-settlement">
                                    Old loan balance to settle
                                </Field.Label>
                                <NativeSelect.Root
                                    class="h-9 text-sm"
                                    id="formula-settlement"
                                    bind:value={draft.renewalSettlementMethod}
                                    disabled={isActing}
                                >
                                    <NativeSelect.Option
                                        value="COMPLETED_INSTALLMENT_BALANCE"
                                    >
                                        Full remaining installments
                                    </NativeSelect.Option>
                                    <NativeSelect.Option
                                        value="EXACT_OUTSTANDING_BALANCE"
                                    >
                                        Actual unpaid balance
                                    </NativeSelect.Option>
                                </NativeSelect.Root>

                                <Field.Description class="text-[11px]/4 ">
                                    This is paid from the new loan before cash
                                    is released. {settlementDescriptions[
                                        draft.renewalSettlementMethod
                                    ]}
                                </Field.Description>
                            </Field.Field>

                            <Field.Field class="lg:col-span-2">
                                <Field.Label for="formula-credit">
                                    What to do with a partial payment
                                </Field.Label>
                                <NativeSelect.Root
                                    class="h-9 text-sm"
                                    id="formula-credit"
                                    bind:value={draft.partialCreditPolicy}
                                    disabled={isActing}
                                >
                                    <NativeSelect.Option value="CARRY_FORWARD">
                                        Use on the new loan
                                    </NativeSelect.Option>
                                    <NativeSelect.Option
                                        value="APPLY_TO_SETTLEMENT"
                                    >
                                        Deduct from the old loan balance
                                    </NativeSelect.Option>
                                    <NativeSelect.Option value="REFUND">
                                        Refund to the borrower
                                    </NativeSelect.Option>
                                    <NativeSelect.Option value="MANUAL_REVIEW">
                                        Pause for manual review
                                    </NativeSelect.Option>
                                </NativeSelect.Root>

                                <Field.Description class="text-[11px]/4 ">
                                    A partial payment is money paid toward an
                                    installment that is not yet complete. {partialCreditDescriptions[
                                        draft.partialCreditPolicy
                                    ]}
                                </Field.Description>

                                {#if draft.renewalSettlementMethod === 'EXACT_OUTSTANDING_BALANCE' && (draft.partialCreditPolicy === 'CARRY_FORWARD' || draft.partialCreditPolicy === 'REFUND')}
                                    <Field.Description
                                        class="rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-[11px]/4  text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300"
                                    >
                                        The actual unpaid balance already
                                        deducts this payment. This choice also {draft.partialCreditPolicy ===
                                        'REFUND'
                                            ? 'refunds it'
                                            : 'applies it to the new loan'} separately.
                                    </Field.Description>
                                {/if}
                            </Field.Field>

                            <label
                                class="flex min-h-12 items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 text-xs font-medium text-zinc-800 lg:col-span-2 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200"
                            >
                                <span>
                                    <span class="block font-semibold">
                                        Allow renewal principal changes
                                    </span>
                                    <span
                                        class="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400"
                                    >
                                        Permit the renewed loan principal to
                                        differ from the previous loan.
                                    </span>
                                </span>

                                <input
                                    class="size-4 shrink-0 accent-amber-500"
                                    bind:checked={
                                        draft.allowRenewalPrincipalChange
                                    }
                                    disabled={isActing}
                                    type="checkbox"
                                />
                            </label>
                        </div>
                    </section>

                    <Card.Root
                        class="overflow-hidden border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]"
                    >
                        <Card.Header
                            class="border-b border-zinc-100 bg-amber-50/40 px-4 py-3 dark:border-zinc-800 dark:bg-amber-500/5"
                        >
                            <Card.Title class="text-sm font-semibold">
                                Formula preview
                            </Card.Title>
                            <Card.Description class="text-xs">
                                Uses the same server calculation engine as loan
                                origination.
                            </Card.Description>
                        </Card.Header>

                        <Card.Content class="grid gap-3 p-4">
                            <div
                                class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
                            >
                                <Field.Field>
                                    <Field.Label for="preview-principal">
                                        Principal (PHP)
                                    </Field.Label>
                                    <Input
                                        class="h-9 font-mono tabular-nums"
                                        id="preview-principal"
                                        bind:value={previewPrincipal}
                                        disabled={isActing}
                                        min="0.01"
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>

                                <Field.Field>
                                    <Field.Label for="preview-paid">
                                        Total paid (PHP)
                                    </Field.Label>
                                    <Input
                                        class="h-9 font-mono tabular-nums"
                                        id="preview-paid"
                                        bind:value={previewTotalPaid}
                                        disabled={isActing}
                                        min="0"
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>

                                <Button
                                    class="h-9 w-full border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 sm:col-span-2 lg:col-span-1 lg:w-auto dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
                                    disabled={isActing}
                                    onclick={handlePreview}
                                    type="button"
                                    variant="outline"
                                >
                                    <FlaskConicalIcon
                                        class="size-3.5"
                                        data-icon="inline-start"
                                    />
                                    Run preview
                                </Button>
                            </div>

                            {#if preview}
                                <dl
                                    class="grid overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 text-xs sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800"
                                >
                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Interest
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.interestAmountMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div
                                        class="border-t border-zinc-200 bg-white p-3 sm:border-t-0 sm:border-l dark:border-zinc-800 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Total payable
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.totalPayableMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div
                                        class="border-t border-zinc-200 bg-white p-3 lg:border-t-0 lg:border-l dark:border-zinc-800 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Installment
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.installmentAmountMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div
                                        class="border-t border-zinc-200 bg-white p-3 sm:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Completed
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {preview.completedInstallmentCount}
                                        </dd>
                                    </div>

                                    <div
                                        class="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Partial credit
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.partialPaymentCreditMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div
                                        class="border-t border-zinc-200 bg-white p-3 sm:border-l dark:border-zinc-800 dark:bg-[#202020]"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Renewal settlement
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.renewalSettlementBalanceMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div
                                        class="border-t border-amber-200 bg-amber-50/70 p-3 lg:border-l dark:border-amber-500/20 dark:bg-amber-500/5"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                        >
                                            Renewal cash release
                                        </dt>
                                        <dd
                                            class="mt-1 font-mono font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
                                        >
                                            {formatCurrency(
                                                preview.renewalCashReleaseMinor,
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                            {/if}
                        </Card.Content>
                    </Card.Root>
                </div>
            </div>

            <Dialog.Footer
                class="shrink-0 border-t border-zinc-200 bg-zinc-50/95 p-3 sm:flex-row sm:px-5 dark:border-zinc-800 dark:bg-[#1b1b1b]"
            >
                <div
                    class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end"
                >
                    <Button
                        class="h-9 w-full sm:w-auto"
                        disabled={isActing}
                        onclick={() => handleDialogOpenChange(false)}
                        type="button"
                        variant="outline"
                    >
                        Cancel
                    </Button>

                    <Button
                        class="h-9 w-full bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 sm:w-auto dark:bg-amber-400 dark:hover:bg-amber-300"
                        disabled={isActing}
                        type="submit"
                    >
                        {#if isActing}
                            <Spinner data-icon="inline-start" />
                        {/if}
                        Save immutable version
                    </Button>
                </div>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
