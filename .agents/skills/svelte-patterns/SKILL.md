---
name: svelte-patterns
description: Repository-specific rules for SvelteKit static/SPA runtime boundaries, route and component placement, fixed script organization, function and import style, fonts, Tailwind tokens, and shared UI ownership. Use when implementing or modifying frontend routes, components, layouts, imports, styling, or shared UI.
---

# Svelte and SvelteKit Patterns

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

* Load `svelte-code-writer` and `svelte-core-bestpractices` for every `.svelte` or `.svelte.ts`/`.svelte.js` creation, edit, or analysis. Apply this skill's explicit repository boundaries after the official framework guidance.
* Prefer a local source-file path when invoking `svelte-autofixer`. If passing inline source, use shell-appropriate quoting that preserves rune `$` characters; do not copy upstream `\$` escaping into PowerShell or single-quoted literals.
* Load `svelte-data-forms` for TanStack Query, forms, debounced search, mutations, submission locks, or idempotency.
* Load `shadcn-svelte` for component APIs and examples, registry CLI workflows, presets, theming, or registry URLs. Keep this skill's project ownership and placement rules authoritative.

## Runtime and Component Boundaries

* Keep every new or touched custom component in Svelte 5 runes mode. Put shared reactive project state in rune-backed `.svelte.ts` classes/context; use stores only when an external API requires the store contract.
* Web apps are static/SPAs with `adapter-static`. Do not add server-only loading such as `+page.server.ts`; use browser-safe APIs and existing app config/client wrappers.
* CSP uses `kit.csp` hash mode in `svelte.config.js`; do not assume runtime-only CSP behavior.
* Fetch client-side through typed `src/lib/clients.ts` wrappers. Never import database, Worker-only, or server-auth code into frontends.
* Move reusable workflows and domain logic out of `.svelte` files; keep component-only state, handlers, effects, and helpers local.

## Naming, Placement, and Routes

* Use `PascalCase.svelte` components, `kebab-case` route directories, and `camelCase` utilities/non-components.
* Keep framework `+page.svelte`, `+layout.svelte`, and `+error.svelte` under `src/routes`.
* Put app-wide components in `apps/web-*/src/lib/components/<ui-role>/`, never vague folders such as `components/default`.
* Put feature components in `src/lib/modules/<module>/components/` and support code in kind-based `utilities`, `state`, `queries`, `forms`, or `schemas` folders.
* Follow the UI ownership boundaries below for generated primitives, shared components, and source-level overrides.
* Route files contain only route-specific imports, named page-component composition, metadata, and static scaffolding. Move workflows, forms, queries, mutations, reusable UI, domain logic, and state/effects/handlers beyond route metadata or composition into app-wide or feature components.

```svelte
<script lang="ts">
    import SignInPage from '$lib/modules/auth/components/SignInPage.svelte'
</script>

<SignInPage />
```

## Script Organization

For every non-generated custom `apps/web-*` component whose script declares anything after imports, keep imports first and use these exact fixed-order, double-digit banners. Omit empty sections without renumbering and apply banners even when only one section is non-empty. Exempt import-only scripts, framework route files, and registry-generated `packages/ui/src/components/` primitives.

```typescript
////////////////////
// 01. Properties //
////////////////////

///////////////////
// 02. Constants //
///////////////////

///////////////
// 03. State //
///////////////

/////////////////
// 04. Derived //
/////////////////

/////////////////
// 05. Queries //
/////////////////

///////////////////
// 06. Mutations //
///////////////////

///////////////
// 07. Forms //
///////////////

/////////////////
// 08. Effects //
/////////////////

//////////////////
// 09. Handlers //
//////////////////

/////////////////
// 10. Helpers //
/////////////////
```

| Section | Contents |
| --- | --- |
| Properties | `$props()` and `$bindable` props |
| Constants | Immutable config/maps, schema aliases, display data |
| State | `$state(...)` and mutable `let`, including effect-populated values |
| Derived | `$derived(...)` |
| Queries / Mutations | TanStack `createQuery(...)` / `createMutation(...)` |
| Forms | Setup, field aliases, subscriptions |
| Effects | `$effect(...)` and lifecycle effects |
| Handlers | Submit, UI-event, and action handlers |
| Helpers | Formatting, parsing, validation, implementation helpers |

Follow `svelte-data-forms` for query, mutation, and form behavior. Never create a broad Initialization section; initialize values by what they are.

## Functions and Imports

