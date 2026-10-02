---
name: cloudflare-worker-testing
description: Project rules for API Worker, web Vitest, Playwright, WebSocket, and root Node tests, including isolation, naming, ownership, coverage, and execution. Use when writing, modifying, running, or debugging tests or test infrastructure.
---

# API and Web Testing

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

- Load `auth-implementation` for auth policies, `database-patterns` for database lifecycle, `hono-patterns` for API behavior, `svelte-patterns` for web components/state, and `validator-patterns` for schemas.

## Isolation

- In the default con/seq Cloudflare projects, KV, Durable Object, and Cache storage is isolated per file, not per `it()`; writes persist within that file. Put file-wide setup in `beforeAll()` and never depend on another test file's storage. SRT disables isolation and is the explicit exception described below.
- Do not add a cross-app Worker fixture for an app-local `_DO_RL` binding. When Wrangler explicitly binds to another Worker's namespace and isolated Vitest cannot start the owner, use a clearly named `<surface>.worker.fixture.js` with a JSDoc that identifies the owner and explains the self-bound test substitution; remove the fixture when the external binding is removed.
- Each API Vitest project binds an isolated D1 database per file. `test:con`, `test:seq`, and `test:srt` apply the same default and test migration histories; SRT remains single-runtime within its project.
- Read migrations in `vitest.config.ts` and apply them from `test/setup.ts` with `applyD1Migrations()`. Do not add PostgreSQL global setup, Hyperdrive URLs, `localConnectionString`, direct-client teardown, or `beforeExit`.
- Verify a database-profile conversion against an independent frozen manifest derived from the source profile. Do not treat agreement among a new migration, its README ledger, and hard-coded test arrays as proof that the source inventory is complete.
- Keep per-file D1 isolation tests separate from the local shared-persistence smoke check. The smoke check migrates once through the public API Wrangler configuration, then proves the public and backoffice bindings read the same seeded database from the shared `.wrangler/state` directory.
- R2 uses signed S3-compatible HTTP calls and is not isolated by Worker storage unless stubbed/intercepted.
- Manage `@cloudflare/vitest-plugin` through the root `pnpm-workspace.yaml` catalog.
- When data is missing, check per-file D1 migration setup and the feature's storage owner; authentication records are D1-backed.

## Naming and Placement

| Suite      | Entrypoints                                                                                                   | Location                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| API Vitest | `*.con.test.ts` independent; `*.seq.test.ts` ordered/stateful; `*.srt.test.ts` single-runtime                 | `apps/api-{public,backoffice}/test/`, never `src/`                  |
| Web Vitest | `*.con.spec.ts` independent; `*.seq.spec.ts` ordered/stateful; add `.svelte` before the marker for components | Colocate under the owning `src/` directory; never use `.test.ts`    |
| Playwright | `*.spec.ts`                                                                                                   | Top-level web `test/` with `playwright.config.ts` `testDir: 'test'` |
| Root Node  | `*.test.mjs`                                                                                                  | Root-owned tooling tests such as `scripts/`                         |

- Keep web Vitest scoped to `src/` through `vite.config.ts`.
- Keep fixtures and registration modules beside suites as `*.fixture.ts` or `*.shared.ts`.

### API Provenance

- Map `src/core/api/...` to `test/api/...`, preserving every source directory and the complete source basename.
- Allow `index` test basenames when the complete path supplies provenance.

| Source                       | Test                                             |
| ---------------------------- | ------------------------------------------------ |
| `api/auth.ts`                | `test/api/auth.{con,seq}.test.ts`                |
| `api/v1/index.ts`            | `test/api/v1/index.con.test.ts`                  |
| `api/dashboard/daily.ts`     | `test/api/dashboard/daily.{con,seq}.test.ts`     |
| `api/admin/user/password.ts` | `test/api/admin/user/password.{con,seq}.test.ts` |

