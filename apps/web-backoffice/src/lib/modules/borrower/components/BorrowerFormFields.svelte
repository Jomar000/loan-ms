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

<div class="grid gap-3 xl:grid-cols-2">
    <Field.Set>
        <Field.Legend variant="label">Personal information</Field.Legend>
        <Field.Group class="grid gap-4 md:grid-cols-2">
            <Field.Field>
                <Field.Label for="borrower-full-name">Full name</Field.Label>
                <Input
                    id="borrower-full-name"
                    bind:value={draft.fullName}
                    {disabled}
                    maxlength={200}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-gender">Gender</Field.Label>
                <NativeSelect.Root
                    id="borrower-gender"
                    bind:value={draft.gender}
                    {disabled}
                >
                    <NativeSelect.Option value="FEMALE"
                        >Female</NativeSelect.Option
                    >
                    <NativeSelect.Option value="MALE">Male</NativeSelect.Option>
                    <NativeSelect.Option value="OTHER"
                        >Other</NativeSelect.Option
                    >
                    <NativeSelect.Option value="PREFER_NOT_TO_SAY">
                        Prefer not to say
                    </NativeSelect.Option>
                </NativeSelect.Root>
            </Field.Field>
        </Field.Group>
    </Field.Set>

    <Field.Set>
        <Field.Legend variant="label">Contact and address</Field.Legend>
        <Field.Group class="grid gap-4 md:grid-cols-2">
            <Field.Field>
                <Field.Label for="borrower-contact">Mobile number</Field.Label>
                <Input
                    id="borrower-contact"
                    bind:value={draft.contactNumber}
                    {disabled}
                    inputmode="tel"
                    maxlength={32}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-email">Email</Field.Label>
                <Input
                    id="borrower-email"
                    bind:value={draft.email}
                    {disabled}
                    maxlength={254}
                    type="email"
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-secondary-contact">
                    Secondary contact number
                </Field.Label>
                <Input
                    id="borrower-secondary-contact"
                    bind:value={draft.secondaryContactNumber}
                    {disabled}
                    inputmode="tel"
                    maxlength={32}
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-address">Street address</Field.Label>
                <Input
                    id="borrower-address"
                    bind:value={draft.addressLine}
                    {disabled}
                    maxlength={200}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-barangay">Barangay</Field.Label>
                <Input
                    id="borrower-barangay"
                    bind:value={draft.barangay}
                    {disabled}
                    maxlength={100}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-city"
                    >City or municipality</Field.Label
                >
                <Input
                    id="borrower-city"
                    bind:value={draft.cityMunicipality}
                    {disabled}
                    maxlength={100}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-province">Province</Field.Label>
                <Input
                    id="borrower-province"
                    bind:value={draft.province}
                    {disabled}
                    maxlength={100}
                    required
                />
            </Field.Field>
            <Field.Field>
                <Field.Label for="borrower-postal-code">Postal code</Field.Label
                >
                <Input
                    id="borrower-postal-code"
                    bind:value={draft.postalCode}
                    {disabled}
                    maxlength={32}
                />
            </Field.Field>
        </Field.Group>
    </Field.Set>

    <Field.Field class="xl:col-span-2">
        <Field.Label for="borrower-notes">Internal notes</Field.Label>
        <Textarea
            id="borrower-notes"
            bind:value={draft.notes}
            {disabled}
            maxlength={2000}
        />
        <Field.Description>
            Internal notes are retained with the borrower record.
        </Field.Description>
    </Field.Field>
</div>
