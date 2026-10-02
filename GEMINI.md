> **Sync note:** Keep this aligned with `AGENTS.md`, `CLAUDE.md`, `.agents/context/`, `.agents/skills/`, and `.claude/skills/`.

# GEMINI.md

## Project

Strict TypeScript monorepo for SvelteKit static/SPA frontends, Hono API BFFs, Drizzle/D1, shared validators, and Cloudflare Workers.

Workspaces:

- `apps/web-public`
- `apps/web-backoffice`
- `apps/api-public`
- `apps/api-backoffice`
- `packages/errors`
- `packages/types`
- `packages/validator`
- `packages/database`
- `packages/rate-limit`
- `packages/ui`
- `packages/websocket`

Use `pnpm` from the repository root. Do not create nested lockfiles.

`PROJECT_NAME` is the reusable template token for package scope and binding prefixes.

## Default Behavior

- Search before reading; load only relevant files and scan broadly only when necessary.
- Minimize context and diff. Do not refactor, rename, move, or reformat unrelated code or files.
- Do not paste full files in the final response.
- Final response should only include:

    - what changed
    - files touched
    - checks/tests run
    - caveats, if any

## Runtime Boundary

Cloudflare Worker-facing code must stay runtime-agnostic.

Do not use Node-only APIs such as `fs` or direct `process.env` in Worker-imported code.

Node-only scripts, migrations, bootstrap utilities, and test utilities may use Node APIs only when excluded from Worker-facing builds and exports.

## Context Routing

Project context is canonical under `.agents/context/`. Load only the documents relevant to the task:

- `.agents/context/OVERVIEW.md` — product purpose, users, domain terminology, scope, and core workflow decisions.
- `.agents/context/DESIGN.md` — visual direction, UX behavior, responsive layout, interaction patterns, and component intent.
- `.agents/context/COLORS.md` — color tokens, themes, semantic states, raw-color exceptions, and any UI change introducing or reviewing color usage.
- `.agents/context/NOTES.md` — handover caveats, special instructions, fork-specific behavior, and template-merge constraints.
- `.agents/context/TEMPLATE_OWNERSHIP.md` — source-template identity and comparative branch capability boundaries.

Do not load every context document by default. Load multiple documents when a task crosses their concerns.

Context documents supplement relevant skills; they do not replace them. Entry points and skills govern engineering process and architecture, while context documents govern project-specific product and design intent. Surface conflicts instead of silently overriding either source.

An empty context template provides no additional requirements. Do not invent missing project decisions.

## Skill Routing

Template skills are authoritative:

- `.agents/skills/` is the canonical source for reusable skill guidance.
- `.claude/skills/` must remain an exact compatibility mirror of `.agents/skills/`.
- `.agents/skills/PROVENANCE.md` is the canonical ownership and upstream-version registry. Consult it before updating vendored skills, and update its applied and checked revisions only after verification passes.
- Keep discoverable skill directories flat under each skill root; use each skill's internal `references/`, `scripts/`, `assets/`, and `agents/` directories for supporting resources.
- Downstream forks must not override, weaken, or rename template skills. Put project-specific additions in `.agents/context/` or fork-owned documentation.
- Project-specific context may supplement template skills but must not conflict with them. Surface conflicts and keep the template rule.
- Preserve every directory classified as vendored-verbatim in `PROVENANCE.md`. Put local constraints in native companion skills or root instructions; for Svelte, use `svelte-patterns` or `svelte-data-forms`.
- For Svelte work, load the relevant official skills for framework behavior and validation, then apply explicit project rules for runtime boundaries, placement, script organization, data flow, and generated UI ownership.
- In this repository, replace the vendored code-writer's `npx @sveltejs/mcp ...` examples with `pnpm exec svelte-mcp ...` from the repository root; preserve all command arguments.

### Svelte Analyzer Network Boundary

The following allowance applies only to the pinned, locally installed `@sveltejs/mcp@0.1.26`:

- Invoke the CLI from the repository root as `pnpm exec svelte-mcp <explicit-subcommand> ...`. Never use `npx`, a bare `svelte-mcp` executable, an omitted subcommand, or the `__mcp` command.
- Allow elevated internet access only for read-only Svelte documentation requests: `GET https://svelte.dev/docs/experimental/sections.json` and the selected `GET https://svelte.dev/docs/.../llms.txt` pages. Do not allow unexpected hosts, non-GET requests, source code in request bodies, remote MCP transport, telemetry, playground submission, or any other source upload.
- `list-sections` fetches the documentation section index. `get-documentation` fetches that index and the selected `llms.txt` pages.
- `svelte-autofixer` reads the requested source locally and runs its bundled Svelte compiler diagnostics, suggestion rules, and ESLint analysis locally. Its module initialization also fetches the documentation section index, so this explicit subcommand may receive the same narrow internet allowance; source analysis and source contents must remain local.
- Explicit CLI subcommands instantiate the package's in-process MCP server object during module loading, but they do not start an MCP transport or contact an MCP server. Never invoke or fall back to the MCP transport mode.
- Re-audit the installed bundle before granting internet access to another `@sveltejs/mcp` version or whenever an invocation attempts an unlisted endpoint or activity. Do not extend the allowance until the executable network calls and local-analysis behavior have been verified again.

Load only the skill files relevant to the task:

