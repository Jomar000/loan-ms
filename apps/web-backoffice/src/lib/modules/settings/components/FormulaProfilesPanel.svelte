<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Dialog from '@loanms/ui/components/dialog'
    import * as Empty from '@loanms/ui/components/empty'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Spinner } from '@loanms/ui/components/spinner'
    import * as Table from '@loanms/ui/components/table'
    import { FormFieldLabel } from '@loanms/ui/shared/form-field-label'
    import { calculationFormulaProfileInputSchema } from '@loanms/validator/backoffice/loanCalculation'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import CalculatorIcon from '@lucide/svelte/icons/calculator'
    import FlaskConicalIcon from '@lucide/svelte/icons/flask-conical'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw'
    import { toast } from 'svelte-sonner'

    import StatusBadge from '$lib/components/dataWorkspace/StatusBadge.svelte'
    import { useSessionContext } from '$lib/states/session'
    import {
        getErrorMessage,
        getUserFacingSaveErrorMessage,
    } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import { formatCurrency, toMinorUnits } from '../../loan/utilities/format'
    import {
        createFormulaProfileActivateMutation,
        createFormulaProfileCreateMutation,
        createFormulaProfileDeleteMutation,
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

    const collectionHelp =
        'Keeps this collection amount for each payment. Each new loan uses its own principal and interest to calculate the term. The final payment covers the remaining balance.'

    const renewalPrincipalHelp =
        'Permit the renewed loan principal to differ from the previous loan.'

    ///////////////
    // 03. State //
    ///////////////

    let draft = $state(createDraft())
    let deletingProfile = $state<FormulaProfile | null>(null)
    let editingSource = $state<FormulaProfile | null>(null)
    let isActing = $state(false)
    let profileDialogOpen = $state(false)
    let saveError = $state<string | null>(null)
    let preview = $state<FormulaProfilePreview | null>(null)
    let previewPrincipal = $state('7000')
    let previewTotalPaid = $state('4000')
    let scheduleMode = $state<'MANUAL' | 'COLLECTION'>('MANUAL')
    let collectionAmount = $state('')
    let termLength = $state(60)
    let legacyTermInDays = $state(false)

    /////////////////
    // 04. Derived //
    /////////////////

    const generatedTerm = $derived(calculateGeneratedTerm())

    const generatedTermDays = $derived(
        generatedTerm === null
            ? null
            : generatedTerm * termDaysPerUnit(draft.paymentFrequency),
    )

    const renewalInstallmentMaximum = $derived(
        Math.max(0, generatedTerm ?? (Number(draft.installmentCount) || 0)),
    )

    const hasInvalidRenewalMinimum = $derived(
        Number(draft.minimumRenewalCompletedInstallments) >
            renewalInstallmentMaximum,
    )

    const termUnit = $derived(
        (legacyTermInDays && scheduleMode === 'MANUAL') ||
            draft.paymentFrequency === 'DAILY'
            ? 'day'
            : draft.paymentFrequency === 'WEEKLY'
              ? 'week'
              : 'month',
    )

    const termHelp = $derived(
        scheduleMode === 'COLLECTION'
            ? 'The term is calculated from the principal, interest, and collection per payment. Monthly terms use 30 accounting days per month, while due dates follow calendar months.'
            : 'Set the repayment length and installment count. Monthly terms use 30 accounting days per month, while due dates follow calendar months.',
    )

    const renewalMinimumHelp = $derived(
        `Set how many installments must be complete before renewal. Enter 0 to ${renewalInstallmentMaximum}.`,
    )

    const settlementHelp = $derived(
        `This is paid from the new loan before cash is released. ${settlementDescriptions[draft.renewalSettlementMethod]}`,
    )

    const partialCreditHelp = $derived(
        `A partial payment is money paid toward an installment that is not yet complete. ${partialCreditDescriptions[draft.partialCreditPolicy]}${
            draft.renewalSettlementMethod === 'EXACT_OUTSTANDING_BALANCE' &&
            (draft.partialCreditPolicy === 'CARRY_FORWARD' ||
                draft.partialCreditPolicy === 'REFUND')
                ? ` The actual unpaid balance already deducts this payment. This choice also ${
                      draft.partialCreditPolicy === 'REFUND'
                          ? 'refunds it'
                          : 'applies it to the new loan'
                  } separately.`
                : ''
        }`,
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

    const deleteMutation = createFormulaProfileDeleteMutation({
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

        if (!open) {
            saveError = null
            resetDraft()
        }
    }

    function handleSaveErrorOpenChange(open: boolean) {
        if (!open) saveError = null
    }

    function handleDeleteOpenChange(open: boolean) {
        if (!open && !isActing) deletingProfile = null
    }

    function handleNewProfile() {
        resetDraft()
        profileDialogOpen = true
    }

    function handleNewVersion(profile: FormulaProfile) {
        editingSource = profile
        scheduleMode = profile.collectionAmountMinor ? 'COLLECTION' : 'MANUAL'
        collectionAmount = profile.collectionAmountMinor
            ? String(profile.collectionAmountMinor / 100)
            : ''

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

        const daysPerUnit = termDaysPerUnit(profile.paymentFrequency)

        legacyTermInDays = profile.termDays % daysPerUnit !== 0

        termLength = legacyTermInDays
            ? profile.termDays
            : profile.termDays / daysPerUnit

        preview = null
        createKey.abandonAttempt()
        profileDialogOpen = true
    }

    function handleUseDefaultExample() {
        resetDraft()
    }

    function handleScheduleModeChange(event: Event) {
        scheduleMode = (event.currentTarget as HTMLSelectElement)
            .value as typeof scheduleMode

        handleCalculationChange()
    }

    function handleCalculationChange() {
        preview = null
        createKey.abandonAttempt()
    }

    function handleInstallmentCountInput() {
        handleCalculationChange()

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

    function handlePaymentFrequencyChange(event: Event) {
        handleCalculationChange()

        draft.paymentFrequency = (event.currentTarget as HTMLSelectElement)
            .value as TFormulaDraft['paymentFrequency']

        legacyTermInDays = false

        const daysPerUnit = termDaysPerUnit(draft.paymentFrequency)

        termLength = Math.max(1, Math.round(draft.termDays / daysPerUnit))

        draft.termDays = termLength * daysPerUnit
        draft.installmentCount = termLength

        handleInstallmentCountInput()
    }

    function handleTermLengthInput(event: Event) {
        handleCalculationChange()

        termLength = (event.currentTarget as HTMLInputElement).valueAsNumber

        draft.termDays =
            termLength *
            (legacyTermInDays ? 1 : termDaysPerUnit(draft.paymentFrequency))

        if (draft.paymentFrequency !== 'DAILY' && !legacyTermInDays) {
            draft.installmentCount = termLength
            handleInstallmentCountInput()
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
            saveError = `Minimum payments before renewal must be between 0 and ${renewalInstallmentMaximum}.`
            return
        }

        const formulaProfile = toFormulaInput()

        if (!formulaProfile) {
            saveError =
                'Please complete the formula profile fields and try again.'
            return
        }

        const unresolvedPayload = {
            formulaProfile,
            sourcePublicId: editingSource?.publicId ?? null,
        }

        const claim = createKey.claim(unresolvedPayload)

        if (!claim.ok) {
            saveError =
                'Please try again with the same details. We could not confirm the previous request.'
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
            saveError = getUserFacingSaveErrorMessage(error, {
                invalid:
                    'Please review the formula profile details and try again.',
                network:
                    'We could not confirm whether the profile was saved. Check the profile list before trying again.',
                unexpected:
                    'Something went wrong while saving. Check the profile list before trying again.',
            })
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

    async function handleDelete() {
        if (isActing || !deletingProfile) return

        isActing = true

        try {
            await deleteMutation.mutateAsync(deletingProfile.publicId)

            deletingProfile = null

            toast.success('Formula profile deleted.')
        } catch (error) {
            toast.error(getErrorMessage(error, 'Could not delete the profile.'))
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

    function termDaysPerUnit(frequency: TFormulaDraft['paymentFrequency']) {
        return frequency === 'WEEKLY' ? 7 : frequency === 'MONTHLY' ? 30 : 1
    }

    function calculateGeneratedTerm(): number | null {
        if (scheduleMode !== 'COLLECTION' || !String(collectionAmount).trim()) {
            return null
        }

        const principalMinor = toMinorUnits(previewPrincipal)
        const collectionMinor = toMinorUnits(collectionAmount)

        if (!principalMinor || !collectionMinor || collectionMinor <= 0) {
            return null
        }

        let interestMinor: number

        if (draft.interestMethod === 'FIXED_AMOUNT') {
            const fixedMinor = toMinorUnits(draft.fixedInterestAmount)

            if (fixedMinor === null || fixedMinor <= 0) {
                return null
            }

            interestMinor = fixedMinor
        } else {
            const basisPoints = Number(draft.interestRatePercent) * 100

            if (
                !Number.isInteger(basisPoints) ||
                basisPoints < 0 ||
                basisPoints > 100_000
            ) {
                return null
            }

            const numerator = principalMinor * basisPoints

            if (!Number.isSafeInteger(numerator)) {
                return null
            }

            interestMinor =
                draft.roundingMode === 'DOWN'
                    ? Math.floor(numerator / 10_000)
                    : draft.roundingMode === 'UP'
                      ? Math.ceil(numerator / 10_000)
                      : Math.floor((numerator + 5_000) / 10_000)
        }

        const totalMinor = principalMinor + interestMinor
        const count = Math.ceil(totalMinor / collectionMinor)
        const days = count * termDaysPerUnit(draft.paymentFrequency)

        return Number.isSafeInteger(totalMinor) &&
            count >= 1 &&
            count <= 3_660 &&
            days <= 3_660
            ? count
            : null
    }

    function formatTerm(
        termDays: number,
        frequency: TFormulaDraft['paymentFrequency'],
    ) {
        const daysPerUnit = termDaysPerUnit(frequency)
        const useDays = termDays % daysPerUnit !== 0
        const count = useDays ? termDays : termDays / daysPerUnit

        const unit =
            useDays || frequency === 'DAILY'
                ? 'day'
                : frequency === 'WEEKLY'
                  ? 'week'
                  : 'month'

        return `${count} ${unit}${count === 1 ? '' : 's'}`
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
        scheduleMode = 'MANUAL'
        collectionAmount = ''
        termLength = draft.termDays
        legacyTermInDays = false
        editingSource = null
        preview = null
        createKey.abandonAttempt()
    }

    function toFormulaInput(): FormulaProfileInput | null {
        if (!draft.name.trim()) return null

        if (scheduleMode === 'COLLECTION' && generatedTerm === null) {
            return null
        }

        if (hasInvalidRenewalMinimum) return null

        const common = {
            allowRenewalPrincipalChange: draft.allowRenewalPrincipalChange,
            collectionAmountMinor:
                scheduleMode === 'COLLECTION'
                    ? toMinorUnits(collectionAmount)
                    : null,
            effectiveDate: draft.effectiveDate,
            installmentCount: generatedTerm ?? Number(draft.installmentCount),
            minimumRenewalCompletedInstallments: Number(
                draft.minimumRenewalCompletedInstallments,
            ),
            name: draft.name.trim(),
            partialCreditPolicy: draft.partialCreditPolicy,
            paymentFrequency: draft.paymentFrequency,
            renewalSettlementMethod: draft.renewalSettlementMethod,
            roundingMode: draft.roundingMode,
            roundingPrecision: 0 as const,
            termDays: generatedTermDays ?? Number(draft.termDays),
            version: Number(draft.version),
        }

        if (draft.interestMethod === 'FLAT_PERCENTAGE') {
            const result = calculationFormulaProfileInputSchema.safeParse({
                ...common,
                interestMethod: draft.interestMethod,
                interestRateBasisPoints: Math.round(
                    Number(draft.interestRatePercent) * 100,
                ),
            })

            return result.success ? result.data : null
        }

        const fixedInterestAmountMinor = toMinorUnits(draft.fixedInterestAmount)

        if (
            fixedInterestAmountMinor === null ||
            fixedInterestAmountMinor <= 0
        ) {
            return null
        }

        const result = calculationFormulaProfileInputSchema.safeParse({
            ...common,
            fixedInterestAmountMinor,
            interestMethod: draft.interestMethod,
        })

        return result.success ? result.data : null
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
                    <Card.Title class="tracking-tight">
                        Calculation formula profiles
                    </Card.Title>

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
                <PlusIcon data-icon="inline-start" />
                New profile
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

                <Alert.Description>
                    Retry before configuring loan products.
                </Alert.Description>

                <Button
                    onclick={() => profilesQuery.refetch()}
                    size="sm"
                    variant="outline"
                >
                    <RefreshCwIcon data-icon="inline-start" />
                    Retry
                </Button>
            </Alert.Root>
        {:else if profiles.length === 0}
            <Empty.Root class="border">
                <Empty.Header>
                    <Empty.Media variant="icon">
                        <FlaskConicalIcon />
                    </Empty.Media>

                    <Empty.Title>No formula profiles</Empty.Title>

                    <Empty.Description>
                        Create and preview the first controlled formula.
                    </Empty.Description>
                </Empty.Header>
            </Empty.Root>
        {:else}
            <div class="max-h-[min(60vh,40rem)] min-h-48 table-scroll">
                <Table.Root>
                    <Table.Header
                        class="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm
                        dark:bg-[#1b1b1b]/95
                        [&_th]:h-9
                        [&_th]:px-3
                        [&_th]:text-[10px]
                        [&_th]:font-semibold
                        [&_th]:tracking-wider
                        [&_th]:text-zinc-500
                        [&_th]:uppercase
                        dark:[&_th]:text-zinc-400"
                    >
                        <Table.Row>
                            <Table.Head>Profile</Table.Head>
                            <Table.Head>Terms</Table.Head>
                            <Table.Head>Status</Table.Head>
                            <Table.Head class="text-right">Actions</Table.Head>
                        </Table.Row>
                    </Table.Header>

                    <Table.Body
                        class="[&_td]:h-10
                        [&_td]:px-3
                        [&_td]:py-1.5"
                    >
                        {#each profiles as profile (profile.publicId)}
                            <Table.Row
                                class="transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-500/5"
                            >
                                <Table.Cell>
                                    <span class="font-medium">
                                        {profile.name}
                                    </span>

                                    <span
                                        class="block text-xs text-muted-foreground"
                                    >
                                        Version {profile.version}
                                    </span>
                                </Table.Cell>

                                <Table.Cell>
                                    {profile.paymentFrequency.toLowerCase()}
                                    · {profile.installmentCount}
                                    installments · {formatTerm(
                                        profile.termDays,
                                        profile.paymentFrequency,
                                    )}
                                </Table.Cell>

                                <Table.Cell>
                                    <StatusBadge
                                        status={profile.isDefault
                                            ? 'DEFAULT'
                                            : profile.isActive
                                              ? 'ACTIVE'
                                              : 'INACTIVE'}
                                        label={profile.isDefault
                                            ? 'Default'
                                            : profile.isActive
                                              ? 'Active'
                                              : 'Inactive'}
                                    />
                                </Table.Cell>

                                <Table.Cell>
                                    <div class="flex justify-end gap-2">
                                        <Button
                                            disabled={isActing}
                                            onclick={() =>
                                                handleNewVersion(profile)}
                                            size="sm"
                                            variant="outline"
                                        >
                                            New version
                                        </Button>

                                        {#if !profile.isDefault}
                                            <Button
                                                disabled={isActing}
                                                onclick={() =>
                                                    handleActivate(profile)}
                                                size="sm"
                                            >
                                                Activate
                                            </Button>
                                        {/if}

                                        {#if profile.isActive}
                                            <Button
                                                disabled={isActing}
                                                onclick={() =>
                                                    handleRetire(profile)}
                                                size="sm"
                                                variant="outline"
                                            >
                                                Retire
                                            </Button>
                                        {/if}

                                        <Button
                                            disabled={isActing}
                                            onclick={() =>
                                                (deletingProfile = profile)}
                                            size="sm"
                                            variant="destructive"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </Table.Cell>
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
        class="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl dark:border-zinc-800 dark:bg-[#202020]"
    >
        <form
            class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            onsubmit={handleSave}
        >
            <div
                class="h-0.5 shrink-0 bg-linear-to-r from-amber-500 via-yellow-400 to-amber-600"
            ></div>

            <!-- Header -->
            <Dialog.Header
                class="shrink-0 gap-0 border-b border-zinc-200 bg-white px-4 py-3 pr-12 text-left sm:px-5 sm:pr-14 dark:border-zinc-800 dark:bg-[#202020]"
            >
                <div class="flex flex-wrap items-center gap-2">
                    <Dialog.Title
                        class="text-base font-semibold tracking-tight text-zinc-950 sm:text-lg dark:text-zinc-50"
                    >
                        {editingSource
                            ? 'Create formula version'
                            : 'Create formula profile'}
                    </Dialog.Title>

                    <span
                        class="inline-flex h-5 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold tracking-wider text-amber-800 uppercase dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                    >
                        Immutable rules
                    </span>
                </div>

                <Dialog.Description
                    class="mt-1 max-w-3xl text-xs/5 text-zinc-500 dark:text-zinc-400"
                >
                    Saved rules are immutable. Changes create another version.
                </Dialog.Description>
            </Dialog.Header>

            <!-- Scrollable body -->
            <div
                class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/60 dark:bg-[#181818]"
            >
                <div class="mx-auto grid w-full max-w-6xl gap-3 p-3 sm:p-4">
                    <!-- Default example -->
                    {#if !editingSource}
                        <section
                            class="flex flex-col gap-3 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/15 dark:bg-amber-500/5"
                        >
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                    >
                                        Starting template
                                    </span>

                                    <span
                                        class="hidden size-1 rounded-full bg-zinc-300 sm:block dark:bg-zinc-700"
                                    ></span>

                                    <p
                                        class="text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                                    >
                                        60-day daily loan
                                    </p>
                                </div>

                                <p
                                    class="mt-1 max-w-3xl text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                >
                                    20% flat interest, 60 payments, and renewal
                                    after 30 completed payments. Review the
                                    values before saving.
                                </p>
                            </div>

                            <Button
                                class="h-8 w-full shrink-0 border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 shadow-none hover:bg-amber-50 sm:w-auto dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
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

                    <!-- Profile basics -->
                    <section
                        class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <header
                            class="flex items-start gap-3 border-b border-zinc-200 px-3 py-2.5 sm:px-4 dark:border-zinc-800"
                        >
                            <div
                                class="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                                01
                            </div>

                            <div class="min-w-0">
                                <h3
                                    class="text-xs font-semibold text-zinc-950 dark:text-zinc-50"
                                >
                                    Profile basics
                                </h3>

                                <p
                                    class="mt-0.5 text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                >
                                    Identify the formula version and define when
                                    it becomes effective.
                                </p>
                            </div>
                        </header>

                        <div
                            class="grid grid-cols-1 items-start gap-x-4 gap-y-3 p-3
                            **:data-[slot=field]:min-w-0
                            **:data-[slot=field]:gap-1
                            **:data-[slot=field-label]:flex
                            **:data-[slot=field-label]:min-h-8
                            **:data-[slot=field-label]:items-center
                            **:data-[slot=field-label]:text-[11px]/4
                            
                            **:data-[slot=field-label]:font-semibold
                            **:data-[slot=field-label]:text-zinc-600
                            sm:grid-cols-2
                            sm:p-4
                            lg:grid-cols-3
                            dark:**:data-[slot=field-label]:text-zinc-300"
                        >
                            <Field.Field>
                                <Field.Label for="formula-name">
                                    Profile name
                                </Field.Label>

                                <Input
                                    class="h-9 w-full"
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
                                    class="h-9 w-full bg-zinc-50 font-mono tabular-nums dark:bg-zinc-900"
                                    id="formula-version"
                                    bind:value={draft.version}
                                    disabled
                                    min="1"
                                    type="number"
                                />
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="formula-effective">
                                    Effective date
                                </Field.Label>

                                <Input
                                    class="h-9 w-full"
                                    id="formula-effective"
                                    bind:value={draft.effectiveDate}
                                    disabled={isActing}
                                    required
                                    type="date"
                                />
                            </Field.Field>
                        </div>
                    </section>

                    <!-- Interest and payment schedule -->
                    <section
                        class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <header
                            class="flex items-start gap-3 border-b border-zinc-200 px-3 py-2.5 sm:px-4 dark:border-zinc-800"
                        >
                            <div
                                class="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                                02
                            </div>

                            <div class="min-w-0">
                                <h3
                                    class="text-xs font-semibold text-zinc-950 dark:text-zinc-50"
                                >
                                    Interest and payment schedule
                                </h3>

                                <p
                                    class="mt-0.5 text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                >
                                    Configure how interest is calculated and how
                                    repayment is scheduled.
                                </p>
                            </div>
                        </header>

                        <div
                            class="grid grid-cols-1 items-start gap-x-4 gap-y-3 p-3
                            **:data-[slot=field]:min-w-0
                            **:data-[slot=field]:gap-1
                            **:data-[slot=field-label]:flex
                            **:data-[slot=field-label]:min-h-8
                            **:data-[slot=field-label]:items-center
                            **:data-[slot=field-label]:text-[11px]/4
                            
                            **:data-[slot=field-label]:font-semibold
                            **:data-[slot=field-label]:text-zinc-600
                            sm:grid-cols-2
                            sm:p-4
                            lg:grid-cols-3
                            dark:**:data-[slot=field-label]:text-zinc-300"
                        >
                            <Field.Field>
                                <Field.Label for="formula-interest-method">
                                    Interest method
                                </Field.Label>

                                <NativeSelect.Root
                                    class="h-9 w-full text-sm"
                                    id="formula-interest-method"
                                    bind:value={draft.interestMethod}
                                    disabled={isActing}
                                    onchange={handleCalculationChange}
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
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-rate"
                                        bind:value={draft.interestRatePercent}
                                        disabled={isActing}
                                        min="0"
                                        oninput={handleCalculationChange}
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
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-fixed-interest"
                                        bind:value={draft.fixedInterestAmount}
                                        disabled={isActing}
                                        min="0.01"
                                        oninput={handleCalculationChange}
                                        required
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>
                            {/if}

                            <Field.Field>
                                <Field.Label for="formula-frequency">
                                    Payment frequency
                                </Field.Label>

                                <NativeSelect.Root
                                    class="h-9 w-full text-sm"
                                    id="formula-frequency"
                                    bind:value={draft.paymentFrequency}
                                    disabled={isActing}
                                    onchange={handlePaymentFrequencyChange}
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
                                <Field.Label for="formula-schedule-mode">
                                    Set repayment schedule by
                                </Field.Label>

                                <NativeSelect.Root
                                    class="h-9 w-full text-sm"
                                    id="formula-schedule-mode"
                                    bind:value={scheduleMode}
                                    disabled={isActing}
                                    onchange={handleScheduleModeChange}
                                >
                                    <NativeSelect.Option value="MANUAL">
                                        Term and installments
                                    </NativeSelect.Option>

                                    <NativeSelect.Option value="COLLECTION">
                                        Collection per payment
                                    </NativeSelect.Option>
                                </NativeSelect.Root>
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="preview-principal">
                                    Principal (PHP)
                                </Field.Label>

                                <Input
                                    class="h-9 w-full font-mono tabular-nums"
                                    id="preview-principal"
                                    bind:value={previewPrincipal}
                                    disabled={isActing}
                                    min="0.01"
                                    oninput={handleCalculationChange}
                                    step="0.01"
                                    type="number"
                                />
                            </Field.Field>

                            {#if scheduleMode === 'COLLECTION'}
                                <Field.Field>
                                    <FormFieldLabel
                                        for="formula-collection"
                                        label="Collection per payment (PHP)"
                                        helpDescription={collectionHelp}
                                    />

                                    <Input
                                        aria-describedby="formula-collection-help"
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-collection"
                                        bind:value={collectionAmount}
                                        disabled={isActing}
                                        min="0.01"
                                        oninput={handleCalculationChange}
                                        required
                                        step="0.01"
                                        type="number"
                                    />

                                    {#if collectionAmount && generatedTerm === null}
                                        <Field.Error>
                                            Enter amounts that produce 1 to
                                            3,660 payments within 3,660 days.
                                        </Field.Error>
                                    {/if}
                                </Field.Field>
                            {/if}

                            <Field.Field>
                                <FormFieldLabel
                                    for="formula-term"
                                    label={`Term ${
                                        termUnit === 'day'
                                            ? 'days'
                                            : termUnit === 'week'
                                              ? 'weeks'
                                              : 'months'
                                    }`}
                                    helpDescription={termHelp}
                                />

                                {#if scheduleMode === 'COLLECTION'}
                                    <Input
                                        aria-describedby="formula-term-help"
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-term"
                                        value={generatedTerm ?? ''}
                                        disabled
                                        type="number"
                                    />
                                {:else}
                                    <Input
                                        aria-describedby="formula-term-help"
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-term"
                                        bind:value={termLength}
                                        disabled={isActing}
                                        min="1"
                                        oninput={handleTermLengthInput}
                                        required
                                        type="number"
                                    />
                                {/if}

                                {#if scheduleMode === 'COLLECTION' && generatedTermDays !== null}
                                    <output
                                        class="text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                        >{generatedTermDays} accounting days</output
                                    >
                                {:else if draft.paymentFrequency !== 'DAILY' && !legacyTermInDays}
                                    <output
                                        class="text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                    >
                                        {termLength}
                                        {termUnit}{termLength === 1 ? '' : 's'}
                                    </output>
                                {/if}
                            </Field.Field>

                            <Field.Field>
                                <Field.Label for="formula-installments">
                                    {draft.paymentFrequency === 'DAILY'
                                        ? 'Installment count'
                                        : `${
                                              draft.paymentFrequency ===
                                              'WEEKLY'
                                                  ? 'Weekly'
                                                  : 'Monthly'
                                          } installments`}
                                </Field.Label>

                                {#if scheduleMode === 'COLLECTION'}
                                    <Input
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-installments"
                                        value={generatedTerm ?? ''}
                                        disabled
                                        type="number"
                                    />
                                {:else}
                                    <Input
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="formula-installments"
                                        bind:value={draft.installmentCount}
                                        disabled={isActing}
                                        min="1"
                                        oninput={handleInstallmentCountInput}
                                        readonly={draft.paymentFrequency !==
                                            'DAILY' && !legacyTermInDays}
                                        required
                                        type="number"
                                    />
                                {/if}
                            </Field.Field>
                        </div>
                    </section>

                    <!-- Renewal policy -->
                    <section
                        class="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#202020]"
                    >
                        <header
                            class="flex items-start gap-3 border-b border-zinc-200 px-3 py-2.5 sm:px-4 dark:border-zinc-800"
                        >
                            <div
                                class="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                                03
                            </div>

                            <div class="min-w-0">
                                <h3
                                    class="text-xs font-semibold text-zinc-950 dark:text-zinc-50"
                                >
                                    Renewal policy
                                </h3>

                                <p
                                    class="mt-0.5 text-[11px]/4 text-zinc-500 dark:text-zinc-400"
                                >
                                    Define renewal eligibility, settlement
                                    behavior, and partial-payment handling.
                                </p>
                            </div>
                        </header>

                        <div
                            class="grid grid-cols-1 items-start gap-x-4 gap-y-3 p-3
                            **:data-[slot=field]:min-w-0
                            **:data-[slot=field]:gap-1
                            **:data-[slot=field-label]:flex
                            **:data-[slot=field-label]:min-h-8
                            **:data-[slot=field-label]:items-center
                            **:data-[slot=field-label]:text-[11px]/4
                            
                            **:data-[slot=field-label]:font-semibold
                            **:data-[slot=field-label]:text-zinc-600
                            sm:p-4
                            lg:grid-cols-2
                            dark:**:data-[slot=field-label]:text-zinc-300"
                        >
                            <Field.Field>
                                <FormFieldLabel
                                    for="formula-min-renewal"
                                    label="Minimum payments before renewal"
                                    helpDescription={renewalMinimumHelp}
                                />

                                <Input
                                    aria-describedby="formula-min-renewal-help"
                                    aria-invalid={hasInvalidRenewalMinimum}
                                    class="h-9 w-full font-mono tabular-nums"
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

                                {#if hasInvalidRenewalMinimum}
                                    <Field.Error>
                                        Cannot be higher than the installment
                                        count.
                                    </Field.Error>
                                {/if}
                            </Field.Field>

                            <Field.Field>
                                <FormFieldLabel
                                    for="formula-settlement"
                                    label="Old loan balance to settle"
                                    helpDescription={settlementHelp}
                                />

                                <NativeSelect.Root
                                    aria-describedby="formula-settlement-help"
                                    class="h-9 w-full text-sm"
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
                            </Field.Field>

                            <Field.Field class="lg:col-span-2">
                                <FormFieldLabel
                                    for="formula-credit"
                                    label="What to do with a partial payment"
                                    helpDescription={partialCreditHelp}
                                />

                                <NativeSelect.Root
                                    aria-describedby="formula-credit-help"
                                    class="h-9 w-full text-sm"
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
                            </Field.Field>

                            <div
                                class="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2.5 text-xs text-zinc-800 lg:col-span-2 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200"
                            >
                                <span class="min-w-0">
                                    <FormFieldLabel
                                        for="formula-allow-renewal-change"
                                        label="Allow renewal principal changes"
                                        helpDescription={renewalPrincipalHelp}
                                    />
                                </span>

                                <input
                                    aria-describedby="formula-allow-renewal-change-help"
                                    class="size-4 shrink-0 accent-amber-500"
                                    bind:checked={
                                        draft.allowRenewalPrincipalChange
                                    }
                                    disabled={isActing}
                                    id="formula-allow-renewal-change"
                                    type="checkbox"
                                />
                            </div>
                        </div>
                    </section>

                    <!-- Formula preview -->
                    <Card.Root
                        class="overflow-hidden rounded-lg border-amber-200/70 bg-white shadow-none dark:border-amber-500/20 dark:bg-[#202020]"
                    >
                        <Card.Header
                            class="border-b border-zinc-200 bg-amber-50/40 px-3 py-2.5 sm:px-4 dark:border-zinc-800 dark:bg-amber-500/5"
                        >
                            <div class="flex items-start gap-3">
                                <div
                                    class="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                >
                                    04
                                </div>

                                <div class="min-w-0">
                                    <Card.Title
                                        class="text-xs font-semibold text-zinc-950 dark:text-zinc-50"
                                    >
                                        Formula preview
                                    </Card.Title>

                                    <Card.Description
                                        class="mt-0.5 text-[11px]/4 "
                                    >
                                        Uses the same server calculation engine
                                        as loan origination.
                                    </Card.Description>
                                </div>
                            </div>
                        </Card.Header>

                        <Card.Content class="grid gap-3 p-3 sm:p-4">
                            <div
                                class="grid grid-cols-1 items-end gap-3
                                **:data-[slot=field]:min-w-0
                                **:data-[slot=field]:gap-1
                                **:data-[slot=field-label]:flex
                                **:data-[slot=field-label]:min-h-8
                                **:data-[slot=field-label]:items-center
                                **:data-[slot=field-label]:text-[11px]/4
                                
                                **:data-[slot=field-label]:font-semibold
                                **:data-[slot=field-label]:text-zinc-600
                                sm:grid-cols-[minmax(0,1fr)_auto]
                                dark:**:data-[slot=field-label]:text-zinc-300"
                            >
                                <Field.Field>
                                    <Field.Label for="preview-paid">
                                        Total paid (PHP)
                                    </Field.Label>

                                    <Input
                                        class="h-9 w-full font-mono tabular-nums"
                                        id="preview-paid"
                                        bind:value={previewTotalPaid}
                                        disabled={isActing}
                                        min="0"
                                        step="0.01"
                                        type="number"
                                    />
                                </Field.Field>

                                <Button
                                    class="h-9 w-full border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 shadow-none hover:bg-amber-50 sm:w-auto sm:min-w-32 dark:border-amber-500/30 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-500/10"
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
                                    class="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 text-xs sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800"
                                >
                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Interest
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-sm font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.interestAmountMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Total payable
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-sm font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.totalPayableMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Installment
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-sm font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.installmentAmountMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Completed
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-sm font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {preview.completedInstallmentCount}
                                        </dd>
                                    </div>

                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Partial credit
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-sm font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.partialPaymentCreditMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div class="bg-white p-3 dark:bg-[#202020]">
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
                                        >
                                            Renewal settlement
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-sm font-semibold text-zinc-950 tabular-nums dark:text-zinc-100"
                                        >
                                            {formatCurrency(
                                                preview.renewalSettlementBalanceMinor,
                                            )}
                                        </dd>
                                    </div>

                                    <div
                                        class="bg-amber-50/80 p-3 sm:col-span-2 dark:bg-amber-500/7"
                                    >
                                        <dt
                                            class="text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-300"
                                        >
                                            Renewal cash release
                                        </dt>

                                        <dd
                                            class="mt-1 font-mono text-base font-bold text-zinc-950 tabular-nums dark:text-zinc-50"
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

            <!-- Footer -->
            <Dialog.Footer
                class="shrink-0 border-t border-zinc-200 bg-white px-3 py-2.5 sm:px-5 dark:border-zinc-800 dark:bg-[#202020]"
            >
                <div
                    class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end"
                >
                    <Button
                        class="h-10 w-full px-4 text-xs sm:h-9 sm:w-auto"
                        disabled={isActing}
                        onclick={() => handleDialogOpenChange(false)}
                        type="button"
                        variant="outline"
                    >
                        Cancel
                    </Button>

                    <Button
                        class="h-10 w-full bg-amber-500 px-4 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-amber-400 sm:h-9 sm:w-auto dark:bg-amber-400 dark:hover:bg-amber-300"
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

<AlertDialog.Root
    bind:open={() => deletingProfile !== null, handleDeleteOpenChange}
>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>Delete formula profile?</AlertDialog.Title>

            <AlertDialog.Description>
                Delete {deletingProfile?.name} (version {deletingProfile?.version})?
                This removes the profile from settings and future selections.
                Existing products and loans keep their formula history. This
                cannot be undone.
            </AlertDialog.Description>
        </AlertDialog.Header>

        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isActing}>Cancel</AlertDialog.Cancel>

            <AlertDialog.Action
                class="bg-destructive text-white hover:bg-destructive/90"
                disabled={isActing}
                onclick={handleDelete}
            >
                {#if isActing}
                    <Spinner data-icon="inline-start" />
                {/if}

                Delete profile
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>

<Dialog.Root bind:open={() => saveError !== null, handleSaveErrorOpenChange}>
    <Dialog.Content class="sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>Formula profile could not be saved</Dialog.Title>

            <Dialog.Description>
                {saveError}
            </Dialog.Description>
        </Dialog.Header>

        <Dialog.Footer>
            <Button onclick={() => handleSaveErrorOpenChange(false)}>
                Back to profile
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