- Keep API tests outside `src/` and route-owned `*.shared.ts` and `*.fixture.ts` files beside their owning suite.
- Mirror other domains under their top-level test domain without folding source subdirectories into filenames; map `src/auth/acl.ts` to `test/auth/acl.con.test.ts`, `src/services/realtime/authorization.ts` to `test/services/realtime/authorization.seq.test.ts`, and source utilities to `test/utilities/...`.
- Put cross-route or cross-cutting suites under `test/integration/`; keep root infrastructure such as `test/utilities.ts` at the test root.
- Permanent suites cover the supported contract, including applicable negative cases for unknown inputs/routes, missing records, tenancy, auth, authorization, validation, disabled features, failures, and supported compatibility shapes.

### Temporary Cutover Tests

- Classify a test as cutover only when its sole purpose is to prove that retired behavior is absent, such as an old endpoint, HTTP method, export, component, field, configuration key, protocol, or data shape.
- Keep cutover assertions outside permanent scenarios and never commit them after the transition.
- Treat negative assertions against the supported contract or compatibility shapes as permanent coverage.
- Use a Git-ignored cutover filename discoverable by the owning runner.

| Runner                  | Cutover filename                                                             |
| ----------------------- | ---------------------------------------------------------------------------- |
| API or WebSocket Vitest | `*.cutover.con.test.ts`, `*.cutover.seq.test.ts`, or `*.cutover.srt.test.ts` |
| Web Vitest              | `*.cutover.con.spec.ts` or `*.cutover.seq.spec.ts`                           |
| Playwright              | `*.cutover.spec.ts`                                                          |
| Root Node               | `*.cutover.test.mjs`                                                         |

- Never force-add or commit a cutover file.
- Begin a cutover file exactly as follows, run the explicit file through its owning runner, and delete it after it passes:

```typescript
/**
 * @temporary Cutover verification only.
 * This file asserts retired behavior, not the current contract.
 * Safe to delete after it passes once.
 * DO NOT COMMIT.
 */
```

### Template and Fork Test Ownership

- Place this exact banner after the final template-owned scenario in every template-owned test entrypoint:

```typescript
// =============================================================================
// END OF BASE TEMPLATE TESTS - FORK-SPECIFIC TESTS MUST BE ADDED BELOW
// =============================================================================
```

- Write template-owned scenarios above the banner.
- Prefer a new fork-owned companion test file for fork behavior so template updates do not modify the same file.
- Add fork-specific scenarios below the banner only when file-local setup, mutable state, or required ordering makes an inline extension necessary.
- Do not add an empty banner to a fork-owned companion file or add the banner to fixtures, shared registration modules, harnesses, setup files, or other support modules.
- Move a scenario above the banner when its behavior joins the source template and remove the downstream duplicate.
- Keep helpers local until multiple entrypoints reuse them.

## Concurrency and Organization

- Treat `con` as permission for a file to overlap peer files, not as a requirement to use `describe.concurrent(...)`.
- Use `describe.concurrent(...)` only when every test has unique identifiers or keys for all database, file-local storage, and external-object writes and shares no mutable rows, process state, mocks, or timers.

- API `*.con.test.ts` files run in `concurrent-test-files`; `*.seq.test.ts` run in `sequential-test-files` with `fileParallelism: false`; `*.srt.test.ts` run in `single-runtime-test-files` with `fileParallelism: false`, `maxWorkers: 1`, and `isolate: false`.
- Use SRT only when tests require a shared, non-isolated Worker runtime—not as a WebSocket-specific category. Its included files share runtime, module, and storage state; prefer one owning SRT file per scenario or explicitly reset all shared state, and never depend on file order.
- Sequential suites use plain `describe(...)`, never deprecated `describe.sequential(...)`. In mixed files keep the outer suite plain; mark independent children concurrent. Inside a concurrent parent, declare a sequential child with `describe(name, { concurrent: false }, callback)`.
- Use thin con/seq entrypoints backed by one `*.shared.ts` only for shared setup/registration; export separate registration functions and register only the matching suites.
- Keep mutable setup/state/cleanup file-local and never depend on file execution order.
- Keep DDL (`CREATE TRIGGER`/`FUNCTION`, `ALTER`) and advisory-lock gates on shared tables in `seq` files; their table locks stall every overlapping `con` file.
- Name generic tenant suites `tenantIsolation.con.test.ts` and `tenantIsolation.seq.test.ts`. Concurrent suites cover endpoint isolation; sequential suites cover direct database/stateful behavior.