- `implementation-review` — requested implementation/plan-compliance reviews, static sanity passes, and code/test simplicity checks; respects review-only versus authorized remediation scope, not an extra workflow for every edit.
- `svelte-code-writer` — official Svelte documentation lookup and autofixer workflow for creating, editing, or analyzing `.svelte` and `.svelte.ts`/`.svelte.js` files.
- `svelte-core-bestpractices` — official modern Svelte guidance for reactivity, events, snippets, styling, context, and legacy-feature avoidance.
- `svelte-patterns` — repository-specific SvelteKit runtime boundaries, routes, component placement, script organization, imports, styling, fonts, and shared UI ownership.
- `shadcn-svelte` — shadcn-svelte component APIs, documentation, CLI workflows, presets, theming, and registries for `packages/ui`; load it with `svelte-patterns`, whose ownership rules remain authoritative.
- `ui-ux-pro-max` — vendored UI/UX guidance and local search data for visual and interaction work; apply its recommendations within `.agents/context/DESIGN.md`, `.agents/context/COLORS.md`, and the relevant Svelte skills.
- `svelte-data-forms` — TanStack Query, typed Hono client calls, forms, debounced search, filters, mutations, submission locks, retry behavior, and frontend idempotency.
- `audit-trail-patterns` — durable audit records, actor attribution, JSON-safe snapshots, redaction, transaction and external-effect boundaries, tenant-scoped readers, Activity Logs cache freshness, and audit verification.
- `hono-patterns` — Hono routes, middleware, request context, validation, response contracts, tenant scope, backend concurrency, observability, and WebSockets.
- `database-patterns` — Drizzle schema, queries, migrations, tenancy, indexes, local/test DB bootstrap, and persistence-level idempotency.
- `validator-patterns` — Zod validators, shared API schema contracts, field builders, refinements, and `packages/validator` exports.
- `better-auth-best-practices` — upstream Better Auth server/client configuration, adapters, sessions, plugins, and environment behavior; load it for general Better Auth API or configuration work.
- `email-and-password-best-practices` — upstream email/password, verification, reset, password-policy, and hashing guidance.
- `organization-best-practices` — upstream Better Auth organization, team, membership, invitation, role, and permission guidance.
- `two-factor-authentication-best-practices` — upstream Better Auth TOTP, OTP, backup-code, trusted-device, and 2FA sign-in guidance.
- `better-auth-security-best-practices` — upstream Better Auth hardening guidance for secrets, origins, sessions, cookies, OAuth, rate limiting, and auditing.
- `auth-implementation` — repository-specific Better Auth initialization, persistence, throttling, authorization, and cookie rules. Load it with every applicable upstream Better Auth skill; its explicit project constraints govern whenever generic upstream examples differ.
- `cloudflare-worker-testing` — API/web Vitest naming and provenance, Worker isolation, auth fixtures, and test DB lifecycle.
- `monorepo-troubleshooting` — pnpm workspace setup, dependency graph, package boundaries, local tooling, template tokens, package exports, and build order.
- `template-merge-workflow` — merging global template updates into downstream forks, conflict policy, structural migrations, and post-merge checks.
- `deployment-operations` — Wrangler config, environment files, secrets, deployment scripts, staging/prod migrations, R2 S3 config, and CI/CD.

Load multiple skills only when the task crosses boundaries.

## Skill Audit Markers

- Add or update `## Last Comprehensive Audit Timestamp` only after a comprehensive skill audit and all required verification have passed.
- Use one actual completion timestamp in ISO-8601 Asia/Manila format with a `+08:00` offset. Place the section immediately below each eligible audited `SKILL.md` title and copy it exactly to the mirror.
- Exclude vendored-verbatim skills from timestamp edits and report the exclusion. After final edits, verify timestamp placement and complete mirror equality.

## Commands

Prefer narrow workspace commands:

```bash
pnpm --filter=<package-name> check
pnpm --filter=<package-name> lint
pnpm --filter=<package-name> test:con
pnpm --filter=<package-name> test:seq
pnpm --filter=<package-name> test:srt
pnpm --filter=<package-name> build
```

Run the narrowest relevant check/test first.

Follow `cloudflare-worker-testing` for affected-test selection and execution. During ordinary work, run only affected tests. Start every Vitest and Playwright command with tool-level elevated permissions; keep `check` and `lint` unprivileged unless their own execution failure independently requires escalation.

Never run aggregate `test`. Full package verification is limited to explicitly requested audits and only when impact or risk justifies it. For that audit verification, run only declared scripts in order:

- APIs: `test:con`, then `test:seq`, then `test:srt`.
- Web apps: `test:con`, then `test:seq`.
- Errors, rate-limit, and WebSocket packages: `test:con`.
- Types, validator, database, and UI packages currently have no test scripts; do not invent one.

If pnpm itself fails through its executable/version, install, dependency resolution, store, lockfile, or workspace graph, stop immediately, report the failure, and request user intervention; do not attempt automated remediation. Continue diagnosing application failures reported by pnpm-launched scripts.

## Safety

Allowed edit scope:

- `apps/`
- `packages/`
- `.agents/`
- `.claude/`
- root config and docs

Never edit `.git/`.

Allowed without approval:

- read-only Git commands
- package install/build/check/lint/test/format
- local development/test migrations

Require explicit human approval before:

- mutating Git commands
- deployments
- secret changes
- staging or production migrations

Never auto-run or propose:

```bash
git reset --hard
git push --force
git push -f
git clean
rm -rf
rimraf
```
