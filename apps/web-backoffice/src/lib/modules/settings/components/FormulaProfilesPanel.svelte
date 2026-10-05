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
            <div class="overflow-x-auto">
                <Table.Root>
                    <Table.Header
                        ><Table.Row
                            ><Table.Head>Profile</Table.Head><Table.Head
                                >Terms</Table.Head
                            ><Table.Head>Status</Table.Head><Table.Head
                                class="text-right">Actions</Table.Head
                            ></Table.Row
                        ></Table.Header
                    >
                    <Table.Body>
                        {#each profiles as profile (profile.publicId)}
                            <Table.Row
                                class="transition-colors hover:bg-muted/20"
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
        class="max-h-[94vh] max-w-5xl overflow-y-auto border-border/70 p-0 shadow-2xl"
    >
        <form
            class="grid gap-0"
            onsubmit={handleSave}
        >
            <div class="border-b border-border/60 bg-muted/20 p-6">
                <Dialog.Header
                    ><Dialog.Title
                        >{editingSource
                            ? 'Create formula version'
                            : 'Create formula profile'}</Dialog.Title
                    ><Dialog.Description
                        >Saved rules are immutable. Changes create another
                        version.</Dialog.Description
                    ></Dialog.Header
                >
            </div>
            <div class="grid gap-6 p-6">
                {#if !editingSource}<div
                        class="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div class="grid gap-1">
                            <p class="text-sm font-medium">
                                Default example: 60-day daily loan
                            </p>
                            <p class="text-sm text-muted-foreground">
                                20% flat interest, 60 payments, and renewal
                                after 30 completed payments. Edit these values
                                to match your policy before saving.
                            </p>
                        </div>
                        <Button
                            disabled={isActing}
                            onclick={handleUseDefaultExample}
                            type="button"
                            variant="outline">Use default example</Button
                        >
                    </div>{/if}
                <div
                    class="grid gap-4 rounded-2xl border border-border/60 bg-background p-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                    <Field.Field
                        ><Field.Label for="formula-name"
                            >Profile name</Field.Label
                        ><Input
                            id="formula-name"
                            bind:value={draft.name}
                            disabled={isActing || Boolean(editingSource)}
                            required
                        /></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-version">Version</Field.Label
                        ><Input
                            id="formula-version"
                            bind:value={draft.version}
                            disabled
                            min="1"
                            type="number"
                        /></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-effective"
                            >Effective date</Field.Label
                        ><Input
                            id="formula-effective"
                            bind:value={draft.effectiveDate}
                            disabled={isActing}
                            required
                            type="date"
                        /></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-interest-method"
                            >Interest method</Field.Label
                        ><NativeSelect.Root
                            id="formula-interest-method"
                            bind:value={draft.interestMethod}
                            disabled={isActing}
                            ><NativeSelect.Option value="FLAT_PERCENTAGE"
                                >Flat percentage</NativeSelect.Option
                            ><NativeSelect.Option value="FIXED_AMOUNT"
                                >Fixed amount</NativeSelect.Option
                            ></NativeSelect.Root
                        ></Field.Field
                    >
                    {#if draft.interestMethod === 'FLAT_PERCENTAGE'}<Field.Field
                            ><Field.Label for="formula-rate"
                                >Interest rate (%)</Field.Label
                            ><Input
                                id="formula-rate"
                                bind:value={draft.interestRatePercent}
                                disabled={isActing}
                                min="0"
                                required
                                step="0.01"
                                type="number"
                            /></Field.Field
                        >{:else}<Field.Field
                            ><Field.Label for="formula-fixed-interest"
                                >Fixed interest (PHP)</Field.Label
                            ><Input
                                id="formula-fixed-interest"
                                bind:value={draft.fixedInterestAmount}
                                disabled={isActing}
                                min="0.01"
                                required
                                step="0.01"
                                type="number"
                            /></Field.Field
                        >{/if}
                    <Field.Field
                        ><Field.Label for="formula-term">Term days</Field.Label
                        ><Input
                            id="formula-term"
                            bind:value={draft.termDays}
                            disabled={isActing}
                            min="1"
                            required
                            type="number"
                        /></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-frequency"
                            >Payment frequency</Field.Label
                        ><NativeSelect.Root
                            id="formula-frequency"
                            bind:value={draft.paymentFrequency}
                            disabled={isActing}
                            ><NativeSelect.Option value="DAILY"
                                >Daily</NativeSelect.Option
                            ><NativeSelect.Option value="WEEKLY"
                                >Weekly</NativeSelect.Option
                            ><NativeSelect.Option value="MONTHLY"
                                >Monthly</NativeSelect.Option
                            ></NativeSelect.Root
                        ></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-installments"
                            >Installment count</Field.Label
                        ><Input
                            id="formula-installments"
                            bind:value={draft.installmentCount}
                            disabled={isActing}
                            min="1"
                            oninput={handleInstallmentCountInput}
                            required
                            type="number"
                        /></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-min-renewal"
                            >Minimum payments before renewal</Field.Label
                        ><Input
                            aria-invalid={hasInvalidRenewalMinimum}
                            id="formula-min-renewal"
                            bind:value={
                                draft.minimumRenewalCompletedInstallments
                            }
                            disabled={isActing}
                            min="0"
                            max={renewalInstallmentMaximum}
                            required
                            type="number"
                        /><Field.Description
                            >Enter 0–{renewalInstallmentMaximum}. Example: 30
                            means 30 of {renewalInstallmentMaximum} payments must
                            be completed before renewal.</Field.Description
                        >{#if hasInvalidRenewalMinimum}<Field.Error
                                >Cannot be higher than the installment count.</Field.Error
                            >{/if}</Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-settlement"
                            >Renewal settlement</Field.Label
                        ><NativeSelect.Root
                            id="formula-settlement"
                            bind:value={draft.renewalSettlementMethod}
                            disabled={isActing}
                            ><NativeSelect.Option
                                value="COMPLETED_INSTALLMENT_BALANCE"
                                >Completed-installment balance</NativeSelect.Option
                            ><NativeSelect.Option
                                value="EXACT_OUTSTANDING_BALANCE"
                                >Exact outstanding balance</NativeSelect.Option
                            ></NativeSelect.Root
                        ></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-credit"
                            >Partial credit policy</Field.Label
                        ><NativeSelect.Root
                            id="formula-credit"
                            bind:value={draft.partialCreditPolicy}
                            disabled={isActing}
                            ><NativeSelect.Option value="CARRY_FORWARD"
                                >Carry forward</NativeSelect.Option
                            ><NativeSelect.Option value="APPLY_TO_SETTLEMENT"
                                >Apply to settlement</NativeSelect.Option
                            ><NativeSelect.Option value="REFUND"
                                >Refund</NativeSelect.Option
                            ><NativeSelect.Option value="MANUAL_REVIEW"
                                >Manual review</NativeSelect.Option
                            ></NativeSelect.Root
                        ></Field.Field
                    >
                    <Field.Field
                        ><Field.Label for="formula-rounding"
                            >Rounding</Field.Label
                        ><NativeSelect.Root
                            id="formula-rounding"
                            bind:value={draft.roundingMode}
                            disabled={isActing}
                            ><NativeSelect.Option value="HALF_UP"
                                >Half up</NativeSelect.Option
                            ><NativeSelect.Option value="DOWN"
                                >Down</NativeSelect.Option
                            ><NativeSelect.Option value="UP"
                                >Up</NativeSelect.Option
                            ></NativeSelect.Root
                        ></Field.Field
                    >
                </div>
                <label
                    class="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 px-4 text-sm font-medium"
                    >Allow renewal principal changes<input
                        bind:checked={draft.allowRenewalPrincipalChange}
                        disabled={isActing}
                        type="checkbox"
                    /></label
                >
                <Card.Root class="overflow-hidden border-border/60 shadow-none"
                    ><Card.Header class="border-b border-border/50 bg-muted/20"
                        ><Card.Title>Formula preview</Card.Title
                        ><Card.Description
                            >Uses the same server calculation engine as loan
                            origination.</Card.Description
                        ></Card.Header
                    ><Card.Content class="grid gap-4"
                        ><div class="grid gap-4 sm:grid-cols-2">
                            <Field.Field
                                ><Field.Label for="preview-principal"
                                    >Principal (PHP)</Field.Label
                                ><Input
                                    id="preview-principal"
                                    bind:value={previewPrincipal}
                                    disabled={isActing}
                                    min="0.01"
                                    step="0.01"
                                    type="number"
                                /></Field.Field
                            ><Field.Field
                                ><Field.Label for="preview-paid"
                                    >Total paid (PHP)</Field.Label
                                ><Input
                                    id="preview-paid"
                                    bind:value={previewTotalPaid}
                                    disabled={isActing}
                                    min="0"
                                    step="0.01"
                                    type="number"
                                /></Field.Field
                            >
                        </div>
                        <Button
                            disabled={isActing}
                            onclick={handlePreview}
                            type="button"
                            variant="outline"
                            ><FlaskConicalIcon data-icon="inline-start" /> Run preview</Button
                        >{#if preview}<dl
                                class="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3"
                            >
                                <div>
                                    <dt class="text-muted-foreground">
                                        Interest
                                    </dt>
                                    <dd class="font-medium">
                                        {formatCurrency(
                                            preview.interestAmountMinor,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-muted-foreground">
                                        Total payable
                                    </dt>
                                    <dd class="font-medium">
                                        {formatCurrency(
                                            preview.totalPayableMinor,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-muted-foreground">
                                        Installment
                                    </dt>
                                    <dd class="font-medium">
                                        {formatCurrency(
                                            preview.installmentAmountMinor,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-muted-foreground">
                                        Completed
                                    </dt>
                                    <dd class="font-medium">
                                        {preview.completedInstallmentCount}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-muted-foreground">
                                        Partial credit
                                    </dt>
                                    <dd class="font-medium">
                                        {formatCurrency(
                                            preview.partialPaymentCreditMinor,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-muted-foreground">
                                        Renewal settlement
                                    </dt>
                                    <dd class="font-medium">
                                        {formatCurrency(
                                            preview.renewalSettlementBalanceMinor,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-muted-foreground">
                                        Renewal cash release
                                    </dt>
                                    <dd class="font-medium">
                                        {formatCurrency(
                                            preview.renewalCashReleaseMinor,
                                        )}
                                    </dd>
                                </div>
                            </dl>{/if}</Card.Content
                    ></Card.Root
                >
            </div>
            <Dialog.Footer
                class="border-t border-border/60 bg-muted/20 p-5 sm:px-6"
                ><Button
                    disabled={isActing}
                    onclick={() => handleDialogOpenChange(false)}
                    type="button"
                    variant="outline">Cancel</Button
                ><Button
                    disabled={isActing}
                    type="submit"
                    >{#if isActing}<Spinner data-icon="inline-start" />{/if}Save
                    immutable version</Button
                ></Dialog.Footer
            >
        </form>
    </Dialog.Content>
</Dialog.Root>
