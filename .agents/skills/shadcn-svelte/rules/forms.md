# Forms & Inputs

## Contents

- Forms use Field.Group + Field.Field
- InputGroup requires InputGroup.Input/InputGroup.Textarea
- Buttons inside inputs use InputGroup.Root + InputGroup.Addon
- Choose Switch/Checkbox/RadioGroup/ToggleGroup by value semantics
- Field.Set + Field.Legend for semantic fieldsets
- Field validation and disabled states

---

## Forms use Field.Group + Field.Field

Use the installed short namespace aliases: `Field.Group` + `Field.Field`, never raw `div` with `space-y-*`. Long aliases such as `FieldGroup` remain valid for direct named imports.

```svelte
<script lang="ts">
  import * as Field from "@PROJECT_NAME/ui/components/field";
  import { Input } from "@PROJECT_NAME/ui/components/input";
</script>

<Field.Group>
  <Field.Field>
    <Field.Label for="email">Email</Field.Label>
    <Input id="email" type="email" />
  </Field.Field>
  <Field.Field>
    <Field.Label for="password">Password</Field.Label>
    <Input id="password" type="password" />
  </Field.Field>
</Field.Group>
```

Use `Field.Field` with `orientation="horizontal"` for settings pages. Use `Field.Label` with `class="sr-only"` for visually hidden labels.

**Choosing form controls:**

- Simple text input → `Input`
- Dropdown with predefined options → `Select`
- Searchable dropdown → `Combobox`
- Native HTML select (no JS) → `native-select`
- Independent boolean preference → one `Switch` (settings) or `Checkbox` (forms) per value
- Single choice from few options → `RadioGroup`
- Compact related toggle-button choices → `ToggleGroup.Root` + `ToggleGroup.Item`
- OTP/verification code → `InputOTP`
- Multi-line text → `Textarea`

---

## InputGroup requires InputGroup.Input/InputGroup.Textarea

Never use raw `Input` or `Textarea` inside an `InputGroup.Root`.

**Incorrect:**

```svelte
<script lang="ts">
  import * as InputGroup from "@PROJECT_NAME/ui/components/input-group";
  import { Input } from "@PROJECT_NAME/ui/components/input";
</script>

<InputGroup.Root>
  <Input placeholder="Search..." />
</InputGroup.Root>
```

**Correct:**

```svelte
<script lang="ts">
  import * as InputGroup from "@PROJECT_NAME/ui/components/input-group";
</script>

<InputGroup.Root>
  <InputGroup.Input placeholder="Search..." />
</InputGroup.Root>
```

---

## Buttons inside inputs use InputGroup.Root + InputGroup.Addon

Never place a `Button` directly inside or adjacent to an `Input` with custom positioning.

**Incorrect:**

```svelte
<script lang="ts">
  import { Input } from "@PROJECT_NAME/ui/components/input";
  import { Button } from "@PROJECT_NAME/ui/components/button";
  import SearchIcon from "@lucide/svelte/icons/search";
</script>

<div class="relative">
  <Input placeholder="Search..." class="pr-10" />
  <Button class="absolute top-0 right-0" size="icon">
    <SearchIcon />
  </Button>
</div>
```

**Correct:**

```svelte
<script lang="ts">
  import * as InputGroup from "@PROJECT_NAME/ui/components/input-group";
  import { Button } from "@PROJECT_NAME/ui/components/button";
  import SearchIcon from "@lucide/svelte/icons/search";
</script>

<InputGroup.Root>
  <InputGroup.Input placeholder="Search..." />
  <InputGroup.Addon>
    <Button size="icon">
      <SearchIcon data-icon="inline-start" />
    </Button>
  </InputGroup.Addon>
</InputGroup.Root>
```

---

## Use ToggleGroup only for related toggle-button choices

Don't manually loop `Button` components with active state. Use `ToggleGroup` for a compact single- or multi-select toggle-button set. Independent booleans such as email, SMS, and push preferences each use their own `Switch` or `Checkbox` so toggling one does not encode the others.

**Incorrect:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
  let selected = $state("daily");
</script>

<div class="flex gap-2">
  {#each ["daily", "weekly", "monthly"] as option (option)}
    <Button
      variant={selected === option ? "default" : "outline"}
      onclick={() => (selected = option)}
    >
      {option}
    </Button>
  {/each}
</div>
```

**Correct:**

```svelte
<script lang="ts">
  import * as ToggleGroup from "@PROJECT_NAME/ui/components/toggle-group";
  let selected = $state("daily");
</script>

<ToggleGroup.Root bind:value={selected} spacing={2}>
  <ToggleGroup.Item value="daily">Daily</ToggleGroup.Item>
  <ToggleGroup.Item value="weekly">Weekly</ToggleGroup.Item>
  <ToggleGroup.Item value="monthly">Monthly</ToggleGroup.Item>
</ToggleGroup.Root>
```

Combine with `Field` for labelled toggle groups:

```svelte
<script lang="ts">
  import * as Field from "@PROJECT_NAME/ui/components/field";
  import * as ToggleGroup from "@PROJECT_NAME/ui/components/toggle-group";
</script>

<Field.Field orientation="horizontal">
  <Field.Title id="theme-label">Theme</Field.Title>
  <ToggleGroup.Root aria-labelledby="theme-label" spacing={2}>
    <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
    <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
    <ToggleGroup.Item value="system">System</ToggleGroup.Item>
  </ToggleGroup.Root>
</Field.Field>
```

---

## Field.Set + Field.Legend for grouping related fields

Use `Field.Set` + `Field.Legend` when related controls form a semantic fieldset. Do not add a fieldset wrapper to unrelated fields or a single standalone control.

```svelte
<script lang="ts">
  import * as Field from "@PROJECT_NAME/ui/components/field";
  import { Checkbox } from "@PROJECT_NAME/ui/components/checkbox";
</script>

<Field.Set>
  <Field.Legend variant="label">Preferences</Field.Legend>
  <Field.Description>Select all that apply.</Field.Description>
  <Field.Group class="gap-3">
    <Field.Field orientation="horizontal">
      <Checkbox id="dark" />
      <Field.Label for="dark">Dark mode</Field.Label>
    </Field.Field>
  </Field.Group>
</Field.Set>
```

---

## Field validation and disabled states

Both attributes are needed — `data-invalid`/`data-disabled` styles the field (label, description), while `aria-invalid`/`disabled` styles the control.

```svelte
<script lang="ts">
  import * as Field from "@PROJECT_NAME/ui/components/field";
  import { Input } from "@PROJECT_NAME/ui/components/input";
</script>

<!-- Invalid. -->
<Field.Field data-invalid>
  <Field.Label for="email">Email</Field.Label>
  <Input id="email" aria-invalid />
  <Field.Description>Invalid email address.</Field.Description>
</Field.Field>

<!-- Disabled. -->
<Field.Field data-disabled>
  <Field.Label for="email">Email</Field.Label>
  <Input id="email" disabled />
</Field.Field>
```

Works for all controls: `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroupItem`, `Switch`, `Slider`, `NativeSelect`, `InputOTP`.
