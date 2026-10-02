---
name: deployment-operations
description: Project rules for Wrangler, environments, secrets, bindings, deployment scripts, live migrations, R2, CI/CD, and approvals. Use when changing deployment configuration, environment values, routes, secrets, bindings, migration/deployment scripts, or CI/CD.
---

# Deployment Operations

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

- Load `hono-patterns` for API routes, `database-patterns` for migrations, `cloudflare-worker-testing` for test bindings, and `monorepo-troubleshooting` for package/workspace scripts.

## Approval Boundary

- Require explicit human approval before executing deployment, secret-management, or staging/production migration commands, or changing live route/domain behavior. Implementation, review, and preparation requests do not authorize:

```bash
pnpm --filter=<package-name> deploy:staging
pnpm --filter=<package-name> deploy:prod
pnpm --filter=<package-name> secret:staging
pnpm --filter=<package-name> secret:prod
pnpm --filter=@PROJECT_NAME/database migrate:staging
pnpm --filter=@PROJECT_NAME/database migrate:prod
```

- Without approval, inspect configuration; edit requested docs, non-secret configuration examples, or local/development configuration; run local build/check/lint/test commands; and run development/test migrations.

## Configuration and Environment Files

| Purpose                  | Files                                                                                                            | Rules                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local API                | Committed `apps/api-{public,backoffice}/wrangler.toml`                                                           | Required for local development. Keep non-secret vars and bindings here.                                                                                                                                         |
| API deployment template  | Committed `apps/api-{public,backoffice}/wrangler.toml.example`                                                   | Keep staging/production structure, placeholder routes, vars, and bindings current; copy to an ignored deployed config and fill live values only with approval.                                                  |
| Deployed API             | Ignored `wrangler-staging.toml` and `wrangler-production.toml`                                                   | Never commit; coordinate and obtain approval before changing live values or deploying.                                                                                                                          |
| Local secrets            | Uncommitted `apps/api-{public,backoffice}/.dev.vars`                                                             | Create from the matching committed `.dev.vars.example`; never expose real values.                                                                                                                               |
| Local web                | Committed `apps/web-{public,backoffice}/.env.example` and `wrangler.toml`                                        | Copy `.env.example` to ignored `.env` for local build values. Keep local static-assets Wrangler configuration committed and non-secret.                                                                         |
| Web deployment templates | Committed `apps/web-{public,backoffice}/wrangler.toml.example` plus `.env.example` as the variable-name baseline | Keep staging/production route structure current. Create ignored `.env.staging`/`.env.production` and `wrangler-staging.toml`/`wrangler-production.toml` for live builds/deployments; never commit their values. |
| Database validation      | Committed `packages/database/drizzle.config.ts`                                                                  | Keep credential-free; use for migration-history checks without connecting to a database.                                                                                                                        |
| D1 migration owner       | Public API Wrangler files                                                                                       | Both APIs bind the same D1 database per environment; apply shared migrations only through the public API configuration.                                                                                        |
| Local/test database      | Both API Wrangler files plus shared `.wrangler/state`                                                           | Use D1 bindings and `readD1Migrations()`; no database URL or credential file is required.                                                                                                                       |

- Treat each `.dev.vars.example` as the authority for local API secret names and each web `.env.example` as the authority for build-variable names. Include every locally read value; retain an unread entry only when guidance explicitly reserves it, such as Google OAuth placeholders.
- Keep secrets out of Wrangler config. Never expose or commit secrets, API keys, OAuth client secrets, R2 secret keys, or staging/production database URLs.
- Export a thin SQLite `RateLimit` subclass from each API and bind `PROJECT_NAMEPUB_DO_RL` and `PROJECT_NAMEBOFC_DO_RL` to their local classes. Keep committed local, test, staging-example, and production-example `_DO_RL` bindings free of `script_name` so either API can deploy independently.
- Keep API-key throttling on each API's local namespace; add no binding, secret, service binding, fixture Worker, or cross-surface deployment dependency for it.
- Keep generic runtime behavior in `@PROJECT_NAME/rate-limit` and authentication policies in each API. In standalone topology, keep both `rateLimit.ts` subclasses and `policies/authRateLimit.ts` modules byte-equivalent and both adapters behaviorally equivalent except for the surface binding name.
- Share a namespace only when the package runtime, complete policies, policy versions, and `CF_DO_RATE_LIMIT_SECRET` match. Add `script_name` only to the intentional consumer binding and deploy the owner first; add a cross-worker test fixture only for that external binding under `cloudflare-worker-testing`.
- Declare Durable Object exports and bindings in `RateLimit`, `WebSocketBroker`, `WebSocketServer` order (`RL`, `WSB`, `WSS`). Environment overrides must inherit or redeclare every locally bound class; declare `[exports.RateLimit]` as `type = "durable-object"`, `storage = "sqlite"`, without `new_sqlite_classes` migration coupling.
- Declare `CF_DO_RATE_LIMIT_SECRET` under `# DO` in each API `.dev.vars.example` and provision it as a strong secret outside Wrangler config. Standalone Workers may use independent values.
- Keep local API development on one shared `.wrangler/state` directory. Vitest loads default and test D1 migrations into isolated per-file databases; do not configure `DATABASE_URL`, Hyperdrive, or `localConnectionString`.
- Select every remote D1 migration environment explicitly: pass `--env=staging` with the staging config and `--env=production` with the production config. An environment-specific config filename does not select its nested Wrangler environment.
- Schedule bounded retention in the backoffice Worker at `0 19 * * *` (audit), `5 * * * *` (sessions), `10 * * * *` (verifications), and `15 * * * *` (API keys). Preserve both APIs' five-minute realtime recovery schedules.
- Treat dependencies, schema changes, cleanup schedules, deployments, WAF changes, bindings, and secrets as separate approval-scoped operations. Obtain separate approval before remote D1 creation, staging/production migration, or live schedule changes.

