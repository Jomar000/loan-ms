---
name: DESIGN
description: Canonical visual direction, spacing, layout behavior, component styling, responsive rules, and implementation constraints for the Loan Management System.
---

# Design

This file is the primary design contract for the Loan Management System UI.

Agents must follow this document when creating, redesigning, or modifying pages and components. Preserve product behavior and business logic unless the task explicitly requires logic changes.

The visual system is a **Corporate Bento Workstation** using a **Gold + Dark Charcoal** palette. The interface should feel disciplined, compact, professional, data-dense, and suitable for daily financial operations.

## 1. Core Design Principles

- Use a corporate Bento layout: modular cards, clearly separated work areas, compact information density, and strong visual hierarchy.
- Use dark charcoal as the primary dark-mode surface and gold/amber as the main accent.
- Keep layouts compact. Avoid excessive whitespace, oversized cards, and decorative padding.
- Financial information must be immediately scannable.
- Tables are first-class workspace components and should use as much remaining viewport height as practical.
- Pages and large workspaces must scroll when their content exceeds the available screen height.
- Internal table regions may scroll independently when appropriate.
- Use responsive layouts that collapse cleanly on smaller screens without losing important information.
- Use subtle borders instead of heavy shadows.
- Use gold sparingly and intentionally for primary actions, active states, focus, important totals, and selected items.
- Destructive actions remain red.
- Success states may use green where semantically necessary, but gold remains the dominant application accent.
- Neutral information and secondary surfaces should use Zinc/charcoal tones rather than introducing competing accent colors.
- Dark mode is mandatory and must be designed intentionally, not treated as an automatic inversion.

## 2. Implementation Rules

These rules are mandatory unless the task explicitly overrides them.

- Use Tailwind CSS classes only for page/component styling.
- Use the existing `@loanms/ui/components/*` component library whenever a suitable component already exists.
- Do not introduce a new styling framework.
- Do not add arbitrary global CSS for page-specific design.
- Do not rename, remove, or rewrite existing script logic during visual redesign work.
- Preserve imports, state, derived values, effects, queries, mutations, handlers, helpers, validation, events, loops, bindings, role checks, and API behavior.
- Presentation markup and Tailwind classes may be changed.
- Existing component contracts must remain intact unless a task explicitly requests an API change.
- Keep source code clean and consistent.
- Do not introduce irregular Unicode whitespace.
- Avoid unnecessary blank lines in generated source files.
- Do not create decorative UI that adds no operational value.
- Prefer existing design patterns from already redesigned Loan Management System pages over inventing a new pattern.

## 3. Color System

### 3.1 Primary Palette

| Role              | Light mode    | Dark mode                    | Tailwind direction                     |
| ----------------- | ------------- | ---------------------------- | -------------------------------------- |
| Page background   | soft neutral  | deep charcoal                | `bg-zinc-50/80 dark:bg-[#171717]`      |
| Primary card      | white         | charcoal surface             | `bg-white dark:bg-[#202020]`           |
| Secondary surface | zinc-50       | zinc-900                     | `bg-zinc-50 dark:bg-zinc-900`          |
| Structural border | zinc-200      | zinc-800                     | `border-zinc-200 dark:border-zinc-800` |
| Strong foreground | zinc-950      | zinc-50                      | `text-zinc-950 dark:text-zinc-50`      |
| Body foreground   | zinc-700/800  | zinc-200/300                 | use according to hierarchy             |
| Muted metadata    | zinc-500      | zinc-400                     | `text-zinc-500 dark:text-zinc-400`     |
| Primary gold      | amber-500     | amber-400                    | primary CTA and selected state         |
| Gold hover        | amber-400     | amber-300                    | primary hover                          |
| Gold soft surface | amber-50      | amber-500/5 to amber-500/10  | selected or emphasized neutral surface |
| Gold border       | amber-200/300 | amber-500/15 to amber-500/30 | emphasized containers                  |
| Destructive       | red           | red                          | archive, delete, reversal, failure     |

