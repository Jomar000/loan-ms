# Hyperion

Hyperion is the source full-stack template for independently owned public and
backoffice surfaces. It combines static/SPA SvelteKit frontends, Cloudflare
Worker APIs, Cloudflare D1 persistence, shared contracts, authentication, and
realtime infrastructure without forcing the two product surfaces into another
shared application package.

It is a configurable, domain-neutral foundation rather than a finished
product. Forks own their product model, branding, content, live infrastructure,
and deployment decisions while retaining or adapting the reusable engineering
baseline described here.

## Included Capabilities

| Area                  | Reusable baseline                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product surfaces      | Independently ownable public and backoffice SvelteKit static/SPA applications with landing, sign-in, email-verification, and role-scoped application shells                               |
| APIs and contracts    | Mirrored Hono Worker APIs with typed route exports, shared Zod request/response schemas, validation middleware, structured responses, and consistent error handling                       |
| Identity and tenancy  | Better Auth username/email credentials, email verification, password recovery, organization selection, `owner`/`admin`/`member` access control, and D1-backed sessions                    |
| Persistence           | Drizzle-managed Cloudflare D1 shared by both APIs for tenant membership, profiles, addresses, notifications, audit trails, and persistence-level idempotency                              |
| Optional integrations | Organization service principals with API-key credentials, Turnstile verification, selectable Resend or Cloudflare Email Sending delivery, and R2-backed object upload/download flows      |
| Realtime              | Registered server-push events through Hibernating Durable Objects, authorization-aware fan-out, shared browser connections, event-driven query refresh, and recovery after reconnect gaps |
| Shared frontend       | Svelte 5 and Tailwind CSS foundations, shadcn-svelte primitives, owned overrides and compositions, shared media components, and reusable form/query patterns                              |
| Template tooling      | Strict TypeScript, pnpm workspaces and catalogs, ESLint and Prettier, Vitest and Playwright phases, Husky hooks, Changesets, and a one-time fork initializer                              |

## Architecture

| Workspace             | Responsibility                                            |
| --------------------- | --------------------------------------------------------- |
| `apps/web-public`     | Public SvelteKit static/SPA frontend (port `5174`)        |
| `apps/api-public`     | Public Hono Worker API (port `8081`)                      |
| `apps/web-backoffice` | Backoffice SvelteKit static/SPA frontend (port `5173`)    |
| `apps/api-backoffice` | Backoffice Hono Worker API (port `8080`)                  |
| `packages/database`   | Drizzle D1 schema, migrations, triggers, and seed data    |
| `packages/errors`     | Shared Worker-safe errors and public error catalog        |
| `packages/rate-limit` | Exact Durable Object-backed rate-limit coordination       |
| `packages/types`      | Shared TypeScript contracts                               |
| `packages/ui`         | Shared shadcn-svelte primitives, overrides, and custom UI |
| `packages/validator`  | Shared Zod request and response schemas                   |
| `packages/websocket`  | Shared realtime protocol and Worker/browser transport     |

Public and backoffice implementations intentionally remain mirrored but
separate. Fork owners may evolve either surface without first disentangling a
shared frontend or API package.

## Capability Boundary

The template intentionally contains no product-specific business domain,
branding, production data, live secrets, deployed routes, or
application-specific realtime event catalog. Its account, organization,
profile, address, notification, storage, and dashboard flows are reusable
reference capabilities that forks may retain, replace, or extend.

The runtime architecture deliberately targets Cloudflare Workers, D1, KV,
Durable Objects, and optional R2. The retained GitLab and Supabase
workflows are provider templates rather than a commitment by downstream forks;
fork owners must deliberately configure, replace, or remove operational
providers for their environment.

## Prerequisites

- Node.js `26.8.1` or newer
- pnpm `12.8.1` or newer
- Bash on Linux/macOS or Git Bash on Windows for repository hooks and the
  integrated VS Code terminals