- Keep `client-concurrent-test-files`, `client-sequential-test-files`, `server-concurrent-test-files`, and `server-sequential-test-files` in each web app.
- Include matching `*.con.spec.*` files in concurrent projects and matching `*.seq.spec.*` files in sequential projects; disable file parallelism in sequential projects.
- Run Svelte component tests in Chromium Browser Mode client projects and non-Svelte utility/state specs in Node server projects; treat `server` as the environment label rather than an API or deployed server.
- Set `browser.headless: true` in every client project; Vitest otherwise runs headed outside CI, which is slower and causes focus/hover flakes. Use headed mode only for local debugging.
- Wrap component harnesses that render shared UI in `$lib/components/testing/QueryTestProviders.fixture.svelte`, which supplies `Tooltip.Provider` and a retry-disabled `QueryClientProvider`; pass `client` only when the harness reads that client. Mock `useQueryClient` only to assert invalidation calls, not to stand in for a real client in rendering tests.
- Set `fullyParallel: true` in `playwright.config.ts`. Keep each Playwright test independent: a fresh `page`, per-test `page.route` mocks, and no module-level mutable state or serial describes.
- Keep a distinct `cacheDir` for every client/server and con/seq/srt combination, such as `vitest-single-runtime-test-files`.

## Test Quality

- Make every test execute meaningful assertions against observable contracts. A status-only assertion is insufficient when payload, persisted state, emitted effects, or forbidden effects are part of the behavior.
- Use explicit trusted client-address headers for every request exercising an authentication route with a network policy.
- Add a regression test for a behavior fix whenever an affected test layer exists. Never remove or weaken regression coverage merely to make a change pass unless the intended contract changed.
- Never commit `.only`. Treat `.skip` and `.todo` as unresolved coverage that requires an explicit documented blocker; skipped tests never count as passing verification.
- In Playwright, test user-visible behavior and prefer role, label, or text locators plus auto-retrying web-first assertions over styling classes, implementation details, or manual visibility checks.
- Before parameterizing similar screens, inspect each component's actual accessible action and dialog names. Diagnose selector and fixture failures against those contracts before changing product code.
- Scope call-count assertions on shared mocks to the scenario's identifier; hover/focus prefetch or neighboring renders can add unrelated calls.
- When UI copy or structure changes intentionally, update assertions to the new contract instead of keeping retired strings or selectors.
- Mock relevant library return shapes accurately, including refresh calls that resolve with error results rather than rejecting. Exercise meaningful failure behavior as well as success; avoid tests that reproduce implementation structure or enforce exact wording unless it is part of the contract.

## Test Efficiency and Signal

- Use the smallest workload that proves an invariant. Repeat an identical stress case only for intentionally probabilistic behavior, and document why the repetition count is necessary.
- Prefer observable conditions, controlled clocks, or fake timers over fixed sleeps. A timeout bounds failure; it is not synchronization.
- Drive superseded debounced inputs within one tick (synchronous input events) or under fake timers; separate awaited `fill()` calls can straddle the debounce window under load.
- When asserting effects registered through `ctx.executionCtx.waitUntil()`, pass `waitForCfExecutionContext: true` to `postTestingRequest()`. The option waits only for those registered promises; it is not general asynchronous synchronization and does not belong on GET or QUERY helpers by default.
- For the absence of a WebSocket effect from such a mutation, attach the collector before the POST, enable `waitForCfExecutionContext`, assert after the helper returns, and dispose the listener. Do not replace this ordering with a fixed sleep.
- Put expensive immutable setup in outer `beforeAll()` and reserve `beforeEach()` for mutable state reset. Add at most one file-level prewarm only for a measured cold-start issue, and document its reason.
- In high-volume tests, intercept only an exact known non-contract log event file-locally, pass unexpected output through, and restore the interceptor in file-level cleanup. Never globally silence errors or logs whose contract is under test.
- Account for Worker startup cost before splitting suites. Do not move API tests to Node without proving transitive runtime compatibility and updating project ownership rules.
- During an explicit optimization audit, start from a fully passing baseline, capture per-file durations with `--reporter=default --reporter=json --outputFile=<scratch path>`, and compare workload, log volume, and elapsed time after changes while preserving coverage. Treat single-run deltas under about 10% as noise; never create hard performance gates.
- Treat a test that fails in a full phase but passes alone as load or cross-file interaction: reproduce it with the smallest failing file set, fix the cause, and confirm with repeated runs of that set. A single passing retry is not verification.