### 3.2 Canonical Gold Treatments

Primary CTA:

`bg-amber-500 text-zinc-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300`

Gold-emphasized card:

`border-amber-200/70 bg-white dark:border-amber-500/15 dark:bg-[#202020]`

Gold soft state:

`bg-amber-50/60 dark:bg-amber-500/5`

Gold hover row:

`hover:bg-amber-50/60 dark:hover:bg-amber-500/5`

Gold icon badge:

`bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300`

### 3.3 Dark Mode

Use these dark surfaces consistently:

- Page: `#171717`
- Primary card/panel: `#202020`
- Dense toolbar/table header: Zinc 900 or `#1b1b1b`
- Structural borders: Zinc 800
- Primary text: Zinc 50-100
- Secondary text: Zinc 300-400

Avoid pure black unless required for a specific overlay. Avoid bright gray cards against charcoal backgrounds.

## 4. Typography

The product should feel like a financial operations workstation.

| Content                  | Treatment                                    |
| ------------------------ | -------------------------------------------- |
| Page title               | 18-20px, semibold/bold, tight tracking       |
| Card/panel title         | 14px, semibold                               |
| Group label              | 10-12px, semibold, uppercase, wider tracking |
| Body text                | 12-14px                                      |
| Supporting metadata      | 11-12px, muted                               |
| Table header             | 10px, semibold, uppercase, wider tracking    |
| Table body               | 12px                                         |
| Financial values         | monospace, tabular numerals                  |
| IDs / public identifiers | monospace, compact                           |
| KPI values               | 16-24px depending on importance              |

Rules:

- Use `font-mono tabular-nums` for currency, balances, installment values, totals, counts, percentages, and financial progress.
- Use uppercase tracking only for compact labels, table headers, status metadata, and small operational badges.
- Do not apply wide uppercase tracking to paragraphs, form descriptions, or long instructions.
- Keep primary text high contrast.
- Muted text is for secondary information only.
- Avoid oversized typography that wastes vertical space.

## 5. Spacing System

The UI is intentionally compact.

### 5.1 Page Spacing

- Base page padding: `p-3`
- Medium and larger screens: `md:p-4`
- Major page-section gap: `gap-3`
- Related controls: `gap-1.5` to `gap-2`
- Dense form fields: `gap-3` to `gap-4`
- Header/card internal padding: generally `p-3` or `px-4 py-3`

Preferred page shell:

`flex min-h-0 flex-1 flex-col`

Standard page surface:

`bg-zinc-50/80 p-3 md:p-4 dark:bg-[#171717]`

### 5.2 Vertical Rhythm

Use the following as the default rhythm:

- 4px: label-to-metadata separation
- 6px: compact adjacent controls
- 8px: related UI elements
- 12px: card-to-card or section spacing
- 16px: maximum normal page separation
- 20px+: only for dialogs or intentionally spacious forms

Avoid 24px-32px gaps in routine workspace layouts unless there is a clear reason.

## 6. Page Shell and Overflow Behavior

All major pages must behave correctly when viewport height is limited.

### 6.1 Standard Full-Height Shell

Use:

`flex min-h-0 flex-1 flex-col`

If the whole page should scroll when content exceeds the screen:

`overflow-x-hidden overflow-y-auto overscroll-contain`

Preferred full page shell:

`flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain`

### 6.2 Fixed Workspace with Internal Scrolling

Use when the header/toolbars should remain in place and a table/content area should consume the remaining screen:

Outer page:

`flex min-h-0 flex-1 flex-col overflow-hidden`

Workspace:

`flex min-h-0 flex-1 flex-col overflow-hidden`

Scrollable body:

`min-h-0 flex-1 overflow-auto`

### 6.3 Rule of Thumb