## Application Mail

- Treat mail as an application-wide Worker capability with authentication as its first consumer. Default `FEATURE_MAIL` to `0` outside tests so Workers can deploy without provider variables, provider secrets, or Email Sending bindings. When disabled, only routes that initiate outbound mail return the standard feature-not-found response before protected context; password-reset and email-verification token redemption remain available. Keep test configuration enabled with simulated Cloudflare Email Sending bindings for regression coverage without a Resend secret.
- When enabled, select `MAILER_PROVIDER="resend"` or `MAILER_PROVIDER="cloudflare"` explicitly and independently for each API; never retry through or fall back to the unselected provider. Keep one matching `MAILER_ACCOUNT` sender. Require `RESEND_API_KEY` only for Resend and retain it while rollback support is required.
- Bind Cloudflare Email Sending as `PROJECT_NAMEPUB_EMAIL` and `PROJECT_NAMEBOFC_EMAIL`. Redeclare each `send_email` binding in every environment where Cloudflare mail is enabled because named environments do not inherit binding arrays. Restrict `allowed_sender_addresses`, do not restrict recipients, and omit `remote = true` locally so development simulates delivery.
- Arbitrary application recipients require Workers Paid Cloudflare Email Sending rather than Email Routing's verified-destination-only free mode. Before selecting Cloudflare, replace every illustrative `.example` sender, onboard the exact sending domain or subdomain, and verify Cloudflare-managed SPF, DKIM, DMARC, and bounce records.
- After explicit deployment approval, cut over staging first, verify application mail delivery to external recipients and inspect Email Sending logs, then repeat for production. Roll back by restoring the Resend provider and matching sender; keep live onboarding, secret changes, and deployments as separate approval-scoped operations.

## Wrangler and Routes

- When an API introduces `QUERY`, add it to `CORS_ALLOW_METHODS` and retain `Content-Type` in `CORS_ALLOW_HEADERS`. Update committed local Wrangler files; separately coordinate ignored staging/production equivalents before deployment.
- Keep each API's committed local and example `[build].watch_dir` synchronized with its Worker source dependencies: `src`, `packages/errors`, `packages/types`, `packages/validator`, `packages/database`, `packages/rate-limit`, and `packages/websocket`.
- Preserve each BFF's active `zone_name` subdirectory route and commented `custom_domain` alternative unless the task explicitly authorizes a route-style change.
- Trust `CF-Connecting-IP` and `CF-Connecting-IPv6` for authentication policy only on direct Cloudflare-edge traffic; prefer `CF-Connecting-IPv6` when Pseudo IPv4 overwrites `CF-Connecting-IP`.
- Prevent direct-origin bypass and account for same-zone Workers altering `CF-Connecting-IP`. After deployment approval, verify the trust boundary, retention logs, D1 verification load, limiter decisions, privacy-safe audit events, and separate WAF/edge controls for volumetric abuse.

## Circular Service-Binding Bootstrap

- A service binding requires its target Worker to exist; Wrangler and application flags cannot bypass this. Bootstrap the first mutually bound public/backoffice deployment as follows:

    1. Set the public API's `STATUS` to `"down"` and temporarily omit its peer service-binding tables from the ignored deployed Wrangler config.
    2. Deploy the public API so the target Worker and its named entrypoints exist.
    3. Deploy the backoffice API normally.
    4. Restore the public API's peer service bindings and set `STATUS` to `"up"`.
    5. Redeploy the public API and verify both Workers.

- Apply the sequence independently to staging and production under the Approval Boundary. Restore normal configuration immediately and require every configured peer capability during startup.

## Object Storage

- Sign S3-compatible R2 requests with `aws4fetch` in backend context, keep credentials in secrets/configuration, and never expose them to web apps. Add a direct R2 binding only for an explicit storage-architecture change.

## Scripts and CI/CD

- Preserve `deploy:{staging,prod}`, API `secret:{staging,prod}`, and database `migrate:{staging,prod}` names unless explicitly renamed. Deployment scripts use ignored machine configs; secret scripts use `wrangler secret bulk`.
- Do not invent a repository-wide CI convention:

    - Preserve existing `.github/` or `.gitlab-ci.yaml` behavior unless a change is requested.
    - Target the owning package and consumers required by `monorepo-troubleshooting`.
    - Gate deployments with environment approval; if unavailable, use a manual trigger and document approval.
    - Never store secrets directly in CI configuration.

## Safe Editing

- Limit ordinary deployment-operation edits to `wrangler.toml`, committed environment/configuration examples, credential-free `drizzle.config.ts`, package scripts, migration-script references, deployment docs, CI config, agent docs, and skills.
- Do not edit `.dev.vars`, `.env.staging`, `.env.production`, `wrangler-staging.toml`, `wrangler-production.toml`, `drizzle-staging.config.ts`, or `drizzle-production.config.ts` unless the task explicitly includes the file and the Approval Boundary is satisfied for live values.
