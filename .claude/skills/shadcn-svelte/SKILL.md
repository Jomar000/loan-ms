---
name: shadcn-svelte
description: Project-adapted shadcn-svelte guidance for discovering, adding, refreshing, debugging, styling, and composing UI components in this monorepo. Use for shadcn-svelte components, the CLI, design-system presets, component documentation, registry URLs, theming, or work involving packages/ui/components.json.
---

# shadcn-svelte

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

The CLI adds component source to `packages/ui`; project ownership rules determine where custom behavior belongs.

> **IMPORTANT:** Use the repository-installed CLI from the repository root through the UI workspace, for example `pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte add button`. Do not use `pnpm dlx` or a floating `@latest` CLI.

## Related Skill and Ownership

- Load `svelte-patterns` for every frontend or UI change. Its component ownership, placement, import, styling, and override rules are authoritative when this skill differs from them.
- Treat `packages/ui/src/components/` as replaceable vendor-generated source. Write there only through an explicit shadcn-svelte registry add or refresh workflow.
- Never hand-edit, format, lint-fix, preserve local patches, or add project behavior in generated primitives.
- Put app-specific composition in `apps/web-*`, reusable cross-app components in `packages/ui/src/shared/`, and confirmed non-composable upstream defect corrections in `packages/ui/src/overrides/`.
- Never use an override for ordinary styling or project behavior. Follow `svelte-patterns` for override qualification, compatibility, documentation, migration, and retirement.
- Charts use the shared Chart.js component at `packages/ui/src/shared/chart/`. Never add, refresh, or restore the shadcn-svelte registry `chart` item or its charting dependency; `add --all` and `update --all` must exclude it.

## Current Project Context

Read `packages/ui/components.json`; never expect or create a repository-root `components.json`. Resolve its aliases relative to `packages/ui`, and list `packages/ui/src/components/` when you need the installed primitive layout.

## Imports (Svelte)