- If the page contains several stacked cards before a table, allow page-level vertical scrolling.
- If a page is primarily a table/list workspace, keep the shell fixed and let the table body scroll.
- Do not let content become inaccessible because a parent uses `overflow-hidden`.
- Use `min-h-0` on flex/grid children that contain scroll areas.
- Hide page-level horizontal overflow unless horizontal page scrolling is intentionally required.
- Wide tables should scroll horizontally inside their own panel.

## 7. Corporate Bento Layout

Bento layouts should communicate hierarchy rather than decoration.

### 7.1 Major Card Geometry

Use:

- Major radius: `rounded-xl`
- Controls: `rounded-md` or `rounded-lg`
- Structural border: Zinc
- Subtle shadow only: `shadow-sm`

Preferred major card:

`rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-[#202020]`

Gold-emphasized card:

`rounded-xl border border-amber-200/70 bg-white shadow-sm dark:border-amber-500/15 dark:bg-[#202020]`

### 7.2 Gold Accent Line

Use sparingly for primary identity cards or important panels:

`h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600`

Do not put the accent line on every card.

### 7.3 Bento Grid

- Use 12-column grids where useful for asymmetrical business dashboards.
- Use `xl:grid-cols-12` for desktop Bento arrangements.
- Stack cards naturally below desktop breakpoints.
- Prefer 7/5, 8/4, or 5/7 spans for major paired sections.
- Keep card heights content-aware unless a full-height workspace specifically benefits from equal height.

## 8. Page Identity and Headers

Each major page should start with a compact identity region.

### 8.1 Standard Identity

Preferred hierarchy:

1. Optional Back action.
2. Page identity card or inline identity.
3. Title.
4. Status badge or identifier.
5. Supporting subtitle/metadata.
6. Operational actions aligned right on wide screens.

Typical title:

`text-lg font-semibold tracking-tight md:text-xl`

Typical subtitle:

`text-xs text-zinc-500 dark:text-zinc-400`

### 8.2 Header Actions

- Use `h-8` for compact desktop actions.
- Primary action is gold.
- Secondary actions use neutral outline styling with gold hover.
- Destructive actions remain red and visually separated.
- Wrap actions on narrow screens.
- Use icons at `size-3.5` or `size-4`.

Secondary outline pattern:

`border-zinc-200 bg-white text-xs shadow-none hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-amber-500/40 dark:hover:bg-amber-500/10`

## 9. KPI and Financial Summary Cards

Use compact summary cards for loan values, balances, payments, and risk metrics.

Recommended structure:

- 10px uppercase label
- 16-20px financial value
- Monospace and tabular numerals
- Small supporting caption only when needed

Use gold emphasis for the most important financial total, such as Total Payable or Current Outstanding.

Do not use different accent colors for every KPI.

## 10. Tables

Tables are a primary design surface.

### 10.1 Corporate Table Appearance

Use:

- Neutral card/panel surface
- Sticky header
- Compact 36px-44px rows
- Subtle horizontal dividers
- Gold row hover
- Right-aligned numeric columns
- Monospace tabular financial values
- Status badges
- Horizontal scrolling for wide tables

Table root:

`min-w-[...] text-xs`

Header:

`sticky top-0 z-10 bg-zinc-50/95 backdrop-blur dark:bg-[#1b1b1b]/95`

Header row:

`border-b border-zinc-200 hover:bg-transparent dark:border-zinc-800`

Header cell:

`h-9 px-3 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400`

Body row:

`border-b border-zinc-100 transition-colors hover:bg-amber-50/60 dark:border-zinc-800/80 dark:hover:bg-amber-500/5`

Body cell:

`h-10` or `h-11`, `px-3 py-1.5`

### 10.2 Numeric Alignment

Currency and balance columns:

`text-right font-mono tabular-nums`

Use stronger weight for outstanding balance, total payable, or other decision-critical values.

### 10.3 Table Workspace Height

On list/workspace pages:

- Table should expand to fill remaining page height.
- Pagination remains below the scrollable table.
- Table header stays sticky inside the scroll area.

