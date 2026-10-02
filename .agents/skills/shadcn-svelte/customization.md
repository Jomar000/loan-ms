# Customization & Theming

Generated primitives reference semantic CSS variable tokens. Change tokens or compose project-owned wrappers; never customize generated primitive source.

## Contents

- How it works (CSS variables → Tailwind utilities → components)
- Color variables and OKLCH format
- Dark mode setup
- Changing the theme (presets, CSS variables)
- Adding custom colors (Tailwind v4)
- Border radius
- Customizing components (variants, class, wrappers)
- Refreshing generated components

---

## How It Works

1. CSS variables defined in `:root` (light) and `.dark` (dark mode).
2. Tailwind maps them to utilities: `bg-primary`, `text-muted-foreground`, etc.
3. Components use these utilities — changing a variable changes all components that reference it.

---

## Color Variables

Surface/text pairs follow the `name` / `name-foreground` convention; standalone border, ring, and chart tokens do not. The base variable is for backgrounds, `-foreground` is for text/icons on that background.

| Variable                                     | Purpose                          |
| -------------------------------------------- | -------------------------------- |
| `--background` / `--foreground`              | Page background and default text |
| `--card` / `--card-foreground`               | Card surfaces                    |
| `--primary` / `--primary-foreground`         | Primary buttons and actions      |
| `--secondary` / `--secondary-foreground`     | Secondary actions                |
| `--muted` / `--muted-foreground`             | Muted/disabled states            |
| `--accent` / `--accent-foreground`           | Hover and accent states          |
| `--destructive`                              | Error and destructive actions    |
| `--border`                                   | Default border color             |
| `--input`                                    | Form input borders               |
| `--ring`                                     | Focus ring color                 |
| `--chart-1` through `--chart-5`              | Chart/data visualization         |
| `--sidebar-*`                                | Sidebar-specific colors          |

Colors use OKLCH: `--primary: oklch(0.205 0 0)` where values are lightness (0–1), chroma (0 = gray), and hue (0–360).

---

## Dark Mode

Class-based toggle via `.dark` on the root element. In SvelteKit, use [mode-watcher](https://github.com/svecosystem/mode-watcher) (see [Dark mode — Svelte](https://shadcn-svelte.com/docs/dark-mode/svelte)):

```svelte
<script lang="ts">
  import { ModeWatcher } from "mode-watcher";
  let { children } = $props();
</script>

<ModeWatcher />
{@render children?.()}
```

---

## Changing the Theme

Use a **preset** from the design-system builder on [shadcn-svelte.com](https://shadcn-svelte.com) and apply it to the initialized UI package:

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte apply --preset <code>
```

Or edit CSS variables directly in the file set in `packages/ui/components.json` as `tailwind.css` (`packages/ui/src/styles/globals.css` in this repository).

`apply` can reinstall generated components. Treat it as an explicit registry refresh, review its scope first, and never preserve or reapply local primitive patches.

---

## Adding Custom Colors

Treat `.agents/context/COLORS.md` as the color contract. Add both light and dark values there and to the global CSS file path in `packages/ui/components.json` (`tailwind.css`), then map them through Tailwind v4's `@theme inline`. Do not create a second global CSS file. Raw color utilities/literals are allowed only by an exact component exception in `COLORS.md`.

For status colors such as warning, define the surface, foreground, active surface, active border, and active ring in both themes and map all five before use. The example below illustrates a non-status custom surface pair; values are illustrative, not approved project tokens.

```css
/* 1. Define in the global CSS file. */
:root {
  --custom-surface: oklch(0.84 0.16 84);
  --custom-surface-foreground: oklch(0.28 0.07 46);
}
.dark {
  --custom-surface: oklch(0.41 0.11 46);
  --custom-surface-foreground: oklch(0.99 0.02 95);
}
```

```css
/* 2. Register with Tailwind v4 (@theme inline). */
@theme inline {
  --color-custom-surface: var(--custom-surface);
  --color-custom-surface-foreground: var(--custom-surface-foreground);
}
```

```svelte
<!-- 3. Use the mapped Tailwind v4 utilities in components. -->
<div class="bg-custom-surface text-custom-surface-foreground">Example</div>
```

---

## Border Radius

`--radius` controls border radius globally. Components derive values from it (`rounded-lg` = `var(--radius)`, `rounded-md` = `calc(var(--radius) - 2px)`).

---

## Customizing Components

See also: [rules/styling.md](./rules/styling.md) for Incorrect/Correct examples.

Prefer these approaches in order:

### 1. Built-in variants

```svelte
<script lang="ts">
  import { Button } from "@PROJECT_NAME/ui/components/button";
</script>

<Button variant="outline" size="sm">Click</Button>
```

### 2. Tailwind classes via `class`

```svelte
<script lang="ts">
  import * as Card from "@PROJECT_NAME/ui/components/card";
</script>

<Card.Root class="mx-auto max-w-md">
  <Card.Content>...</Card.Content>
</Card.Root>
```

### 3. Wrapper components

Compose shadcn-svelte primitives into higher-level `.svelte` files. Put app-specific wrappers in `apps/web-*` and reusable cross-app wrappers in `packages/ui/src/shared/`. Do not add variants or project behavior to `packages/ui/src/components/`.

Expose the required title, description, trigger snippet, and confirmation handler through the wrapper's typed props. For asynchronous confirmation, follow [Safe and Idempotent Submissions](../svelte-data-forms/SKILL.md#safe-and-idempotent-submissions): await confirmed success before closing and guard every dismissal path while pending. A wrapper must not close immediately after calling an unawaited `onConfirm`.

---

## Refreshing Generated Components

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte update button
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte update --all
```

Follow [Refreshing Components](./SKILL.md#refreshing-components) for replacement authorization and diff review, and [cli.md](./cli.md#update--refresh-installed-components) for installed-version command verification.
