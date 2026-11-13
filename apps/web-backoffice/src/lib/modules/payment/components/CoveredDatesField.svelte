<script lang="ts">
    import * as Alert from '@loanms/ui/components/alert'
    import { Button } from '@loanms/ui/components/button'
    import { Checkbox } from '@loanms/ui/components/checkbox'
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Spinner } from '@loanms/ui/components/spinner'

    import {
        formatCurrency,
        formatDate,
    } from '$lib/modules/loan/utilities/format'
    import { useSessionContext } from '$lib/states/session'
    import { createCollectionsBorrowerQuery } from '../queries'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        borrowerPublicId,
        disabled = false,
        loanPublicId,
        onchange,
        onUseTotal,
        value = $bindable<string[] | undefined>(undefined),
    }: {
        borrowerPublicId: string
        disabled?: boolean
        loanPublicId: string
        onchange: () => void
        onUseTotal: (totalMinor: number) => void
        value?: string[]
    } = $props()

    ///////////////////
    // 02. Constants //
    ///////////////////

    const session = useSessionContext()

    ///////////////
    // 03. State //
    ///////////////

    let mode = $state('automatic')
    let rangeFrom = $state('')
    let rangeTo = $state('')
    let singleDate = $state('')

    /////////////////
    // 04. Derived //
    /////////////////

    const available = $derived.by(() =>
        (scheduleQuery.data ?? [])
            .filter(
                (item) =>
                    item.loanPublicId === loanPublicId &&
                    item.remainingAmountMinor > 0 &&
                    item.status !== 'PAID' &&
                    item.status !== 'WAIVED',
            )
            .toSorted((a, b) => a.dueDate.localeCompare(b.dueDate)),
    )
    const selected = $derived(
        available.filter((item) => value?.includes(item.dueDate)),
    )
    const selectedTotal = $derived(
        selected.reduce((total, item) => total + item.remainingAmountMinor, 0),
    )

    /////////////////
    // 05. Queries //
    /////////////////

    const scheduleQuery = createCollectionsBorrowerQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get borrowerPublicId() {
                return mode === 'automatic' ? '' : borrowerPublicId
            },
        },
    )

    //////////////////
    // 09. Handlers //
    //////////////////

    function handleModeChange(event: Event) {
        if (disabled) return
        mode = (event.currentTarget as HTMLSelectElement).value
        rangeFrom = ''
        rangeTo = ''
        singleDate = ''
        value = mode === 'automatic' ? undefined : []
        onchange()
    }

    function handleSingleDate(event: Event) {
        if (disabled) return
        singleDate = (event.currentTarget as HTMLInputElement).value
        value = available.some((item) => item.dueDate === singleDate)
            ? [singleDate]
            : []
        onchange()
    }

    function handleToggle(date: string, checked: boolean) {
        if (disabled) return
        value = checked
            ? [
                  ...(value ?? []),
                  date,
              ].toSorted()
            : (value ?? []).filter((entry) => entry !== date)
        onchange()
    }

    function handleRangeFrom(event: Event) {
        if (disabled) return
        rangeFrom = (event.currentTarget as HTMLInputElement).value
        updateRange()
    }

    function handleRangeTo(event: Event) {
        if (disabled) return
        rangeTo = (event.currentTarget as HTMLInputElement).value
        updateRange()
    }

    /////////////////
    // 10. Helpers //
    /////////////////

    function updateRange() {
        value =
            rangeFrom && rangeTo && rangeFrom <= rangeTo
                ? available
                      .filter(
                          (item) =>
                              item.dueDate >= rangeFrom &&
                              item.dueDate <= rangeTo,
                      )
                      .map((item) => item.dueDate)
                : []
        onchange()
    }
</script>

<Field.Set
    {disabled}
    class="gap-2"