Preferred structure:

```svelte
<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="min-h-0 flex-1 overflow-auto">
        <Table.Root>...</Table.Root>
    </div>
    <div class="shrink-0 border-t ...">
        <PaginationFooter ... />
    </div>
</div>
```

### 10.4 Clickable Rows

When clicking a row opens details:

- Add `cursor-pointer`.
- Keep gold hover.
- Ensure buttons/links inside rows remain understandable.
- Preserve keyboard behavior if already implemented.

## 11. Table Toolbars and Filters

Filters should be attached visually to the data workspace.

- Compact toolbar height.
- Use 8px gaps.
- Inputs/selectors normally `h-8` or `h-9`.
- Search may expand while filters stay compact.
- On mobile, stack controls naturally.
- Avoid placing large empty space between filters and the table.

Filter surface:

`border-b border-zinc-100 bg-zinc-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/30`

Select/Input:

`h-8 text-xs` or `h-9 text-xs`

Preferred control ordering when applicable:

Search -> status/type filters -> dates -> secondary actions -> primary action

## 12. Pagination

Pagination belongs to the workspace, not floating outside the table.

- Keep it `shrink-0`.
- Use a subtle top border.
- Use Zinc secondary surface.
- Maintain compact desktop controls.
- Page-size changes reset to page 1 if existing logic already does so.
- Preserve existing pagination behavior.

Recommended wrapper:

`shrink-0 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/35`

## 13. Status Badges

Prefer existing status badge components such as `LoanStatusBadge` and `PaymentTagBadge`.

Do not duplicate badge logic in the parent page unless no status component exists.

Generic neutral badge:

`inline-flex h-6 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-[10px] font-semibold tracking-wide uppercase dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300`

Use gold only for an emphasized or selected state, not for every status.

Use red for destructive/failure states when semantically correct.

## 14. Forms

Forms should be compact, readable, and structured.

### 14.1 Field Layout

- Field group spacing: 12-16px.
- Labels remain readable and close to controls.
- Inputs generally `h-9`.
- Use two-column layouts for related values when space permits.
- Collapse to one column on mobile.
- Use description text only when helpful.

### 14.2 Financial Inputs

Use monospace/tabular numerals for money inputs:

`font-mono tabular-nums`

### 14.3 Form Actions

- Primary submit: Gold.
- Cancel: neutral outline.
- Use `h-8` or `h-9` for compact backoffice forms.
- Show spinner inside the action while processing.
- Do not alter existing disabled/locked logic.

## 15. Dialogs and Confirmations

### 15.1 Standard Dialog

Use:

- White / charcoal surface
- Gold-tinted structural border when the dialog represents an important workflow
- Fixed header/footer where the component supports it
- Scrollable body for long content
- Compact padding

Preferred dialog surface:

`border-amber-200/70 bg-white shadow-2xl dark:border-amber-500/20 dark:bg-[#202020]`

### 15.2 Dialog Layout

Header:

`border-b border-zinc-100 px-5 py-4 dark:border-zinc-800`

Body:

`p-5`

Footer:

`border-t border-zinc-100 bg-zinc-50/70 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40`

### 15.3 Long Dialogs

Use:

`max-h-[90vh] overflow-y-auto`

or a flex layout with a scrollable body.

### 15.4 Destructive Confirmation

Archive, reversal, deletion, and similar operations remain red.

Do not use gold for destructive meaning.

## 16. Tabs

Tabs should feel like compact workstation navigation.

Container:

`h-10 ... rounded-lg border ... p-1`

Trigger:

`h-7 rounded-md px-3 text-xs font-medium`

Active state:

`data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 dark:data-[state=active]:bg-amber-400`

Tabs that contain large tables must use:

`flex min-h-0 flex-1 flex-col`

Tab content:

`mt-0 flex min-h-0 flex-1 flex-col`

## 17. Loading States

Loading states should preserve layout structure.

