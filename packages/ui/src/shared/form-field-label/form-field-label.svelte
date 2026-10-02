<script lang="ts">
    import * as Field from '$lib/components/field/index.js'
    import {
        FieldHelp,
        type FieldHelpPlacement,
    } from '$lib/shared/field-help/index.js'

    /** Properties for a field label with standardized requirement and help states. */
    interface Props {
        /** Id of the labelled form control. */
        for: string
        label: string
        /** Adds visible and screen-reader required indicators. */
        required?: boolean
        /** Shows Optional when the field is not required. */
        showOptional?: boolean
        /** Contextual help announced by the associated control. */
        helpDescription?: string
        /** Id used by the control's `aria-describedby`; defaults to `${for}-help`. */
        helpDescriptionId?: string
        /** Side on which the help tooltip and popover appear. */
        helpPlacement?: FieldHelpPlacement
    }

    let {
        for: htmlFor,
        label,
        required = false,
        showOptional = false,
        helpDescription,
        helpDescriptionId,
        helpPlacement = 'top',
    }: Props = $props()

    const resolvedHelpDescriptionId = $derived(
        helpDescriptionId ?? `${htmlFor}-help`,
    )
</script>

<!--
@component
Use `FormFieldLabel` whenever a field needs required state, visible Optional
text, or contextual help. Import it from
`@hyperion/ui/shared/form-field-label` and place it in the field-label row.

`for` labels the matching control. When `helpDescription` is present, the
control's `aria-describedby` must match `helpDescriptionId`, or `${for}-help`
when no id is supplied. `required` displays the required marker;
`showOptional` displays Optional only when the field is not required, so
`required` takes precedence when both are true. These display props do not set
native `required` or `aria-required`; the associated control owns those states.
Required state includes a screen-reader label, and help uses the shared
persistent description plus tooltip/popover behavior.

```svelte
<script lang="ts">
    import { Input } from '@hyperion/ui/components/input'
    import { FormFieldLabel } from '@hyperion/ui/shared/form-field-label'
</script>

<FormFieldLabel
    for="email"
    helpDescription="Used for account notifications."
    label="Email"
    required
/>
<Input id="email" aria-describedby="email-help" aria-required="true" required />

<FormFieldLabel for="nickname" label="Nickname" showOptional />
<Input id="nickname" />
```

Use raw `Field.Label` for a simple label with none of these behaviors.
-->

<div
    class="flex min-h-8 items-center gap-1"
    data-slot="form-field-label"
>
    <Field.Label for={htmlFor}>
        {label}
        {#if required}
            <span aria-hidden="true">*</span>
            <span class="sr-only">(required)</span>
        {/if}
    </Field.Label>
    {#if showOptional && !required}
        <span class="text-sm text-muted-foreground">Optional</span>
    {/if}
    {#if helpDescription}
        <FieldHelp
            description={helpDescription}
            descriptionId={resolvedHelpDescriptionId}
            label={`${label} help`}
            placement={helpPlacement}
        />
    {/if}
</div>