## Running Tests

- Run tests through owning-package scripts; never run aggregate `test` or `test:ui`. UI/watch mode is diagnostic, not completion verification.
- Run every Vitest and Playwright command with tool-level elevated permissions from the first attempt so teardown is not blocked by sandbox restrictions. Do not change the process identity, app credentials, environment, or assertions to obtain a pass. Keep `check` and `lint` unprivileged unless their own execution failure independently requires escalation.
- On Windows in this repository environment, run tests through `cmd.exe` and `pnpm.cmd`; from Git Bash use `cmd.exe //c "pnpm.cmd ..."`, because a single `/c` is rewritten as a path. Treat exit code zero without runner output as invalid verification.
- Treat a browser project stalled on `Cannot connect to the server in 60 seconds` as runner contention; if it recurs, cap that client project's `maxWorkers`.
- Pass focused filenames directly after the owning test script without a standalone `--`; the current pnpm forwarding can otherwise widen Vitest discovery.
- Before running tests, identify affected files and projects from changed source/test files, provenance or colocation, direct and transitive consumers, imports, shared helpers, dynamic registration, and configuration. Include every affected workspace/runtime/project; when impact is uncertain, include the plausible affected test rather than omit it. Never run unrelated sibling tests or projects.
- Pass complete relative filenames to Vitest and Playwright instead of ambiguous basename filters, then confirm the output shows every intended file/test ran. Treat zero discovered tests as failed verification even when a script keeps `--passWithNoTests`.
- An executable behavior or test-infrastructure change is incomplete until its affected tests pass. Checks, lint, UI/watch mode, or a retry-only pass do not substitute; diagnose each failure before rerunning. Documentation-only changes with no executable impact use static or skill validation instead of unrelated application tests.
- During ordinary feature, fix, refactor, review, or verification work, never run a full package test phase or full suite. If shared test infrastructure broadly affects coverage, run the smallest representative set of files/projects that exercises each changed runner or environment and report that full-suite verification was deferred.
- Run full suites only during an explicitly requested audit and only when the audit's impact or risk makes them necessary. When needed, run only declared phases and wait for each to finish: APIs use `test:con`, then `test:seq`, then `test:srt`; web apps use `test:con`, then `test:seq`; `packages/errors`, `packages/rate-limit`, and `packages/websocket` use `test:con`. Other shared packages declare no test scripts.
- Keep `--silent=passed-only` in API scripts and `--passWithNoTests` in web `test:seq`. Never redirect output or prepend API tests with `migrate:test`.
- Run API UI mode directly through `test:ui:con`, `test:ui:seq`, or `test:ui:srt`. Keep strict public ports `51300`/`51301`/`51302` and backoffice ports `51200`/`51201`/`51202`.
- Keep API dependency optimization inside each Vitest project with a separate `cacheDir`; shared optimizer caches race.
- After API, web, or WebSocket changes, run owning `check` and `lint`, then only the affected test files/projects.
- For one web non-Svelte spec select `server-{concurrent,sequential}-test-files`; for Svelte select `client-{concurrent,sequential}-test-files`.
- When `vite.config.ts` or a setup/helper imported by multiple web projects changes, select the smallest representative affected file/project set outside audits; do not default to all four projects.
- When a Playwright spec changes, pass only that spec or its affected peers to `test:e2e`. When `playwright.config.ts` changes outside an audit, run the smallest representative affected spec set.
- API `check` excludes `vitest.config.ts`: type-check it directly and run an affected API file/project. Web `check` excludes `vite.config.ts`: type-check it directly and run the representative affected web file/project set.

