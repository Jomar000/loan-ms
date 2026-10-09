---
name: COLORS
description: Color palette, design tokens, semantic states, and usage rules.
---

# Color System

## Authoritative Guidance

`DESIGN.md` is the source of truth for the project's visual system. This document inventories the implemented color tokens and must stay synchronized with `packages/ui/src/styles/globals.css`. Any mismatch between this inventory and the shared CSS is merge-blocking.

Downstream forks must preserve this section. They must replace `Template-Specific Context` with `Fork-Specific Context` and record the fork's token inventory, values, roles, and component exceptions there.

Light values map to `:root`; dark values map to `.dark`. Documented token values must match the shared theme. Implemented semantic tokens are available to applications. Reserved tokens marked `TBD` must remain absent from CSS and frontend usage until both values are defined here and implemented in the shared theme.

### Usage rules

- Use semantic tokens before raw color utilities or literals.
- Pair surfaces with their matching foreground tokens and verify contrast in both themes.
- Use `primary` for primary interactions and `destructive` for destructive actions.
- Use `success`, `warning`, `danger`, and `info` only after their complete token families are defined.
- Use `border`, `input`, and `ring` for control boundaries and focus treatment.
- Keep raw colors limited to the documented component exceptions.

### Maintenance rules

- Update this document and `packages/ui/src/styles/globals.css` together in the same change.
- Treat any documented-token, CSS-token, or shared-theme mapping mismatch as merge-blocking.
- Keep every implemented token represented here with its exact light and dark values.
- Replace every required `TBD` before using a semantic extension token.
- Name semantic color tokens by purpose and keep their `@theme` aliases aligned; let the Tailwind utility express the CSS property.
- Validate foreground/background contrast and visible focus states after palette changes.
- Record unavoidable component-level color exceptions in the project-specific exception table.

## Template-Specific Context

### Global token

| Token      | Value    | Role                         |
| ---------- | -------- | ---------------------------- |
| `--radius` | `0.5rem` | Base component corner radius |

### Core theme tokens

| Token                    | Light                        | Dark                         | Role                           |
| ------------------------ | ---------------------------- | ---------------------------- | ------------------------------ |
| `--accent`               | `#fffbeb`                    | `#302714`                    | Hover and accent surface       |
| `--accent-foreground`    | `#713f12`                    | `#fcd34d`                    | Accent text                    |
| `--background`           | `#fafafa`                    | `#171717`                    | Application canvas             |
| `--border`               | `#e4e4e7`                    | `#3f3f46`                    | Standard border                |
| `--card`                 | `oklch(1 0 0)`               | `#202020`                    | Card surface                   |
| `--card-foreground`      | `oklch(0.141 0.005 285.823)` | `oklch(0.985 0 0)`           | Card text                      |
| `--destructive`          | `oklch(0.577 0.245 27.325)`  | `oklch(0.704 0.191 22.216)`  | Destructive actions and errors |
| `--foreground`           | `oklch(0.141 0.005 285.823)` | `oklch(0.985 0 0)`           | Default text                   |
| `--input`                | `#d4d4d8`                    | `#52525b`                    | Input border                   |
| `--muted`                | `#f4f4f5`                    | `#27272a`                    | Muted surface                  |
| `--muted-foreground`     | `oklch(0.552 0.016 285.938)` | `oklch(0.705 0.015 286.067)` | Muted text                     |
| `--popover`              | `oklch(1 0 0)`               | `#202020`                    | Popover surface                |
| `--popover-foreground`   | `oklch(0.141 0.005 285.823)` | `oklch(0.985 0 0)`           | Popover text                   |
| `--primary`              | `#f59e0b`                    | `#fbbf24`                    | Primary actions                |
| `--primary-foreground`   | `#09090b`                    | `#09090b`                    | Primary-action text            |
| `--ring`                 | `#d97706`                    | `#fbbf24`                    | Focus ring                     |
| `--secondary`            | `#f4f4f5`                    | `#27272a`                    | Secondary surface              |
| `--secondary-foreground` | `oklch(0.21 0.006 285.885)`  | `oklch(0.985 0 0)`           | Secondary text                 |

### Chart tokens

| Token       | Light     | Dark      | Role           |
| ----------- | --------- | --------- | -------------- |
| `--chart-1` | `#d97706` | `#fbbf24` | Chart series 1 |
| `--chart-2` | `#71717a` | `#a1a1aa` | Chart series 2 |
| `--chart-3` | `#f59e0b` | `#d97706` | Chart series 3 |
| `--chart-4` | `#a1a1aa` | `#71717a` | Chart series 4 |
| `--chart-5` | `#92400e` | `#fcd34d` | Chart series 5 |

### Sidebar tokens

