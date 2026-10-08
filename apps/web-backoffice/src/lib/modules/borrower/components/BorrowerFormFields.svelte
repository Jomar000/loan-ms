<script lang="ts">
    import * as Field from '@loanms/ui/components/field'
    import { Input } from '@loanms/ui/components/input'
    import * as NativeSelect from '@loanms/ui/components/native-select'
    import { Textarea } from '@loanms/ui/components/textarea'

    import type { BorrowerCreateInput } from '../types'

    ////////////////////
    // 01. Properties //
    ////////////////////

    let {
        disabled = false,
        draft = $bindable<BorrowerCreateInput>(),
    }: {
        disabled?: boolean
        draft: BorrowerCreateInput
    } = $props()
</script>

<div class="grid grid-cols-1">
    <!-- Personal information -->
    <Field.Set class="min-w-0 pb-4">
        <div
            class="mb-3 flex items-center gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800"
        >
            <Field.Legend
                class="text-xs font-semibold tracking-wider text-zinc-900 uppercase dark:text-zinc-100"
                variant="label"
            >
                Personal information
            </Field.Legend>

            <div
                class="h-px min-w-0 flex-1 bg-linear-to-r from-amber-300/60 to-transparent dark:from-amber-500/20"
            ></div>
        </div>

        <Field.Group class="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-full-name"
                >
                    Full name
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-full-name"
                    bind:value={draft.fullName}
                    {disabled}
                    maxlength={200}
                    required
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-gender"
                >
                    Gender
                </Field.Label>

                <NativeSelect.Root
                    class="h-9"
                    id="borrower-gender"
                    bind:value={draft.gender}
                    {disabled}
                >
                    <NativeSelect.Option value="FEMALE">
                        Female
                    </NativeSelect.Option>

                    <NativeSelect.Option value="MALE">Male</NativeSelect.Option>

                    <NativeSelect.Option value="OTHER">
                        Other
                    </NativeSelect.Option>

                    <NativeSelect.Option value="PREFER_NOT_TO_SAY">
                        Prefer not to say
                    </NativeSelect.Option>
                </NativeSelect.Root>
            </Field.Field>
        </Field.Group>
    </Field.Set>

    <!-- Contact and address -->
    <Field.Set
        class="min-w-0 border-t border-zinc-200 py-4 dark:border-zinc-800"
    >
        <div
            class="mb-3 flex items-center gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800"
        >
            <Field.Legend
                class="text-xs font-semibold tracking-wider text-zinc-900 uppercase dark:text-zinc-100"
                variant="label"
            >
                Contact and address
            </Field.Legend>

            <div
                class="h-px min-w-0 flex-1 bg-linear-to-r from-amber-300/60 to-transparent dark:from-amber-500/20"
            ></div>
        </div>

        <Field.Group
            class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3"
        >
            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-contact"
                >
                    Primary contact number
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-contact"
                    bind:value={draft.contactNumber}
                    {disabled}
                    inputmode="tel"
                    maxlength={32}
                    required
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-email"
                >
                    Email
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-email"
                    bind:value={draft.email}
                    {disabled}
                    maxlength={254}
                    type="email"
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-secondary-contact"
                >
                    Secondary contact number
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-secondary-contact"
                    bind:value={draft.secondaryContactNumber}
                    {disabled}
                    inputmode="tel"
                    maxlength={32}
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-address"
                >
                    Street address
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-address"
                    bind:value={draft.addressLine}
                    {disabled}
                    maxlength={200}
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-barangay"
                >
                    Barangay
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-barangay"
                    bind:value={draft.barangay}
                    {disabled}
                    maxlength={100}
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-city"
                >
                    City or municipality
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-city"
                    bind:value={draft.cityMunicipality}
                    {disabled}
                    maxlength={100}
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-province"
                >
                    Province
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-province"
                    bind:value={draft.province}
                    {disabled}
                    maxlength={100}
                />
            </Field.Field>

            <Field.Field class="min-w-0 gap-1">
                <Field.Label
                    class="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300"
                    for="borrower-postal-code"
                >
                    Postal code
                </Field.Label>

                <Input
                    class="h-9"
                    id="borrower-postal-code"
                    bind:value={draft.postalCode}
                    {disabled}
                    maxlength={32}
                />
            </Field.Field>
        </Field.Group>
    </Field.Set>

    <!-- Internal notes -->
    <Field.Field
        class="min-w-0 gap-1 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
        <div
            class="mb-2 flex items-center gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800"
        >
            <Field.Label
                class="text-xs font-semibold tracking-wider text-zinc-900 uppercase dark:text-zinc-100"
                for="borrower-notes"
            >
                Internal notes
            </Field.Label>

            <div
                class="h-px min-w-0 flex-1 bg-linear-to-r from-amber-300/60 to-transparent dark:from-amber-500/20"
            ></div>
        </div>

        <Textarea
            class="min-h-20 resize-y text-sm"
            id="borrower-notes"
            bind:value={draft.notes}
            {disabled}
            maxlength={2000}
        />

        <Field.Description
            class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400"
        >
            Internal notes are retained with the borrower record.
        </Field.Description>
    </Field.Field>
</div>
