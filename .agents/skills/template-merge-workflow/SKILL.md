---
name: template-merge-workflow
description: Project workflow for merging global template updates into downstream forks, resolving fork/template conflicts, preserving fork-specific behavior, applying Svelte/API structural migrations, and running post-merge checks. Use when preparing, performing, reviewing, or troubleshooting template-to-fork merges.
---

# Template Merge Workflow

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Conflict Routing

| Conflict | Load |
| --- | --- |
| Packages, lockfile, catalog, exports, build order | `monorepo-troubleshooting` |
| API, schema, query, tenancy, migrations | `hono-patterns`, `validator-patterns`, `database-patterns` |
| Wrangler, bindings, secrets, routes/domains, staging/production, CI/CD | `deployment-operations` |
| Svelte structure/styling/UI | `svelte-patterns` |
| Frontend queries/forms/filters/mutations/submissions/retries | `svelte-data-forms` |
| Test ownership, cutover classification, fixtures, and runner behavior | `cloudflare-worker-testing` |

## Merge Safety and Precedence

Start from a clean downstream-fork tree and use a dedicated branch such as `chore/merge-template-updates`. Adding/fetching remotes, creating branches, merging, committing, or pulling requires explicit approval. Merge without committing immediately so conflicts can be reviewed.

Resolve dependency conflicts before normalizing the lockfile from the repository root with `pnpm install`; if that produces a pnpm/tooling failure, stop under `monorepo-troubleshooting` and request user intervention. Use actual fork package names in `pnpm --filter` commands.

Resolve conflicts in this order:

1. Preserve fork business behavior, contracts, branding, permissions, bindings, and secrets.
2. Adopt template engineering infrastructure, tooling, agent guidance, framework conventions, middleware, and generated package setup.
3. Change fork contracts only for a documented shared template migration.

Template skills are authoritative: never preserve fork changes that override, weaken, rename, or add project-specific content to them. Keep `.agents/skills` canonical and `.claude/skills` an exact mirror; place fork-specific names, roles, behavior, and exceptions in context, fork docs, implementation, or tests. Never overwrite fork-specific `.dev.vars`, `.env`, deployment configs, or secrets unless the fork intentionally adopts template defaults.

## Hono Conflicts

Apply the same approach to both APIs: preserve fork business behavior while adopting template route, middleware, validation, response, error, logging, and observability conventions.

* Keep public/backoffice behavior and app-specific `src/types.ts` types separate.
* Preserve fork route paths and response semantics unless a shared migration is documented.
* Adopt template app bootstrap, middleware registration, global error handling, request validation helpers, response wrappers, request timing, structured logs, and WebSocket/Durable Object lifecycle handlers.
* Keep fork validators/queries, but align validation and response handling with `hono-patterns` and `validator-patterns`.
* Preserve fork bindings/`[vars]`; add template bindings only when merged code references them.
* Preserve the target profile's persistence semantics. In the D1 profile, use conditional writes and predeclared batches with guarded audit statements; never reintroduce PostgreSQL transactions or locks during a merge.

## Audit Trail Conflicts

Preserve the fork's registered taxonomy, event coverage, retention, access policy, timezone, routes, grouping, and display copy. Adopt the template's generic audit persistence types, actor-attribution invariants, projection and redaction boundary, transaction and external-effect semantics, tenant-scoped reader contract, cache-freshness protocol, and verification guidance only when the corresponding implementation is present in the merged profile.

Load `audit-trail-patterns` with every affected subsystem skill. Port its canonical directory and `.claude/skills` mirror together, keep them byte-identical, and never copy fork policy into the reusable skill. Landing-only profiles without backend audit capability do not receive audit implementation or guidance.

## Svelte Structural Conflicts

Follow `svelte-patterns` for current naming and placement. Known migrations:

* `src/lib/components/default/loading-screen.svelte` → `src/lib/components/loader/LoadingScreen.svelte`
* `src/lib/components/default/modal-captcha.svelte` → `src/lib/components/modal/CaptchaModal.svelte`
* `src/lib/components/default/sidebar*.svelte` → `src/lib/components/sidebar/Sidebar*.svelte`
* `src/lib/components/default/table-upload.svelte` or `src/lib/components/upload/TableUpload.svelte` → `src/lib/components/upload/SingleFileUpload.svelte` and/or `MultiFileUpload.svelte`; select the single-file, multi-file, or both workflows required by the fork rather than preserving the retired table component.
* `src/lib/components/default/sign-in.svelte` → `src/lib/modules/auth/components/SignInForm.svelte`
* `src/lib/states/session/provider.svelte` → `src/lib/states/session/SessionProvider.svelte`
* `src/lib/assets/image/_index.ts` or `src/lib/assets/image/index.ts` → `src/lib/assets/images/index.ts`