- Before completion, confirm moved/split suites remain registered, con suites are independent, seq suites own and clean mutable state, template entrypoints retain one ownership banner, and no cutover files remain.

## Authentication Fixtures

- Set `Origin` from `env.URL_FRONTEND`, including WebSockets.
- Use `seedTestingCookies()` once in file-level `beforeAll()` for setup auth outside auth endpoint tests. It returns Better Auth `owner`, `member`, and `administrator` cookies in that order; destructure only used roles and never share cookies across files.
- Insert unique Better Auth session rows in D1 for fixture authentication. Send the HMAC-signed, URI-encoded `token.signature` cookie, never the unsigned token.
- Keep auth sessions and verification records out of KV. Allow KV fixture assertions for any non-authoritative cache owned by the feature under test.
- Use `signInTestingUser()` when auth tests need real sign-in and request only the used role. Keep sign-in success assertions in auth suites.
- Template examples use only `owner`, `admin`, and `member`; forks may add custom roles outside template guidance.

## QUERY Coverage

- Use `queryTestingRequest(path, json, options?)` for every QUERY retrieval endpoint; send a JSON body with `method: 'QUERY'`, JSON content type, configured frontend origin, and an optional cookie.

- Cover every declared input/filter state with structured JSON, including omitted/default `filters` and omitted/`false`/`true` tri-state booleans.
- Cover malformed JSON, validation failures, and CORS preflight with `Access-Control-Request-Method: QUERY`.
- Add pagination, auth, authorization, and tenant-isolation coverage only when the contract/route requires it.
- After cutover, keep QUERY success/CORS coverage permanent and test retired GET only in a temporary cutover file.
- Assert omission of internal/foreign-key IDs and unintended timestamps outside the contract.

## Database and Test Data

- Create Drizzle clients directly from the file-local D1 binding. D1 clients require no outer teardown and expose no connection-count controls.
- Resolve numeric IDs through shared discovery helpers in `beforeAll()` whenever requests reach D1. Positive placeholders are allowed only for `400`/`401`/`403` paths rejected before database access; sequential flows reuse captured IDs.
- Put app/default data in initial/default migrations, reusable test reference rows in the test migration, and scenario-only rows in file-local setup.
- Prefix test-owned strings with `__TEST-`, or `TEST...` for alphanumeric IDs; generate runtime identifiers through helpers such as `generateUniqueName('__TEST-...')`, never from `Date.now()` alone, and use no other prefixes such as `__vitest__`. Use lowercase `__test-` or `__test_` only for fields whose validation or canonical format requires lowercase, while keeping their constant names and cleanup scope visibly test-owned.
- Prefer exact collection assertions over filtered test-owned rows. Use a lower bound only when the contract intentionally includes unknown seed data, and pair it with explicit inclusion and exclusion assertions for test-owned and foreign/tenant-owned records; never use a lower bound as the sole correctness assertion.
- Make `beforeAll()` rerunnable, create mutable data in the owning file, and clean only scenario-owned rows in foreign-key order.
- Keep scenario fixtures consistent with global invariants other suites in the same command assert, such as ledger or balance reconciliation; seed through owning commands or with values those invariants accept.

## Template, Errors, and Configuration

- Keep template tests domain-neutral. Forks add, rather than overwrite/weaken/rename, domain tests and fixtures. Use generic constants for shared IDs such as primary/isolated organizations, base upload/object-storage IDs, and shared key-value names.
- Keep global `hookTimeout` and `testTimeout` at 15 seconds. Add only the smallest local timeout above a documented longer duration.
- Filter known infrastructure errors with Vitest `onUnhandledError` by type, exact message, and dependency stack. Never install blanket `uncaughtException`/`unhandledRejection` listeners; every other unhandled error remains a failure.
- Define Vitest callbacks inline unless shared by multiple entries; type extracted callbacks with `TestUserConfig` from `vitest/config`.

## Shared Helpers