- Use skeletons shaped like the final UI.
- Keep the same approximate panel height.
- Table loading may show a header skeleton plus 4-5 compact row skeletons.
- Include an `sr-only` loading message where appropriate.
- Do not replace a full workspace with a tiny spinner if doing so causes layout jumps.

## 18. Empty States

Empty states should remain operational and compact.

Use:

- A subtle dashed border.
- Gold icon badge for normal empty states.
- Clear title.
- Short explanation.
- Optional CTA if the user can resolve the empty state.

Recommended empty surface:

`border border-dashed border-amber-200 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5`

Avoid overly playful illustrations.

## 19. Error States

Errors must be visible but controlled.

- Use existing `Alert` components.
- Red border/semantic styling.
- Include retry when available.
- Keep stale data visible if the existing implementation supports it.
- Do not use gold to communicate failure.

## 20. Borrower Pages

Borrower pages should use:

- Compact identity card with borrower name, borrower number, payment tag, and status.
- Gold CTA for Create Loan.
- Neutral outline actions for Record Payment and Edit.
- Red for Archive.
- Tabs for Overview, Documents, Loans, and Payments.
- Overview uses Bento cards.
- Loans and Payments use full-height table workspaces.
- Payment behavior card may use gold emphasis.
- Borrower details remain neutral and readable.

## 21. Loan List

The Loans page should use:

1. Compact identity/header card.
2. Status filter attached to the workspace.
3. Full-height loan table.
4. Sticky table header.
5. Right-aligned Principal, Payable, Progress, and Outstanding values where applicable.
6. `LoanStatusBadge`.
7. Pagination anchored to the bottom.
8. Gold Create Loan CTA.
9. Gold hover on rows.

## 22. Loan Detail

Loan detail should use:

1. Back navigation.
2. Compact loan identity with loan number, status, borrower ID, and payment frequency.
3. Role/status-dependent actions.
4. Four compact KPI cards:
    - Principal
    - Interest
    - Total Payable
    - Installment
5. Contract Summary and Cash-out Bento cards.
6. Full-width Installment Schedule table.

When the combined content exceeds the viewport, the page must scroll vertically.

The installment table may also have an independent scroll area if its height is constrained.

## 23. New Loan Calculator

Use a two-panel Bento layout on wide screens:

Left:

- Loan details form.

Right:

- Quote summary.

Quote total should receive gold emphasis.

The quote card should visually distinguish:

- Principal
- Interest
- Total payable
- Payment type
- Installment
- First due date
- Expected completion

Primary actions:

- Calculate quote: gold.
- Create loan for approval: gold.

## 24. Payment History

Payment history should use:

- Attached compact filter toolbar.
- Payment type, loan, status, date-from, and date-to filters.
- Sticky table header.
- Monospace financial columns.
- Right-aligned money.
- Compact status badge.
- Reverse action only when allowed by existing logic.
- Gold row hover.
- Full-height scrollable table body.

## 25. Documents

Document displays should use compact list cards rather than large blank panels.

Document item:

- File/document icon.
- Type/name.
- Identifier/number as secondary metadata.
- Neutral card with gold hover border.
- Responsive grid: one column on small screens, two or three columns at larger sizes.

## 26. Accessibility

- Maintain at least 4.5:1 contrast for normal text.
- Control boundaries and meaningful icons should maintain at least 3:1 contrast.
- Never communicate status by color alone.
- Preserve accessible labels.
- Keep `sr-only` descriptions where useful.
- Preserve semantic table structure.
- Use visible focus states.
- Do not remove existing keyboard interactions.
- Keep tap targets usable on mobile.
- Destructive actions must be explicit and clearly labelled.

## 27. Responsive Behavior

### Below `sm`

- Stack page header content.
- Wrap or stack actions.
- Use full-width forms where needed.
- Allow horizontal table scrolling.
- Avoid fixed widths that exceed the viewport.
- Use `p-3`.

