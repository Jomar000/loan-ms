# Styling & Customization

See [customization.md](../customization.md) for theming, CSS variables, and adding custom colors.

## Contents

- Semantic colors
- Built-in variants first
- class for layout only
- No space-x-_ / space-y-_
- Prefer size-_ over w-_ h-\* when equal
- Prefer truncate shorthand
- No manual dark: color overrides
- Use cn() for conditional classes
- Respect owned stacking layers

---

## Semantic colors

**Incorrect:**

```svelte
<div class="bg-blue-500 text-white">
  <p class="text-gray-600">Secondary text</p>
</div>
```

**Correct:**

```svelte
<div class="bg-primary text-primary-foreground">
  <p class="text-muted-foreground">Secondary text</p>
</div>
```

---

## No raw color values for status/state indicators

For positive, negative, or status indicators, use Badge variants or implemented semantic tokens such as `text-destructive`; don't reach for raw Tailwind colors. A raw color is valid only when `.agents/context/COLORS.md` records the exact value/class and source glob as a component exception.

**Incorrect:**

```svelte
<span class="text-emerald-600">+20.1%</span>
<span class="text-green-500">Active</span>
<span class="text-red-600">-3.2%</span>
```

**Correct:**

```svelte
<script lang="ts">
  import { Badge } from "@PROJECT_NAME/ui/components/badge";
</script>

<Badge variant="secondary">+20.1%</Badge>
<Badge>Active</Badge>
<span class="text-destructive">-3.2%</span>
```

If you need a success/positive color that does not exist, check `.agents/context/COLORS.md`: reserved `TBD` tokens remain unavailable. Use an existing Badge variant or add a complete light/dark token family to the color contract and Tailwind v4 theme together (see [customization.md](../customization.md)).

---

## Built-in variants first

**Incorrect:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
</script>

<Button class="border-input hover:bg-accent border bg-transparent"
  >Click me</Button
>
```

**Correct:**

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
</script>

<Button variant="outline">Click me</Button>
```

---

## class for layout only

On generated primitives, use `class` only for layout (e.g. `max-w-md`, `mx-auto`, `mt-4`), never to override colors or typography. Use built-in variants or shared CSS variables for primitive colors; apply semantic color utilities to project-owned markup.

**Incorrect:**

```svelte
<script lang="ts">
  import * as Card from "@PROJECT_NAME/ui/components/card";
</script>

<Card.Root class="bg-blue-100 font-bold text-blue-900">
  <Card.Content>Dashboard</Card.Content>
</Card.Root>
```

**Correct:**

```svelte
<script lang="ts">
  import * as Card from "@PROJECT_NAME/ui/components/card";
</script>

<Card.Root class="mx-auto max-w-md">
  <Card.Content>Dashboard</Card.Content>
</Card.Root>
```

To customize a component's appearance, prefer these approaches in order:

1. **Built-in variants** — `variant="outline"`, `variant="destructive"`, etc.
2. **Semantic color tokens on project-owned markup** — `bg-primary`, `text-muted-foreground`.
3. **CSS variables** — define custom colors in the global CSS file (see [customization.md](../customization.md)).
4. **Project-owned wrappers** — compose primitives in `apps/web-*` or `packages/ui/src/shared/`.

Never customize generated source under `packages/ui/src/components/`. Use `packages/ui/src/overrides/` only for defects that satisfy the `svelte-patterns` override rules, not for appearance changes.

---

## No space-x-_ / space-y-_

Use `gap-*` instead. `space-y-4` → `flex flex-col gap-4`. `space-x-2` → `flex gap-2`.

```svelte
<script lang="ts">
  import { Input } from "@PROJECT_NAME/ui/components/input";
  import { Button } from "@PROJECT_NAME/ui/components/button";
</script>

<div class="flex flex-col gap-4">
  <Input />
  <Input />
  <Button>Submit</Button>
</div>
```

---

## Prefer size-_ over w-_ h-\* when equal

`size-10` not `w-10 h-10`. Applies to icons, avatars, skeletons, etc.

---

## Prefer truncate shorthand

`truncate` not `overflow-hidden text-ellipsis whitespace-nowrap`.

---

## No manual dark: color overrides

Use semantic tokens — they handle light/dark via CSS variables. `bg-background text-foreground` not `bg-white dark:bg-gray-950`.

---

## Use cn() for conditional classes

Use the `cn()` utility from the project for conditional or merged class names. Don't write manual ternaries in `class` strings.

**Incorrect:**

```svelte
<script lang="ts">
  let isActive = $state(false);
</script>

<div class={`flex items-center ${isActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
```

**Correct:**

```svelte
<script lang="ts">
  import { cn } from "@PROJECT_NAME/ui/utils";
  let isActive = $state(false);
</script>

<div class={cn("flex items-center", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
```

---

## Respect owned stacking layers

`Dialog`, `Sheet`, `Drawer`, `AlertDialog`, `DropdownMenu`, `Popover`, `Tooltip`, and `HoverCard` handle their own stacking; do not override their z-index at call sites. A project-owned fixed layer may use an explicit z-index when its relationship to overlays is intentional, such as the loading screen or staging viewport frame. A qualified source-level override may retain the upstream primitive's stacking value as part of API/behavior parity.