- A Cloudflare account only when configuring or deploying Worker resources

## Setup

1. For a downstream fork, [configure the fork](#configure-a-fork) first and run
   the exact install and Worker-type commands printed by the initializer. When
   working directly on this source template, run
   `pnpm install --frozen-lockfile` from the repository root instead.
2. Review each API's `.dev.vars` and committed `wrangler.toml`, and each web
   app's `.env`. The initializer creates missing ignored files from their
   committed examples; source-template contributors who do not initialize must
   copy the matching examples manually.
3. Run `pnpm --filter=@hyperion/database migrate:dev`.
4. Start all declared development processes with `pnpm dev`. When this
   repository is opened in VS Code, the committed tasks automatically launch
   the seven development terminals through Bash; stop any terminal you do not
   need for the current workflow.

Object storage is off by default in local development. Configure its R2 values
and secrets before enabling both API and both web build
`FEATURE_OBJECT_STORAGE` flags. Test configuration keeps the feature enabled
for regression coverage.

Organization service-principal access is also off by default. Each non-human
principal owns its assignable ACL permissions and authenticates through linked,
immutable Better Auth API-key credentials. Enable `FEATURE_API_KEY` in both API
Workers and the backoffice build together. Disabled API routes return `404 Not
Found`, while the backoffice omits service-principal navigation and redirects
direct access. API test configuration keeps the feature enabled so its complete
management and protected-surface coverage still runs.

In-app browser detection is also off by default. Set
`FEATURE_IN_APP_BROWSER_DETECTION=1` independently in either web app's build
environment to include its root-level browser recommendation notice.

`packages/rate-limit` owns reusable exact sliding-window coordination. Each API
exports a local SQLite `RateLimit` Durable Object and can deploy standalone. Set
a strong `CF_DO_RATE_LIMIT_SECRET` for each Worker; values may differ while the
namespaces are independent. To intentionally share counters, point one API's
`_DO_RL` binding at the selected owner Worker with `script_name`, align the
package runtime, secret, and policy versions, and deploy the owner first.
Secret, live-binding, and deployment commands require explicit approval.

## Commands

Use narrow workspace commands during development:

```bash
pnpm --filter=@hyperion/errors check
pnpm --filter=@hyperion/types check
pnpm --filter=@hyperion/database build
pnpm --filter=@hyperion/api-public check
pnpm --filter=@hyperion/web-public lint
pnpm --filter=@hyperion/ui build
```

Root `check` and `build` run the corresponding declared workspace scripts. Root
`lint` and `format` cover project-owned sources, root scripts, configuration,
and Markdown. Generated artifacts, mirrored skill packages, dependency
lockfiles, `pnpm-workspace.yaml`, and provider CI/CD templates retain their
owning tool's format and are excluded. Tests are split into `test:con`,
`test:seq`, and `test:srt` phases; use only the affected files and phases
described in `AGENTS.md`.

Regenerate committed Worker binding types explicitly after changing Wrangler
bindings:

```bash
pnpm --filter=@hyperion/api-public types:worker
pnpm --filter=@hyperion/api-backoffice types:worker
```

## Environment Authority

| Concern                    | Development/test authority               | Deployment preparation                                                              |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Database tooling           | public API `wrangler.toml` D1 binding    | complete the environment-specific public API D1 database name and ID                |
| API public values/bindings | each API's committed `wrangler.toml`     | copy `wrangler.toml.example` to ignored environment-specific Wrangler files         |
| API secrets                | each API's ignored `.dev.vars`           | ignored `.dev.vars.staging` and `.dev.vars.production`, uploaded deliberately       |
| Web build-time values      | each web app's ignored `.env`            | environment-specific `.env` files or CI values                                      |
| Web Worker routes          | each web app's committed `wrangler.toml` | copy and complete `wrangler.toml.example`; replace all reserved-domain placeholders |

Do not put secrets in `PUBLIC_*` values, build-time feature flags, or committed
Wrangler files. Vite reads `FEATURE_*` web values only while starting or building
an app and injects validated booleans rather than exposing the environment
variables through the client runtime. Deployment commands, deployed secrets,
routes, and staging/production migrations always require an explicit human
decision. The repository retains GitLab and Supabase workflow templates; fork
owners must review and deliberately configure or replace them for their chosen
providers.

The public API Wrangler configuration is the sole D1 migration owner. Both APIs
bind the same database per environment and use the same local
`.wrangler/state` persistence directory, so never apply shared migrations from
both API workspaces. The committed Drizzle config is credential-free and exists
for schema generation and migration-history checks. Remote D1 creation and
staging or production migrations require explicit approval.

### Application Email Delivery

Mail is a global backend capability and authentication is its first consumer.
It is off by default, and each API independently enables it with
`FEATURE_MAIL=1`. While disabled, provider variables, provider secrets, and
Cloudflare Email Sending bindings are optional. The reset-request initiation
routes return `404 Not Found` before database or authentication context is
initialized, while existing password-reset and email-verification tokens remain
redeemable. Test configuration uses Cloudflare's simulated Email Sending
binding for regression coverage without requiring a Resend secret.

An enabled API selects exactly one provider with `MAILER_PROVIDER="resend"` or
`MAILER_PROVIDER="cloudflare"`. There is no automatic fallback.
`MAILER_ACCOUNT` is the sender address for the selected provider. Resend
additionally requires `RESEND_API_KEY`; keep that secret while rollback support
is required. Cloudflare uses `HYPERIONPUB_EMAIL` for the public API and
`HYPERIONBOFC_EMAIL` for backoffice.

Cloudflare delivery to arbitrary application users requires Workers Paid
[Email Sending](https://developers.cloudflare.com/email-service/platform/pricing/),
not Email Routing's verified-destination-only free mode. Before selecting it,
[onboard the exact sender domain or subdomain](https://developers.cloudflare.com/email-service/configuration/subdomains/)
and wait for Cloudflare-managed SPF, DKIM, DMARC, and bounce records to verify.
Replace every committed `.example` sender before deployment; the reserved
`hyperion.example` addresses are illustrative and must never be used live.

When Cloudflare is selected, declare a `send_email` binding separately in every
enabled environment because named environments do not inherit binding arrays.
Bindings restrict `allowed_sender_addresses` but intentionally do not restrict
recipients. Omit `remote = true` locally so development simulates delivery.
After deployment approval, enable and cut over staging first by changing the
feature flag, provider, and matching sender together; verify external-recipient
application mail and Cloudflare delivery logs, then repeat for production.
Roll back by restoring the Resend provider and its matching sender, or disable
the feature to remove outbound mail entirely.

## Configure a Fork

Run the dependency-free initializer once in a clean checkout. It previews by
default; add `--write` to apply the result. For file-based configuration, copy
the ignored input template and set the six identity fields. Blank `scope`,
`bindingPrefix`, and `domain` values derive from `slug`.

```bash
cp .template.json.example .template.json
pnpm profile:init
pnpm profile:init -- --write
```

Command-line values override matching file values and also support a CLI-only
flow:

```bash
pnpm profile:init -- --slug acme --display-name "Acme" --author "Acme Inc." --scope '@acme' --binding-prefix ACME --domain acme.example --write
```

The initializer updates tracked identity, package scope, bindings, examples,
documentation, and lockfile identity without entering `.git`, dependency/build
output, or generated Worker types. It preserves existing local configuration
and creates only missing local files from committed examples. A successful
write consumes `.template.json`, records the effective identity and timestamp in
`.template-initialized.json`, and prints the exact lockfile and Worker-type
commands to run next. It never creates deployment configuration.

Identity values are escaped for each supported file format; control characters
and multiline values are rejected. Svelte source should read the display name
from `PUBLIC_NAME`. The ownership marker is repository metadata and must not be
imported by an application.

After initialization:

- Keep `.template-initialized.json`; initialization is intentionally one-time.
- Replace all reserved-domain, zero-ID, route, binding, and secret placeholders
  before deployment.
- Keep fork-specific product and design decisions in `.agents/context/` or
  fork-owned documentation. Do not weaken or rename reusable template skills.
- Keep generated shadcn-svelte primitives CLI-owned. Put intentional
  divergences in `packages/ui/src/overrides/` and reusable compositions in
  `packages/ui/src/shared/`.

## Template Ownership and Profile Updates

`fullstack_postgres` is the source for the `fullstack_d1` and `landing_static`
profiles. Their capability boundaries are defined in
`.agents/context/TEMPLATE_OWNERSHIP.md`; source-owned initialization, checking,
and ownership tooling is grouped under `scripts/repository/`.

| Profile          | Declared ownership                                                                           | Verification                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `fullstack_d1`   | D1 adapters, bindings, migrations, persistence semantics, and supporting tests/configuration | `profile:check` enforces D1 invariants; `profile:check:postgres` also compares unowned source paths       |
| `landing_static` | Removed backend capabilities plus its static frontend, root tooling, and profile guidance    | `profile:check` enforces the two-workspace boundary; `profile:check:postgres` also compares unowned paths |

Both comparisons treat new paths as shared by default. When a valid
`.template-initialized.json` exists, the pristine reference is projected through
the recorded one-pass identity transformation before byte comparison. Every
other path or content difference must be declared by the target profile's
reviewed ownership manifest.

All profiles use `profile:init` for one-time identity configuration and
`profile:test` for tooling regressions. Child profiles additionally expose
`profile:check` for local boundary checks and `profile:check:postgres` when the
`fullstack_postgres` reference is available. The source profile does not check
itself.

Never merge a template branch wholesale into a configured fork. Use the
`template-merge-workflow` skill when bringing future source-template updates into
an existing fork.

## D1 Compatibility and Limits

The D1 profile preserves the current HTTP contracts and application features,
but it does not provide PostgreSQL's general interactive transactions, row or
advisory locks, `SKIP LOCKED`, Hyperdrive pooling, PL/pgSQL, database-owned cron,
native enums/UUID/JSONB/timestamptz/sequences, SQLSTATE errors, or comparable
concurrent-write throughput and database-size headroom. Application-owned
workflows use conditional writes, D1 batches, idempotency ledgers, and scheduled
cleanup to preserve domain invariants. Better Auth uses the SQLite adapter
without cross-statement rollback for multi-write failure paths. See
[`packages/database/README.md`](packages/database/README.md)
for the table-by-table conversion ledger.

## Documentation Authority

This README is the authoritative human-facing description of the reusable base
template and its operating instructions: supported baseline capabilities,
workspace topology, setup, environment model, commands, fork initialization,
ownership lifecycle, and profile update workflows. Comparative branch
capability boundaries are defined in `.agents/context/TEMPLATE_OWNERSHIP.md`.
Update this README when the baseline or its procedures change instead of relying
on agent context to describe them.

| Source                                    | Responsibility                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                               | Stable reusable-template identity, baseline capabilities, architecture, setup, fork/profile instructions, and ownership lifecycle |
| `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` | Synchronized entry points for engineering workflow, safety, context routing, and skill selection                                  |
| `.agents/skills/` and `.claude/skills/`   | Reusable implementation rules; `.agents/skills/` is canonical and `.claude/skills/` is its exact compatibility mirror             |
| `.agents/context/`                        | Scoped authoritative guidance plus product, design, color, handover, caveat, and comparative branch-capability decisions          |
| Package documentation                     | Detailed subsystem contracts and internals that remain consistent with the repository-wide baseline                               |

Executable code and configuration remain the implementation truth. When they
change the reusable baseline, update this README in the same change. Forks
should record their product-specific decisions in context documents or
fork-owned documentation without weakening template skills.
