<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import * as AlertDialog from '@loanms/ui/components/alert-dialog'
    import { Button } from '@loanms/ui/components/button'
    import * as Card from '@loanms/ui/components/card'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Skeleton } from '@loanms/ui/components/skeleton'
    import { Spinner } from '@loanms/ui/components/spinner'
    import AlertCircleIcon from '@lucide/svelte/icons/alert-circle'
    import BadgeCheckIcon from '@lucide/svelte/icons/badge-check'
    import CreditCardIcon from '@lucide/svelte/icons/credit-card'
    import GaugeIcon from '@lucide/svelte/icons/gauge'
    import LandmarkIcon from '@lucide/svelte/icons/landmark'
    import SaveIcon from '@lucide/svelte/icons/save'
    import Settings2Icon from '@lucide/svelte/icons/settings-2'
    import ShieldCheckIcon from '@lucide/svelte/icons/shield-check'
    import { toast } from 'svelte-sonner'
    import { useSessionContext } from '$lib/states/session'
    import { getErrorMessage } from '$lib/utilities/helpers'
    import { createIdempotencyKeyLifecycle } from '$lib/utilities/idempotencyKey'
    import {
        createSystemSettingsQuery,
        createSystemSettingsUpdateMutation,
    } from '../queries'
    import type { SystemSettings, SystemSettingsUpdateInput } from '../types'
    import FormulaProfilesPanel from './FormulaProfilesPanel.svelte'
    ////////////////////
    // 01. Properties //
    ////////////////////
    let { role }: { role: 'admin' | 'owner' } = $props()
    ///////////////////
    // 02. Constants //
    ///////////////////
    const idempotencyKey = createIdempotencyKeyLifecycle()
    const PAYMENT_FREQUENCIES = [
        'DAILY',
        'WEEKLY',
        'MONTHLY',
    ] as const
    const session = useSessionContext()
    const TAG_PERIODS = [
        [
            'daily',
            'Daily',
        ],
        [
            'weekly',
            'Weekly',
        ],
        [
            'monthly',
            'Monthly',
        ],
    ] as const
    ///////////////
    // 03. State //
    ///////////////
    let confirmationOpen = $state(false)
    let draft = $state<SystemSettings | null>(null)
    let isSubmitting = $state(false)
    let loadedVersion = $state<number | null>(null)
    /////////////////
    // 04. Derived //
    /////////////////
    const canSave = $derived(role === 'owner' || role === 'admin')
    const isLocked = $derived(isSubmitting)
    const hasEnabledPaymentFrequency = $derived(
        Boolean(draft?.enabledPaymentFrequencies.length),
    )
    /////////////////
    // 05. Queries //
    /////////////////
    const settingsQuery = createSystemSettingsQuery({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    ///////////////////
    // 06. Mutations //
    ///////////////////
    const updateMutation = createSystemSettingsUpdateMutation({
        get organizationSlug() {
            return session.data.organizationSlug
        },
    })
    //////////////////
    // 08. Effects //
    //////////////////
    $effect(() => {
        const settings = settingsQuery.data
        if (!settings || loadedVersion === settings.version) return
        draft = structuredClone(settings)
        loadedVersion = settings.version
        idempotencyKey.abandonAttempt()
    })
    //////////////////
    // 09. Handlers //
    //////////////////
    function handleConfirmationOpenChange(open: boolean) {
        if (isLocked) return
        confirmationOpen = open
    }
    function handleFrequencyChange(
        frequency: 'DAILY' | 'MONTHLY' | 'WEEKLY',
        checked: boolean,
    ) {
        if (!draft || isLocked) return
        draft.enabledPaymentFrequencies = checked
            ? [
                  ...new Set([
                      ...draft.enabledPaymentFrequencies,
                      frequency,
                  ]),
              ]
            : draft.enabledPaymentFrequencies.filter(
                  (value) => value !== frequency,
              )
    }
    async function handleSave() {
        if (!draft || isLocked || !hasEnabledPaymentFrequency) return
        const input = getUpdateInput(draft)
        const claim = idempotencyKey.claim(input)
        if (!claim.ok) {
            toast.error(
                'Retry the unresolved request without changing its details.',
            )
            return
        }
        isSubmitting = true
        try {
            const saved = await updateMutation.mutateAsync({
                ...input,
                idempotencyKey: claim.key,
            })
            draft = structuredClone(saved)
            loadedVersion = saved.version
            idempotencyKey.confirmSuccess()
            confirmationOpen = false
            toast.success('System settings saved as a new version.')
        } catch (error) {
            toast.error(
                getErrorMessage(error, 'Could not save system settings.'),
            )
        } finally {
            isSubmitting = false
        }
    }
    /////////////////
    // 10. Helpers //
    /////////////////
    function getUpdateInput(
        settings: SystemSettings,
    ): Omit<SystemSettingsUpdateInput, 'idempotencyKey'> {
        return {
            allowAdvancePayments: settings.allowAdvancePayments,
            allowPartialPayments: settings.allowPartialPayments,
            borrowerTagPolicy: settings.borrowerTagPolicy,
            defaultLoanProductPublicId: settings.defaultLoanProductPublicId,
            defaultPaymentFrequency: settings.defaultPaymentFrequency,
            enabledPaymentFrequencies: settings.enabledPaymentFrequencies,
            expectedVersion: settings.version,
            requireRenewalApproval: settings.requireRenewalApproval,
        }
    }
</script>

<section
    class="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-zinc-50/80 dark:bg-[#171717]"
>
    <header
        class="border-b border-zinc-200 bg-white p-3 md:px-4 dark:border-zinc-800 dark:bg-[#202020]"
    >
        <div
            class="mx-auto flex w-full max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
            <div class="max-w-3xl space-y-1">
                <div
                    class="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase"
                >
                    <LandmarkIcon class="size-4" /> Organization controls
                </div>
                <h2
                    class="text-lg font-semibold tracking-tight text-zinc-950 md:text-xl dark:text-zinc-50"
                >
                    System settings
                </h2>
                <p class="max-w-2xl text-xs text-zinc-500 dark:text-zinc-400">
                    Configure lending defaults, borrower risk rules, and
                    calculation policies from one controlled workspace. Existing
                    loans retain their contractual snapshots.
                </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <div
                    class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                    <ShieldCheckIcon class="size-3.5" /> Version-controlled
                </div>
                {#if draft}<div
                        class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm"
                    >
                        <BadgeCheckIcon class="size-3.5" /> Version {draft.version}
                    </div>{/if}
            </div>
        </div>
    </header>
    <div
        class="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 p-3 md:p-4"
    >
        {#if settingsQuery.isPending}
            <div class="grid gap-4 lg:grid-cols-2">
                {#each [0, 1, 2, 3] as card (card)}
                    <Skeleton class="h-64 w-full rounded-2xl" />
                {/each}
            </div>
        {:else if settingsQuery.isError || !draft}
            <Alert.Root variant="destructive">
                <AlertCircleIcon />
                <Alert.Title>Unable to load settings</Alert.Title>
                <Alert.Description>
                    {getErrorMessage(
                        settingsQuery.error,
                        'Try again before changing settings.',
                    )}
                </Alert.Description>
                <Button
                    onclick={() => settingsQuery.refetch()}
                    size="sm"
                    variant="outline">Retry</Button
                >
            </Alert.Root>
        {:else}
            <FormulaProfilesPanel />
            <div class="grid auto-rows-min gap-3 xl:grid-cols-12">
                <Card.Root
                    class="overflow-hidden border-border/60 shadow-sm xl:col-span-7"
                >
                    <Card.Header class="border-b border-border/50 bg-muted/20"
                        ><div class="flex items-start gap-3">
                            <div
                                class="grid size-10 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
                            >
                                <CreditCardIcon class="size-5" />
                            </div>
                            <div>
                                <Card.Title class="tracking-tight"
                                    >Loan and payment defaults</Card.Title
                                >
                                <Card.Description>
                                    Defaults apply to future workflow selections
                                    only.
                                </Card.Description>
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Content class="grid gap-4">
                        <Field.Field>
                            <Field.Label for="default-payment-frequency"
                                >Default payment frequency</Field.Label
                            >
                            <NativeSelect.Root
                                id="default-payment-frequency"
                                bind:value={draft.defaultPaymentFrequency}
                                disabled={isLocked}
                            >
                                <NativeSelect.Option value="DAILY"
                                    >Daily</NativeSelect.Option
                                >
                                <NativeSelect.Option value="WEEKLY"
                                    >Weekly</NativeSelect.Option
                                >
                                <NativeSelect.Option value="MONTHLY"
                                    >Monthly</NativeSelect.Option
                                >
                            </NativeSelect.Root>
                        </Field.Field>
                        <Field.Field>
                            <Field.Label
                                >Enabled payment frequencies</Field.Label
                            >
                            <div class="grid gap-2 sm:grid-cols-3">
                                {#each PAYMENT_FREQUENCIES as frequency (frequency)}
                                    <label
                                        class="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                                    >
                                        <input
                                            checked={draft.enabledPaymentFrequencies.includes(
                                                frequency,
                                            )}
                                            disabled={isLocked}
                                            onchange={(event) =>
                                                handleFrequencyChange(
                                                    frequency,
                                                    event.currentTarget.checked,
                                                )}
                                            type="checkbox"
                                        />
                                        {frequency[0]}{frequency
                                            .slice(1)
                                            .toLowerCase()}
                                    </label>
                                {/each}
                            </div>
                            {#if !hasEnabledPaymentFrequency}<Field.Error
                                    >Enable at least one payment frequency.</Field.Error
                                >{/if}
                        </Field.Field>
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                        >
                            Allow partial payments
                            <input
                                bind:checked={draft.allowPartialPayments}
                                disabled={isLocked}
                                type="checkbox"
                            />
                        </label>
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                        >
                            Allow advance payments
                            <input
                                bind:checked={draft.allowAdvancePayments}
                                disabled={isLocked}
                                type="checkbox"
                            />
                        </label>
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                        >
                            Require renewal approval
                            <input
                                bind:checked={draft.requireRenewalApproval}
                                disabled={isLocked}
                                type="checkbox"
                            />
                        </label>
                    </Card.Content>
                </Card.Root>
                <Card.Root
                    class="overflow-hidden border-border/60 shadow-sm xl:col-span-5"
                >
                    <Card.Header class="border-b border-border/50 bg-muted/20"
                        ><div class="flex items-start gap-3">
                            <div
                                class="grid size-10 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
                            >
                                <GaugeIcon class="size-5" />
                            </div>
                            <div>
                                <Card.Title class="tracking-tight"
                                    >Automatic borrower payment tags</Card.Title
                                >
                                <Card.Description>
                                    Thresholds count missed scheduled
                                    installments, not calendar days.
                                </Card.Description>
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Content class="grid gap-4">
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                        >
                            Enable automatic tagging
                            <input
                                bind:checked={
                                    draft.borrowerTagPolicy
                                        .automaticTaggingEnabled
                                }
                                disabled={isLocked}
                                type="checkbox"
                            />
                        </label>
                        <div class="grid gap-3">
                            {#each TAG_PERIODS as [period, label] (period)}
                                <fieldset
                                    class="grid gap-3 rounded-xl border border-border/70 bg-muted/10 p-4"
                                >
                                    <legend class="px-1 text-sm font-medium"
                                        >{label} thresholds</legend
                                    >
                                    <div class="grid gap-3 sm:grid-cols-3">
                                        <Field.Field>
                                            <Field.Label for={`${period}-good`}
                                                >Good maximum</Field.Label
                                            >
                                            <Input
                                                id={`${period}-good`}
                                                bind:value={
                                                    draft.borrowerTagPolicy[
                                                        period
                                                    ]
                                                        .goodPayerMaximumMissedInstallments
                                                }
                                                disabled={isLocked}
                                                min="0"
                                                type="number"
                                            />
                                        </Field.Field>
                                        <Field.Field>
                                            <Field.Label for={`${period}-bad`}
                                                >Bad minimum</Field.Label
                                            >
                                            <Input
                                                id={`${period}-bad`}
                                                bind:value={
                                                    draft.borrowerTagPolicy[
                                                        period
                                                    ]
                                                        .badPayerMaximumMissedInstallments
                                                }
                                                disabled={isLocked}
                                                min="0"
                                                type="number"
                                            />
                                        </Field.Field>
                                        <Field.Field>
                                            <Field.Label
                                                for={`${period}-scammer`}
                                                >Scammer minimum</Field.Label
                                            >
                                            <Input
                                                id={`${period}-scammer`}
                                                bind:value={
                                                    draft.borrowerTagPolicy[
                                                        period
                                                    ]
                                                        .scammerMinimumMissedInstallments
                                                }
                                                disabled={isLocked}
                                                min="0"
                                                type="number"
                                            />
                                        </Field.Field>
                                    </div>
                                </fieldset>
                            {/each}
                        </div>
                    </Card.Content>
                </Card.Root>
                <Card.Root
                    class="overflow-hidden border-border/60 shadow-sm xl:col-span-12"
                >
                    <Card.Header class="border-b border-border/50 bg-muted/20"
                        ><div class="flex items-start gap-3">
                            <div
                                class="grid size-10 shrink-0 place-items-center rounded-xl border bg-background shadow-sm"
                            >
                                <ShieldCheckIcon class="size-5" />
                            </div>
                            <div>
                                <Card.Title class="tracking-tight"
                                    >Risk and override policy</Card.Title
                                >
                                <Card.Description>
                                    These protections affect future loan and
                                    renewal decisions; sensitive overrides
                                    remain audited.
                                </Card.Description>
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Content
                        class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                    >
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                            >Require Bad Payer renewal approval<input
                                bind:checked={
                                    draft.borrowerTagPolicy
                                        .requireBadPayerRenewalApproval
                                }
                                disabled={isLocked}
                                type="checkbox"
                            /></label
                        >
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                            >Require Scammer renewal approval<input
                                bind:checked={
                                    draft.borrowerTagPolicy
                                        .requireScammerRenewalApproval
                                }
                                disabled={isLocked}
                                type="checkbox"
                            /></label
                        >
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                            >Block new loans for Scammer<input
                                bind:checked={
                                    draft.borrowerTagPolicy
                                        .blockNewLoanForScammer
                                }
                                disabled={isLocked}
                                type="checkbox"
                            /></label
                        >
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                            >Allow manual overrides<input
                                bind:checked={
                                    draft.borrowerTagPolicy.allowManualOverride
                                }
                                disabled={isLocked}
                                type="checkbox"
                            /></label
                        >
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                            >Require override reason<input
                                bind:checked={
                                    draft.borrowerTagPolicy
                                        .requireOverrideReason
                                }
                                disabled={isLocked}
                                type="checkbox"
                            /></label
                        >
                        <label
                            class="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background px-3.5 text-sm shadow-sm transition-colors hover:bg-muted/30"
                            >Show historical worst tag<input
                                bind:checked={
                                    draft.borrowerTagPolicy
                                        .showHistoricalWorstTag
                                }
                                disabled={isLocked}
                                type="checkbox"
                            /></label
                        >
                    </Card.Content>
                </Card.Root>
            </div>
            <div
                class="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5 backdrop-blur-sm supports-backdrop-filter:bg-background/85"
            >
                <div>
                    <p class="text-sm font-medium text-foreground">
                        Ready to publish changes
                    </p>
                    <p class="text-xs text-muted-foreground">
                        Current version: {draft.version} · Saving creates a new audited
                        version.
                    </p>
                </div>
                <Button
                    disabled={!canSave ||
                        isLocked ||
                        !hasEnabledPaymentFrequency}
                    onclick={() => (confirmationOpen = true)}
                >
                    <SaveIcon data-icon="inline-start" /> Save settings
                </Button>
            </div>
        {/if}
    </div>
</section>
<AlertDialog.Root
    bind:open={() => confirmationOpen, handleConfirmationOpenChange}
>
    <AlertDialog.Content
        class="max-h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain"
    >
        <AlertDialog.Header>
            <AlertDialog.Title>Save a new settings version?</AlertDialog.Title>
            <AlertDialog.Description>
                This change is audited and applies to future operations. It does
                not rewrite existing loan, payment, or renewal records.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={isLocked}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
                disabled={isLocked}
                onclick={handleSave}
            >
                {#if isSubmitting}<Spinner
                        data-icon="inline-start"
                    />{/if}<Settings2Icon data-icon="inline-start" /> Save new version
            </AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