| Token                          | Light                        | Dark                        | Role                             |
| ------------------------------ | ---------------------------- | --------------------------- | -------------------------------- |
| `--sidebar`                    | `oklch(0.985 0 0)`           | `oklch(0.21 0.006 285.885)` | Sidebar surface                  |
| `--sidebar-accent`             | `#fffbeb`                    | `#302714`                   | Sidebar hover and active surface |
| `--sidebar-accent-foreground`  | `#713f12`                    | `#fcd34d`                   | Sidebar accent text              |
| `--sidebar-border`             | `#e4e4e7`                    | `#3f3f46`                   | Sidebar border                   |
| `--sidebar-foreground`         | `oklch(0.141 0.005 285.823)` | `oklch(0.985 0 0)`          | Sidebar text                     |
| `--sidebar-primary`            | `#f59e0b`                    | `#fbbf24`                   | Sidebar primary action           |
| `--sidebar-primary-foreground` | `#09090b`                    | `#09090b`                   | Sidebar primary-action text      |
| `--sidebar-ring`               | `#d97706`                    | `#fbbf24`                   | Sidebar focus ring               |

### Implemented semantic tokens

These shared semantic tokens are implemented in both themes and mapped through `@theme inline`.

| Token                   | Light                       | Dark                        | Role                               |
| ----------------------- | --------------------------- | --------------------------- | ---------------------------------- |
| `--environment-staging` | `oklch(0.852 0.199 91.936)` | `oklch(0.852 0.199 91.936)` | Staging environment viewport frame |

### Status tokens

These complete token families provide soft green, yellow, red, and blue status badges in both themes. Paid and positive states use success; upcoming and pending states use warning; overdue and failures use danger; informational states use info. Status labels remain visible alongside color.

| Token                     | Light     | Dark      | Role                          |
| ------------------------- | --------- | --------- | ----------------------------- |
| `--danger`                | `#fff1f2` | `#3b131d` | Danger status surface         |
| `--danger-active`         | `#ffe4e6` | `#4c0519` | Danger selected surface       |
| `--danger-active-border`  | `#fecdd3` | `#881337` | Danger border                 |
| `--danger-active-ring`    | `#f43f5e` | `#fb7185` | Danger focus ring             |
| `--danger-foreground`     | `#9f1239` | `#fda4af` | Danger status text and icons  |
| `--info`                  | `#eff6ff` | `#172554` | Info status surface           |
| `--info-active`           | `#dbeafe` | `#1e3a8a` | Info selected surface         |
| `--info-active-border`    | `#bfdbfe` | `#1e40af` | Info border                   |
| `--info-active-ring`      | `#3b82f6` | `#60a5fa` | Info focus ring               |
| `--info-foreground`       | `#1e40af` | `#bfdbfe` | Info status text and icons    |
| `--success`               | `#ecfdf5` | `#052e24` | Success status surface        |
| `--success-active`        | `#d1fae5` | `#064e3b` | Success selected surface      |
| `--success-active-border` | `#a7f3d0` | `#065f46` | Success border                |
| `--success-active-ring`   | `#10b981` | `#34d399` | Success focus ring            |
| `--success-foreground`    | `#065f46` | `#a7f3d0` | Success status text and icons |
| `--warning`               | `#fffbeb` | `#302714` | Warning status surface        |
| `--warning-active`        | `#fef3c7` | `#422006` | Warning selected surface      |
| `--warning-active-border` | `#fde68a` | `#713f12` | Warning border                |
| `--warning-active-ring`   | `#eab308` | `#facc15` | Warning focus ring            |
| `--warning-foreground`    | `#854d0e` | `#fde68a` | Warning status text and icons |

### Remaining reserved semantic tokens

Define both theme values and add their corresponding shared-theme mappings before using these tokens. A status family is complete only when its surface, foreground, active surface, active border, and active ring tokens are all defined in both themes.

| Token                     | Light | Dark  | Role                            |
| ------------------------- | ----- | ----- | ------------------------------- |
| `--brand-link`            | `TBD` | `TBD` | Branded links and link emphasis |
| `--neutral-active`        | `TBD` | `TBD` | Selected neutral surface        |
| `--neutral-active-border` | `TBD` | `TBD` | Selected neutral border         |
| `--neutral-active-ring`   | `TBD` | `TBD` | Selected neutral ring           |

### Component color exceptions

Add a row only when a component cannot use an existing semantic token. Values and source globs must identify the exact allowed implementation, not descriptive examples.

| Exception            | Light value or class                                     | Dark value or class                                      | Source glob                                                                      | Reason                                                           |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Loader animation     | `#fff`, `#1c1c1e`                                        | `#fff`, `#1c1c1e`                                        | `apps/web-*/src/lib/components/loader/LoadingScreen.svelte`                      | Preserves the fixed inverse stroke animation                     |
| Modal overlays       | `bg-black/10`                                            | `bg-black/10`                                            | `packages/ui/src/components/{alert-dialog,dialog,drawer,sheet}/*-overlay.svelte` | Provides a theme-independent translucent scrim                   |
| Slider thumb         | `bg-white`                                               | `bg-white`                                               | `packages/ui/src/components/slider/slider.svelte`                                | Preserves the generated control's fixed thumb contrast           |
| HLS media surface    | `bg-black`                                               | `bg-black`                                               | `packages/ui/src/shared/video/Hls.svelte`                                        | Provides a stable letterbox surface around native video playback |
| YouTube media chrome | `bg-black`, `bg-black/60`, `text-white`, `text-white/60` | `bg-black`, `bg-black/60`, `text-white`, `text-white/60` | `packages/ui/src/shared/video/YouTube.svelte`                                    | Maintains predictable contrast over video thumbnails and media   |