| Helper                                                               | Purpose                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `buildQueryPath(path, query)`                                        | Encode scalar/repeated query parameters.                           |
| `generateUniqueName(prefix)`                                         | Produce timestamped randomized names.                              |
| `getTestingRequest()`                                                | Send origin-aware GET requests with optional auth.                 |
| `queryTestingRequest(path, json, options?)`                          | Send origin-aware QUERY requests with a JSON body.                 |
| `postTestingRequest(path, options?)`                                 | Send origin-aware POSTs and optionally await `waitUntil()` work.   |
| `seedTestingCookies()`                                               | Seed owner, member, and administrator D1 sessions.         |
| `seedTestingCookieForOrganization(userId, organizationId, options?)` | Seed one session with a chosen active organization.                |
| `signInTestingUser(accountId?)`                                      | Sign in through the real endpoint for auth suites.                 |
| `interceptPasswordResetToken(userId)`                                | Read the newest unexpired matching D1 verification record. |
| `unpackError(responseData)`                                          | Return the first validation issue or API error message.            |

## Authentication, Rate-Limit, and Service-Credential Coverage

- Give every rate-limit case a unique Durable Object name. Put one exact-maximum concurrent burst in `con` by default; add another only for a distinct key, window, or failure mode. Put controlled-clock sliding windows, release, reset, alarms, and stored-state cleanup in `seq`. Cover HMAC tuple stability/boundaries, policy isolation, malformed keys/secrets, and multi-key compensation in `packages/rate-limit/test/*.con.test.ts`.
- At the authentication adapter/route layer, cover canonical IPv4, IPv4-mapped equivalence, IPv6 `/64`, missing/invalid trusted addresses, and `CF-Connecting-IPv6` precedence over Pseudo IPv4.
- Keep public/backoffice route suites symmetric across all `auth-implementation` policies. Assert exact policy keys, identity/network isolation, 429 `Retry-After`, invalid-attempt retention, successful-login/password-change reset, token replay retention, infrastructure release, and correlated privacy-safe logs.
- Assert no D1, ACL, or Better Auth initialization after validation/CAPTCHA failure, reset suppression, or a prefilled blocked unauthenticated request. Suppressed resets create no verification, email, or persistent audit effect.
- Inject context and Better Auth infrastructure failures and verify exact compensation. For password changes, assert invalidation of the old current and all other sessions plus continued authentication through the rotated cookie. Blocked administrative reset initiation creates no verification or email effects; assert its durable audit behavior against the product's explicit event-coverage policy.
- Test the four backoffice retention cron selectors with scheduled controllers. Cover expiry boundaries, deterministic batches, caps/reporting, repeated execution, cleanup indexes, and surface-scoped realtime cleanup.
- Cover service-principal ownership and idempotent replay, credential composite binding, hashed-key uniqueness, organization cascade, ACL assignability conflicts, maximum-two concurrent issuance, management/cleanup indexes, orphan and expiry cleanup, and stable guarded jobs with focused database tests.
- Keep public/backoffice protected-surface coverage symmetric: bounded prefixes, credential-source exclusion, preflight, exact limiter mappings, one verification call, audience isolation, linked-enabled-principal loading, current-catalog intersection, uniform `401` credential failures, authorization-only `403`, and a test-only success probe.
- Cover session-only principal and credential management, owner/admin success, member denial, active-organization isolation, strict input rejection, safe response projection, one-time raw-key return, hash-at-rest, immutable permanent revoke, principal disable/re-enable concurrency, disabled-principal delete guards, and deletion-time credential cascade. Web coverage includes role navigation, safe metadata states, attempt snapshots, mutation locks, tenant invalidation, disabled credential retries, destructive revoke confirmation, one-time secret handling, and secret removal from TanStack Query state and persistence.
- Never expose raw keys, stored hashes, limiter secrets, complete trusted networks, session cookies, or one-time create responses in test names, snapshots, diagnostics, or fixtures.
- For credential issuance, cover concurrent duplicate claims, completed lost-response replay without a key or second audit, changed-input rejection, terminal pending/failed claims, two-active-key enforcement, orphan cleanup, revocation-time ledger retention, and absence of raw keys from ledger rows, logs, and frontend mutation state.