* Use named `function` declarations for local handlers, helpers, validators, and event logic. Use arrows only where APIs/inline adapters require callbacks, including `createQuery(() => ...)`, `createMutation(() => ...)`, `createForm(() => ...)`, snippets, and template callbacks.
* Use hoisting to keep declarations in their required sections; move shared/domain-workflow functions into `.ts` utilities.
* Group packages before local imports and alphabetize module specifiers within each group.
* Deep-import Lucide icons from `@lucide/svelte/icons/*` and suffix imports with `Icon`, for example `import SearchIcon from '@lucide/svelte/icons/search'`.

## Fonts, Styling, and Shared UI

* Store Vite-imported, transformable images in each app's `src/lib/assets/images/` and public, stable-path images in `static/assets/images/`.
* Store committed fonts and matching CSS in each app's `static/assets/fonts/` and reference root-relative URLs such as `/assets/fonts/inter-variable.woff2`. Prefer `.woff2`; use another format only when unavailable from the authoritative source and document that source beside the asset update. Download missing fonts only from a trusted foundry, Google Fonts, or official repository, and commit matching `@font-face` CSS.
* Use Tailwind CSS v4 and existing semantic tokens/utilities from `@PROJECT_NAME/ui/styles` / `packages/ui/src/styles/globals.css`. Add a token only when none represents the state, defining both themes.
* `packages/ui` uses `@sveltejs/package`/`svelte-package`, shadcn-svelte with bits-ui, `@tailwindcss/vite`, zinc/oklch CSS, and `tw-animate-css`. Keep aliases and paths in `packages/ui/components.json`.
* Import `cn()` from `@PROJECT_NAME/ui/utils`; it combines `clsx` and `tailwind-merge`.
* Render charts with the shared Chart.js `Chart` from `@PROJECT_NAME/ui/shared/chart`, passing a typed Chart.js configuration, a required accessible `label`, an optional `description`, and a container `class`. Its colors come from the existing `--chart-*` tokens. Do not add the shadcn-svelte registry `chart` item or another chart library.
* Do not extend the root config from `packages/ui/tsconfig.json`: Svelte tooling requires bundler resolution while root uses `nodenext`.

## UI Component Ownership

* Treat `packages/ui/src/components/` as vendor-generated shadcn-svelte primitives. Add or refresh them only through an explicit shadcn-svelte registry workflow; never hand-edit, reformat, lint-fix, preserve local patches, or add project-specific behavior there.
* Exclude generated primitives from formatting and linting while retaining package type-check and build validation. Keep `packages/ui/src/shared/` and `packages/ui/src/overrides/` fully formatted, linted, type-checked, and built.
* Prefer supported props, classes, snippets, events, and composition APIs. Put app-specific wrappers in `apps/web-*/src/lib/components/` or the owning feature module, and reusable cross-app/package components in `packages/ui/src/shared/<component>/`.
* Create `packages/ui/src/overrides/<primitive>/` only for a confirmed upstream correctness, accessibility, runtime, type, or compatibility defect that composition, compatible dependency changes, and current registry source cannot resolve. Never apply the fix to the generated primitive.
* Export an override from `@PROJECT_NAME/ui/overrides/<primitive>`, retain the upstream export names, and mirror its props, snippets, events, exports, and behavior except for the documented correction.
* Document an override component with Svelte's `<!-- @component ... -->` comment, covering the upstream target, defect, composition limitation, intentional divergence, retirement condition, and upstream references. Use standard JSDoc `@description` and `@see` for exported TypeScript helpers/types; add `@deprecated` only after verifying an upstream fix and beginning consumer migration. Do not invent custom documentation tags or markers.
* Re-evaluate overrides after relevant shadcn-svelte or dependency updates. After verifying the upstream fix, migrate consumers back to `@PROJECT_NAME/ui/components/<primitive>` and retire the override when no consumers or regressions remain.

## Service-Principal Management UI

* Compose owner and admin routes from one shared domain component and expose navigation only to those roles. Keep route pages compositional; use shared primitives for dialogs, metadata, status, pagination, and destructive revoke confirmation.
* Keep audience selection explicit and its access permission mandatory in create and edit flows. Show loading, error, empty, list, and pagination states; expose neither plugin control fields nor a credential disable/re-enable workflow. Service principals may be disabled and explicitly re-enabled; credentials remain immutable and can only be issued or revoked.
* Show each raw key once in an ephemeral dialog with copy and unrecoverable-secret guidance. Clear it on close and exclude it from URLs, browser storage, logs, analytics, and form persistence.
