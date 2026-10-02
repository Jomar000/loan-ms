---
name: monorepo-troubleshooting
description: Project rules for pnpm tooling failures, workspace boundaries, template tokens, runtime-safe exports, dependencies, and build order. Use when diagnosing build/check/install errors or changing packages, workspace dependencies, or exports.
---

# Monorepo Troubleshooting

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

- Load `svelte-patterns` for frontend package/component structure, `hono-patterns` for API behavior/exports, `database-patterns` for database build/bootstrap/migrations, `validator-patterns` for schema exports/boundaries, and `deployment-operations` for Wrangler, deploy, secret, or CI/CD changes.

## Tooling and pnpm Failure Boundary

- Use the Node.js and pnpm versions required by root `package.json`, and run pnpm from the repository root; keep `engineStrict: true`, use the root `pnpm-lock.yaml`, and create no nested lockfiles.

- Classify errors from the pnpm executable/version, installation, dependency resolution, store, lockfile, or workspace graph as pnpm/tooling failures. At the first such failure:

1. Stop immediately and report the command, error, and available context.
2. Request user intervention.
3. Do not retry, reinstall, clear caches/stores, change Node or pnpm versions/configuration, edit dependencies/lockfiles, or run follow-up pnpm diagnostics automatically.

- Diagnose application failures reported by a pnpm-launched check, lint, build, or test script normally; do not classify them as pnpm/tooling failures.

## Template and Workspace

- Treat `PROJECT_NAME` as the reusable token for package scopes, uppercase binding prefixes, and template references:
    - Use `@PROJECT_NAME/*` and bindings such as `PROJECT_NAME{PUB|BOFC}_KV` in reusable guidance.
    - Never resolve it inside template skills; replace it only in project-owned commands, implementation, or configuration.
- Use `template-merge-workflow` for template-to-fork merges and align root agent docs when project context, structure, workflow, permissions, or command boundaries change.

| Workspace                                | Depends on / boundary                                                                                                                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/errors`                        | Worker-runtime-safe base/application errors, authoritative public-code classification, and semantic catalog definitions; no framework, database, or Node-only imports.                                                                               |
| `packages/types`                         | Depends on `errors` for public error-code types; no runtime logic beyond type references. Stable subpaths: `@PROJECT_NAME/types/shared`, `@PROJECT_NAME/types/public`, `@PROJECT_NAME/types/backoffice`.                                               |
| `packages/database`                      | Drizzle schema/utilities; never imported by frontends; exclude Node-only bootstrap utilities from Worker exports.                                                                                                                                     |
| `packages/rate-limit`                    | Depends on `errors`; Worker-runtime-safe exact rate-limit mechanics, policies, typed Durable Object RPC, HMAC tuple transport, and SQLite Durable Object base; no Hono, Better Auth, app action, database, or binding-name imports.                    |
| `packages/ui`                            | Shared Svelte primitives; no backend/database/Worker-only imports.                                                                                                                                                                                    |
| `packages/validator`                     | Depends on `types`; shared Zod contracts; no database imports.                                                                                                                                                                                        |
| `packages/websocket`                     | Depends on `errors`, `types`, and `validator`; Worker- and browser-runtime-safe transport, client manager, and WebSocket Durable Object behavior; no database imports.                                                                                 |
| `apps/api-public`, `apps/api-backoffice` | Exported Hono route types resolve through `types` and `validator` dependencies. Worker-only implementation uses `database`, `errors`, `rate-limit`, and `websocket` as development/build dependencies and must not leak them through frontend-consumed exports. |
| `apps/web-public`, `apps/web-backoffice` | Development/build dependencies include the matching API plus `types`, `validator`, `ui`, and `websocket`; never import `database` or Worker-only API implementation.                                                                                  |

- Build `errors`/`database`/`ui` in parallel, then `types`/`rate-limit`, then `validator`, then `websocket`, then both APIs, then both web apps. Let pnpm derive this order; do not add Turborepo/Nx or move workspaces unless explicitly requested.

### Prepare

- Root runs `pnpm exec husky`; `errors`, `types`, `validator`, `database`, `rate-limit`, `ui`, and `websocket` run `pnpm build`; web apps run `svelte-kit sync || echo ''`; API apps run no prepare script.

## Dependency and Export Rules

- Centralize shared third-party versions in the root `pnpm-workspace.yaml` catalog and reference them with `catalog:`; use `workspace:*` for internal packages.
- Keep Worker-imported modules runtime-agnostic. Server-only API packages belong in `devDependencies` so they do not leak to frontends; API apps are private Wrangler bundles, so their own builds ignore the dependencies/devDependencies distinction.
- Put in an API app's `dependencies` only packages web consumers need to resolve exported Hono route types. Check its `package.json` `README` boundary notes.
- Add a package export only for a new consumable subpath, never a symbol already covered by one.
- Do not add runtime logic to `packages/types` or destabilize its consumer-facing exports.

## Runtime Boundary

- Keep Worker-imported code free of Node-only APIs such as `fs` or direct `process.env`. Node-only development, migration, bootstrap, and test utilities may use them only when excluded from Worker builds and exports.

The D1 client, schema, and runtime-safe exports live under
`packages/database/src/d1`. Keep Wrangler migration loading and Vitest setup in
Node/test configuration code rather than Worker-facing package exports.

## Commands and Consumers

- Run the narrowest owning-package command first:

```bash
pnpm --filter=<package-name> check
pnpm --filter=<package-name> lint
pnpm --filter=<package-name> build
```

- Follow `cloudflare-worker-testing` for tests and run only scripts the owning package declares: APIs provide `test:con`, `test:seq`, and `test:srt`; web apps provide `test:con` and `test:seq`; `errors`, `rate-limit`, and `websocket` provide `test:con`; the remaining shared packages provide no test scripts. Never use aggregate `test` or invent a missing test phase.

- Use these unusual package commands only for their named purpose:

```bash
pnpm --filter=@PROJECT_NAME/database migrate:dev
```

- A direct consumer declares the changed workspace in `package.json` or imports its changed export/subpath. A transitive consumer depends on a direct consumer whose public types or exports changed.
- When a change crosses a package boundary, run equivalent checks for every direct consumer and include transitive consumers when public types/exports changed.
- Follow `deployment-operations` before staging/production deployment, secret, or migration commands.

## Non-pnpm Script Failures

### Build/Check Failure Procedure

1. Confirm the command ran from the repository root and identify the owning package.
2. Check package names, `workspace:*` links, catalog entries, export maps, runtime-boundary violations, build order, and generated artifacts as relevant.
3. Re-run only the narrowest project script justified by the diagnosis.

- Scan or rebuild the repository only when the failure crosses package boundaries or the owning-package check is inconclusive; stop under the pnpm Failure Boundary if investigation reveals a pnpm/tooling failure.