Each component lives in its own folder with an `index.ts` barrel. Match the [installation docs](https://shadcn-svelte.com/docs/installation):

- **Multi-part components** (dialog, select, card, field, tabs, …): `import * as Dialog from '@PROJECT_NAME/ui/components/dialog'` then `Dialog.Content`, `Dialog.Title`, `Card.Root`, `Card.Header`, etc. — whatever the barrel exports (short names and/or `Root as …` aliases).
- **Single-component barrels** (only one meaningful component in the folder): **named imports** — `import { Button } from '@PROJECT_NAME/ui/components/button'` and `<Button>`, not `import * as Button` + `Button.Root`. The same pattern applies to `{ Input }`, `{ Badge }`, `{ Spinner }`, `{ Checkbox }`, `{ Separator }`, `{ Skeleton }`, and similar barrels.

```ts
import * as Dialog from '@PROJECT_NAME/ui/components/dialog'
import { Button } from '@PROJECT_NAME/ui/components/button'
import { Separator } from '@PROJECT_NAME/ui/components/separator'
```

Use `@PROJECT_NAME/ui/components/*` for generated primitives, `@PROJECT_NAME/ui/shared/*` for reusable project-owned compositions, and `@PROJECT_NAME/ui/overrides/*` only for qualified source-level replacements. Do not emit generator-internal `$lib/components` imports for consumers.

## Critical Rules

Load the matching reference for the work below; it contains the full rules,
exceptions, and examples. Examples are excerpts: apply `svelte-patterns` imports
and script sections when integrating them.

| Work | Rules and reference |
| --- | --- |
| Styling | [styling.md](./rules/styling.md): built-in variants first; primitive `class` for layout, semantic colors on project markup; `gap-*`, equal-dimension `size-*`, `truncate`, and `cn()`; no manual dark-color overrides. Respect primitive overlay stacking and documented project-owned layer exceptions. |
| Forms | [forms.md](./rules/forms.md): `Field.Group`/`Field.Field`, `InputGroup.Input`/`Textarea` and `Addon`; choose independent Switch/Checkbox booleans versus related ToggleGroup choices; semantic fieldsets only; pair invalid/disabled field and control attributes. |
| Composition | [composition.md](./rules/composition.md): semantic option groups, accessible overlay titles, full Card composition, Tabs.List, Avatar.Fallback, Spinner plus disabled Button (no loading prop). Use Alert, Empty, Separator, Skeleton, Badge, and svelte-sonner instead of equivalent custom markup. Use documented triggers or controlled root open state. |
| Icons | [icons.md](./rules/icons.md): component references from the configured library, `data-icon` on button icons, and no redundant sizing when the parent owns size; retain plain-control and documented visual exceptions. |
| Themes | [customization.md](./customization.md): CSS variables, dark mode, complete light/dark token families, and project-owned wrappers. `.agents/context/COLORS.md` governs tokens and exact raw-color exceptions. |
| CLI | [cli.md](./cli.md): verified commands/flags, preset builder, proxy behavior, and registry configuration. |

## Component Selection

| Need                       | Use                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Button/action              | `Button` with appropriate variant (`import { Button }`)                                             |
| Form inputs                | `Input`, `Select`, `Combobox`, `Switch`, `Checkbox`, `RadioGroup`, `Textarea`, `InputOTP`, `Slider` |
| Independent boolean preferences | One `Switch` or `Checkbox` per preference                                                     |
| Compact related toggle choices | `ToggleGroup.Root` + `ToggleGroup.Item`                                                        |
| Data display               | `Table`, `Card`, `Badge`, `Avatar`                                                                  |
| Navigation                 | `Sidebar`, `NavigationMenu`, `Breadcrumb`, `Tabs`, `Pagination`                                     |
| Overlays                   | `Dialog` (modal), `Sheet` (side panel), `Drawer` (bottom sheet), `AlertDialog` (confirmation)       |
| Feedback                   | `svelte-sonner` (toast), `Alert`, `Progress`, `Skeleton`, `Spinner`                                 |
| Command palette            | `Command` inside `Dialog`                                                                           |
| Charts                     | Shared Chart.js `Chart` from `@PROJECT_NAME/ui/shared/chart`; never add the registry `chart` item   |
| Layout                     | `Card`, `Separator`, `Resizable`, `ScrollArea`, `Accordion`, `Collapsible`                          |
| Empty states               | `Empty`                                                                                             |
| Menus                      | `DropdownMenu`, `ContextMenu`, `Menubar`                                                            |
| Tooltips/info              | `Tooltip`, `HoverCard`, `Popover`                                                                   |

## Key Fields

Use `packages/ui/components.json` and the filesystem — not a separate `info` command:

- **`aliases`** → use the configured paths to understand generated source placement; use the `@PROJECT_NAME/ui/*` package exports in consumers.
- **`tailwind.css`** → the global CSS file where theme variables live. Edit this file for theme tweaks; don't add a second globals file unless the user already uses one.
- **`style`** → visual treatment (e.g. `nova`, `vega`, …) and registry style path.
- **`iconLibrary`** → identifies the configured icon package. When absent, follow `svelte-patterns`; see [icon rules](./rules/icons.md).
- **`registry`** → where the CLI fetches components; default official registry at `shadcn-svelte.com`.
- **`resolvedPaths`** (conceptual) → the CLI resolves aliases relative to `packages/ui`; list `packages/ui/src/components/` to see installed primitives.

See [cli.md](./cli.md) for commands and flags.

## Component Docs, Examples, and Usage

Open `https://shadcn-svelte.com/docs/components/<name>` for docs and examples. **When creating, fixing, debugging, or using a component, read the official page first** so you follow the documented APIs.

## Workflow

1. **Get project context** — read `packages/ui/components.json` and list `packages/ui/src/components/` when needed.
2. **Check installed components first** — don't import components that haven't been added, and don't re-add existing components unless refreshing them.
3. **Discover components** — check [Components](https://shadcn-svelte.com/docs/components). The interactive `add` picker can write files; use it only within an authorized installation task.
4. **Inspect the worktree** — before a registry write, identify existing work without committing, stashing, resetting, or discarding it automatically.
5. **Install** — run `pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte add <name-or-url>`; `add --all` requires all components in scope. Refresh installed primitives through the workflow below. Apply presets to this initialized package with `apply --preset <code>` under the same replacement boundary; see [cli.md](./cli.md).
6. **Review generated output** — read and diff generated files without hand-editing, reformatting, or lint-fixing them.
7. **Handle incompatible output outside primitives** — if a registry item emits incorrect aliases or contains a defect, confirm registry compatibility and current upstream source, then use composition, compatible dependency changes, a corrected registry source, or a qualified override. Never patch the generated file.
8. **Remote registry items** — adding by URL must be explicit; confirm an unknown registry URL or item before running `add`.

## Refreshing Components

The installed CLI supports `update`; verify its flags directly with `pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte update --help` even when top-level help omits it. Follow [cli.md](./cli.md) for commands, presets, and the verified version. Refresh only the named generated files the user has explicitly authorized, then review `git diff`; existing authorization does not require another confirmation.

1. Confirm generated primitives contain no local patches that must be preserved.
2. Before refreshing, move any still-required non-composable correction into a documented override and migrate its consumers.
3. Run `pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte update [component]`; use `update --all` only when the approved scope is every installed primitive.
4. Do not preserve, reapply, or resolve conflicts in favor of local primitive patches.
5. Re-evaluate relevant overrides and retire them after verified upstream correction and consumer migration.

## Skill Maintenance

This is a project-adapted upstream skill. Do not blindly replace this directory with `skills update`.

- **Official discovery/install page:** [shadcn-svelte Skills](https://shadcn-svelte.com/docs/skills)
- **Canonical source and revisions:** [Skill Upstream Provenance](../PROVENANCE.md#vendored-skills)
- **Tracked branch:** `main`

For upstream updates, follow the provenance registry's maintenance procedure for `skills/shadcn-svelte` on `main`. Preserve monorepo paths and immutable-primitive ownership; verify command and flag claims against the installed CLI before recording revisions.