Move fork-specific `src/lib/components/default` UI to `src/lib/components/<group>/PascalCase.svelte` when reusable or `src/lib/modules/<module>/components/PascalCase.svelte` when feature-owned. Add a barrel only when the directory already has an index entrypoint consumed outside it or the merge task explicitly requires a new public component API.

## Realtime Query Optimization Migration

Apply realtime coordination changes in this order:

1. Merge stable `SessionState.data` identity and scalar-keyed socket ownership before narrowing query recovery.
2. Inventory and tag every event-driven query that depends on `APP` with its tenant, owner, recovery mode, stream, and optional target.
3. Adopt narrowed `SessionProvider` recovery only after the inventory is complete; untagged queries are intentionally excluded.
4. Carry fork-owned APP events through the two web seams: list invalidation events in `states/session/appRealtime.extension.ts` and inject the API's shared registry through `utilities/wsClientManager/registry.extension.ts` in each web app. Tag only queries that must refresh per event with `appRealtimeEventQueryMeta`. An event missing from the browser registry is dropped silently, and the `appRealtime.extension` guard spec must pass after the merge.

Audit socket effects for dependencies on replaceable session objects and key each lease to stable tenant, stream, and target scalars. Confirm repeated successful same-tenant session refreshes leave existing APP and dedicated physical sockets open. Preserve tenant changes, target changes, consumer disposal, authentication loss, final-reference release, and physical transport closure as valid lifecycle boundaries.

## Test Ownership Conflicts

Treat the ownership banner in a template test entrypoint as the base/fork boundary. Reconcile template updates above the banner and preserve fork-owned scenarios below it. Prefer new fork-owned companion test files for fork behavior; extend a template entrypoint below the banner only when its file-local setup, mutable state, or required ordering cannot be reused safely from a companion file.

Before accepting a template deletion of a test entrypoint, move any below-banner fork scenarios into a fork-owned companion file. When fork behavior is promoted into the source template, move its scenario above the banner and remove the downstream duplicate. Never preserve committed cutover probes during a merge; follow `cloudflare-worker-testing` to distinguish temporary retired-surface assertions from permanent negative or compatibility coverage.

## Post-Merge Checks

Run these searches only against workspaces present in the merged profile.

Search stale Svelte paths:

```bash
rg 'components/default|components/form|provider\.svelte|_index|sidebar-nav-|modal-captcha|loading-screen|table-upload|sign-in\.svelte' apps/web-public apps/web-backoffice
```

Search stale production API patterns:

```bash
rg 'throw new Error|ctx\.json\(' apps/api-public/src apps/api-backoffice/src --glob "*.ts" --glob "!**/config/*.ts" --glob "!**/worker-configuration.d.ts"
rg 'zValidator\(' apps/api-public/src apps/api-backoffice/src --glob "*.ts" --glob "!**/core/middleware/validateRequest.ts" --glob "!**/worker-configuration.d.ts"
rg -U -P 'console\.(?:log|error)\((?!\s*JSON\.stringify\()' apps/api-public/src apps/api-backoffice/src --glob "*.ts" --glob "!**/worker-configuration.d.ts"
```

Then confirm skill-mirror parity; run `check` and `lint` for resolved workspaces and consumers selected by `monorepo-troubleshooting`. Smoke-test health/status, auth, object storage, and WebSocket/Durable Object behavior when present in the merged profile, including disabled-feature behavior where applicable. Test touched fork API groups and frontend sign-in, loading, captcha, sidebar, upload, and other touched workflows that exist in that profile.

## Noisy Merges

When conflict density prevents safe file-level resolution, apply major structural migrations manually before merging the remaining template changes, then reapply fork behavior incrementally:

* Svelte: create new component/module folders, move one family at a time, update imports, and check each affected web app/consumer.
* Hono: merge shared API infrastructure, reapply route groups one at a time, preserve bindings/secrets, align validators/responses, and check each affected API/consumer.