>
    <Field.Legend class="sr-only">Covered dates</Field.Legend>
    <Field.Field class="gap-1.5">
        <Field.Label for="payment-coverage-mode">Date selection</Field.Label>
        <NativeSelect.Root
            id="payment-coverage-mode"
            value={mode}
            {disabled}
            onchange={handleModeChange}
        >
            <NativeSelect.Option value="automatic"
                >Automatic (oldest first)</NativeSelect.Option
            >
            <NativeSelect.Option value="single"
                >Select one date</NativeSelect.Option
            >
            <NativeSelect.Option value="dates"
                >Select multiple dates</NativeSelect.Option
            >
            <NativeSelect.Option value="range">Date range</NativeSelect.Option>
        </NativeSelect.Root>
    </Field.Field>
    {#if mode === 'automatic'}
        <p class="text-xs text-muted-foreground">
            Applies to the oldest unpaid dates automatically.
        </p>
    {/if}
    {#if mode !== 'automatic'}
        <Field.Description class="text-xs">
            Past due and partially paid installments are available to select.
        </Field.Description>
        <Field.Description class="text-xs">
            Payments always fill the oldest unpaid installment first, then
            continue to the next installment. Selecting dates does not skip
            older unpaid balances. Partial payments leave the final covered
            installment partially paid.
        </Field.Description>
        {#if scheduleQuery.isPending}
            <p
                class="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
            >
                <Spinner /> Loading unpaid dates…
            </p>
        {:else if scheduleQuery.isError}
            <Alert.Root variant="destructive">
                <Alert.Title>Collection dates could not be loaded</Alert.Title>
                <Alert.Description
                    >Refresh the schedule before selecting dates.</Alert.Description
                >
                <Button
                    type="button"
                    disabled={disabled || scheduleQuery.isFetching}
                    variant="outline"
                    onclick={() => void scheduleQuery.refetch()}
                    >Refresh dates</Button
                >
            </Alert.Root>
        {:else if available.length === 0}
            <p class="text-sm text-muted-foreground">
                No unpaid installment dates are available for this loan.
            </p>
        {:else}
            {#if mode === 'single'}
                <Field.Field class="min-w-0 gap-1.5">
                    <Field.Label for="coverage-single-date"
                        >Installment date</Field.Label
                    >
                    <Input
                        id="coverage-single-date"
                        type="date"
                        value={singleDate}
                        {disabled}
                        oninput={handleSingleDate}
                        required
                    />
                </Field.Field>
                <Field.Description class="text-xs">
                    Choose an unpaid installment date. This date will also be
                    used as the payment date and period covered.
                </Field.Description>
            {:else if mode === 'range'}
                <div class="grid grid-cols-2 gap-3">
                    <Field.Field class="min-w-0 gap-1.5">
                        <Field.Label for="coverage-from">Cover from</Field.Label
                        >
                        <Input
                            id="coverage-from"
                            type="date"
                            value={rangeFrom}
                            {disabled}
                            oninput={handleRangeFrom}
                            required
                        />
                    </Field.Field>
                    <Field.Field class="min-w-0 gap-1.5">
                        <Field.Label for="coverage-to"
                            >Cover through</Field.Label
                        >
                        <Input
                            id="coverage-to"
                            type="date"
                            value={rangeTo}
                            {disabled}
                            oninput={handleRangeTo}
                            required
                        />
                    </Field.Field>
                </div>
                <Field.Description class="text-xs">
                    Past ranges are allowed. Only unpaid installment dates in
                    the selected range will be included.
                </Field.Description>
            {:else}
                <div
                    class="max-h-40 overflow-y-auto overscroll-contain rounded-lg border p-1"
                >
                    {#each available as item (item.installmentNumber)}
                        <Field.Field
                            orientation="horizontal"
                            class="min-h-11 items-center gap-3 px-2"
                        >
                            <Checkbox
                                id={`coverage-${item.installmentNumber}`}
                                aria-label={`Cover ${item.dueDate}`}
                                checked={value?.includes(item.dueDate) ?? false}
                                {disabled}
                                onCheckedChange={(checked) =>
                                    handleToggle(item.dueDate, checked)}
                            />
                            <Field.Label
                                for={`coverage-${item.installmentNumber}`}
                                class="min-h-11 flex-1 justify-between gap-3"
                            >
                                <span>{formatDate(item.dueDate)}</span>
                                <span class="font-mono tabular-nums"
                                    >{formatCurrency(
                                        item.remainingAmountMinor,
                                    )}</span
                                >
                            </Field.Label>
                        </Field.Field>
                    {/each}
                </div>
            {/if}
            <div
                class="flex flex-wrap items-center justify-between gap-2 border-t pt-2"
            >
                <p
                    class="text-xs font-medium"
                    role="status"
                >
                    {selected.length} installment dates selected · {formatCurrency(
                        selectedTotal,
                    )}
                </p>
                {#if value && value.length > 1000}
                    <p
                        class="text-sm text-destructive"
                        role="alert"
                    >
                        Select at most 1,000 installment dates per payment.
                    </p>
                {/if}
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled ||
                        selected.length === 0 ||
                        selected.length > 1000}
                    onclick={() => onUseTotal(selectedTotal)}
                    >Use selected total</Button
                >
            </div>
        {/if}
    {/if}
</Field.Set>