### `sm` to `lg`

- Use two-column forms and summary grids where helpful.
- Keep actions wrapping.
- Table remains horizontally scrollable when necessary.

### `xl` and above

- Use Bento side-by-side layouts.
- Keep action groups right-aligned.
- Expand tables and workspaces vertically.
- Prefer 7/5, 8/4, or similar balanced panel ratios.

## 28. Scroll Behavior

This rule is mandatory.

### Page scrolling

When stacked page components exceed the screen height, use:

`overflow-x-hidden overflow-y-auto overscroll-contain`

### Workspace scrolling

For table/list workspaces:

`flex min-h-0 flex-1 flex-col overflow-hidden`

Then:

`min-h-0 flex-1 overflow-auto`

### Horizontal table scrolling

Wide tables must scroll inside their panel:

`overflow-x-auto`

or:

`overflow-auto`

Never allow required content to be clipped by an ancestor with `overflow-hidden`.

## 29. Shadows and Effects

Use restrained depth.

Allowed:

- `shadow-sm`
- `shadow-2xl` for modal/dialog elevation
- subtle backdrop blur on sticky table headers

Avoid:

- strong glowing shadows
- neon borders
- glassmorphism
- oversized gradients
- multiple stacked shadows

Gold gradients are reserved for narrow accent lines, not card backgrounds.

## 30. Icons

Use Lucide icons already present in the codebase.

Typical sizes:

- Inline button icon: `size-3.5`
- Card icon: `size-4`
- Important icon badge: `size-4` or `size-5`

Use icon badges sparingly.

Do not add icons to every text label.

## 31. Design Consistency Rules

Before creating a new visual pattern, first check whether an existing redesigned component already solves the same problem.

The following should remain visually uniform across the application:

- Page padding
- Header density
- Gold CTA treatment
- Dark charcoal surfaces
- Card radius
- Border colors
- Table header styling
- Table row hover
- Financial typography
- Status badges
- Filter toolbars
- Loading states
- Empty states
- Error states
- Dialog headers and footers
- Pagination placement
- Scroll behavior

## 32. Anti-Patterns

Do not:

- Use large empty margins.
- Use giant page titles.
- Give every card a different accent color.
- Use gold as a full-page background.
- Use pure black cards everywhere.
- Put pagination inside the table scroll body.
- Let sticky table headers scroll away.
- Center financial columns that should be right-aligned.
- Mix multiple border-radius systems.
- Add decorative cards with no information hierarchy.
- Use `overflow-hidden` where it clips required content.
- Replace a compact workstation layout with a marketing-style layout.
- Change application logic during a design-only task.
- Introduce new dependencies just for styling.
- Use inline style attributes when Tailwind classes are sufficient.

## 33. Agent Checklist

Before considering a UI task complete, verify:

- Gold + Dark Charcoal theme is preserved.
- Dark mode is intentionally styled.
- Page spacing uses the compact 12px/16px system.
- Major cards use consistent radii and borders.
- Financial figures use monospace/tabular numerals.
- Primary CTA is gold.
- Destructive CTA is red.
- Table headers are compact and sticky when appropriate.
- Financial table columns are right-aligned.
- Wide tables scroll horizontally.
- Full-height workspaces use `min-h-0` correctly.
- Page scroll exists when stacked content exceeds viewport height.
- Pagination is outside the table scroll body.
- Loading, error, and empty states match the system.
- Responsive layout remains usable on narrow screens.
- Existing logic, events, queries, mutations, bindings, and permissions are preserved.
- Tailwind and existing UI components are used.
- Source contains no irregular whitespace.
- New design matches previously redesigned Loan Management System pages.

## 34. Canonical Visual Summary

The intended result is:

**Corporate, compact, structured, dark-charcoal, gold-accented, financially legible, responsive, scroll-safe, and operationally focused.**

When uncertain between a decorative option and a restrained operational option, choose the restrained operational option.
