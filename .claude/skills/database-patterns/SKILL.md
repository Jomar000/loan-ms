---
name: database-patterns
description: Project rules for Drizzle/D1 schemas, queries, migrations, tenancy, database-client lifecycle, cleanup, and idempotency. Use when changing persistence, database setup, or Worker database clients.
---

# Database Patterns

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

- Load `auth-implementation` for auth persistence, `validator-patterns` for API schemas, `hono-patterns` for routes/context, `audit-trail-patterns` for durable audit persistence and retention, `cloudflare-worker-testing` for Worker tests, and `deployment-operations` for staging or production migrations.

## Boundary, Schema, and Migrations

- Define database structure only in `packages/database/src/d1/schema.ts`; generate the matching SQLite migration. Commit only with explicit Git approval; never hand-edit an applied migration.
- Keep flat D1 migration filenames on the original 14-digit zero-based sequential prefix convention (`00000000000000`, `00000000000001`, and onward); do not replace these prefixes with wall-clock timestamps.
- Rewrite an unreleased default-migration baseline only when an authoritative plan permits it. Update the default migration, downstream snapshots, and affected seed migrations together; require a clean rebuild without a baseline backfill.
- Existing databases require a separately reviewed upgrade migration before schema-dependent deployment; a default-baseline edit is not an in-place upgrade.
- Keep realtime revocation delivery recovery surface-scoped. Persist a non-null next-attempt timestamp, retry failures after 5, 10, 20, 40, then capped 60-minute delays until retention expiry, and select only due pending rows. Cleanup deletes only the invoking surface's expired delivery rows and removes an operation only after its final surface delivery is gone.
- Keep the committed `packages/database/drizzle.config.ts` credential-free and use the public API Wrangler configuration as the sole migration owner. Staging and production migrations use reviewed D1 database names and IDs; they never use database credentials or `.env` files.
- Treat a source-derived, frozen compatibility manifest as the independent authority for PostgreSQL-to-D1 inventory verification. A migration, README ledger, and test authored from the same list may agree while omitting the same source object; do not claim completeness from that circular comparison.
- Store Better Auth sessions and verification records in D1; use KV only as a non-authoritative cache when atomicity is not required.
- Index expired authentication cleanup by `(expiresAt, id)` and run bounded cleanup from the backoffice scheduled handler.
- Use one Worker cutoff, deterministic ordering, bounded delete batches, `RETURNING` counts, early termination, and cap reporting; invoke session, verification, and API-key cleanup separately and never archive deleted authentication material.
- Keep Better Auth account identity keyed by `(providerId, accountId)` and enforce that pair's uniqueness. Do not add the `account.issuer` field. For credential accounts, set `accountId = userId`, `providerId = 'credential'`, and `userId` in SQL seeds and TypeScript queries.
- Cascade `account.userId` and `session.userId`. Require Better Auth to persist calculated `session.expiresAt`; do not add `defaultNow()`.
- Keep `verification.identifier` non-unique and normally indexed. Single-use flows must call Better Auth's atomic consume operation and gate their state change on its non-null result; never recreate a find-then-delete verification flow.
- Do not add a general Better Auth `rateLimit` table.
- Keep the reserved phone-number fields optional, with `phoneNumber` unique and sortable and `phoneNumberVerified` without a database default. Keep reserved two-factor fields synchronized with Better Auth: optional default-false `user.twoFactorEnabled`; required indexed `secret`; required `backupCodes`; required indexed `userId`; optional default-true `verified`; optional default-zero `failedVerificationCount`; optional `lockedUntil`; and no obsolete lifecycle fields. Schema presence never enables either plugin.
- Allow direct database calls only in backend apps and migration/test tooling; frontends use typed API clients. Worker-imported code must not use `fs` or direct `process.env`. Follow `monorepo-troubleshooting` for other runtime boundaries.
- Use Wrangler D1 migration commands for local, staging, and production databases and follow `deployment-operations` approval rules.

## Backend Query Access

- In Hono handlers, use `ctx.get('dbClient')` for typed queries and D1 batches and `ctx.get('dbSchema')` for tables.
- Use `db.query.*` only when relations already exist and nested relational data is required; never add relations solely to use that API.
- Otherwise use the typed select builder. Reserve raw `sql` for schema defaults, checks, atomic expressions, or operations the builder cannot express.
- Type SQL expressions at the producing boundary to match verified driver values and nullability; do not add row mappings only to repair missing type information. `sql<T>` and type assertions do not decode runtime values; retain required decoding/normalization and the contracted response projection.
- Keep persistence behind backend APIs; never leak it into frontends or shared UI packages.

## Worker Client Lifecycle

- Create a Drizzle client from the invocation's `D1Database` binding and never cache it across invocations.
- D1 bindings have no client teardown. Never call `$client.end()` or introduce connection ownership flags in HTTP, scheduled, Durable Object, service-binding, test, or `waitUntil` code.

## Local and Test Bootstrap

- Both local APIs use the same `--persist-to=../../.wrangler/state` path and D1 database name.
- Configure each API Vitest command as follows:

    1. Read the flat default and test migration directories with `readD1Migrations()` in `vitest.config.ts`.
    2. Bind the two migration arrays to the isolated Worker project.
    3. Apply default and test histories in per-file setup with `applyD1Migrations()` and distinct history-table names.
    4. Rely on the Cloudflare pool's per-file D1 isolation; do not add PostgreSQL global setup, direct-client teardown, or stale-database cleanup.

## Ownership and Tenancy

- Classify every new persisted model and default to organization-owned unless another definition applies.

| Ownership          | Definition                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Global             | Better Auth core and ownerless system-wide data, including `user`, `account`, `session`, `verification`, `two_factor`, `role`, and `permission`. |
| Identity-owned     | Owned through a non-user domain identity parent; inherit its complete ownership key and tenant scope.                                            |
| User-owned         | Application data directly owned by `user_id` and shared across all the user's organizations.                                                     |
| Organization-owned | Every application model not matching another definition; add `organization_id`.                                                                  |

- Treat `key_counter`, `key_value`, `upload`, `upload_attachment`, `object_storage`, and `object_storage_acl` as organization-owned examples.
- Scope organization-owned reads, writes, uniqueness, idempotency, and indexes by `organization_id`; use tenant-scoped uniqueness such as `(organization_id, slug)`.
- When parent/child tables have compatible tenant keys, enforce same-tenant composite foreign keys. Otherwise add explicit tenant predicates to every related read/write and document the schema reason beside it.
- Add tenant-aware indexes only for implemented queries whose filters/order use the leading columns.

### Tenant-Scoped User Actors

- Pair user actor fields such as `created_by`, `updated_by`, `approved_by`, and `deleted_by` with `organization_id` and composite foreign keys to `member(organization_id, user_id)`.
- Records that must outlive membership deletion, including audit history, upload attribution, invitations, and realtime revocation operations, may retain `organization_id` plus a global user foreign key. Document the lifecycle beside the schema, predicate every read/write by tenant and user, and never treat persisted attribution as active membership.
- Do not apply this rule to display text such as `posted_by`, `filed_by`, or `requested_by` unless intentionally modeled as actors.
- Add a matching composite index only for an implemented leading-column query or foreign-key maintenance on parent update/delete.

## Constraints and Indexes

- Explicitly name every SQLite index and complex constraint so generated migrations and the compatibility ledger remain stable.
- Never separately index a primary key or duplicate coverage from a primary key, unique constraint, or index.
- Check left-prefix coverage; `(organization_id, user_id)` already covers `organization_id` filters.
- Add indexes from implemented access patterns, never hypothetical ones.

## Create Idempotency

- For every client-retryable create covered by `hono-patterns`:
    - Add nullable `idempotency_key uuid` to the primary table and require a client UUIDv7 through `validator-patterns`.
    - For global primary records enforce `(idempotency_key)`; for identity-owned records use the complete identity ownership key plus `idempotency_key`, including `organization_id` when the parent is tenant-specific; for user-owned use `(user_id, idempotency_key)`; and for organization-owned use `(organization_id, idempotency_key)`.
    - Scope replay lookup to the same server-derived ownership columns used by that uniqueness constraint.
    - Ensure only the first request can create primary/related rows, counters, audits, messages, or external side effects.
    - When one retryable request creates a batch of existing/related records rather than one new primary record, use a dedicated ownership-scoped request ledger with a non-null idempotency key, request fingerprint, and stored response. Lock and replay through the ledger so the batch is all-or-nothing and a reused key with different input is rejected. Do not force the key onto each related row when the ledger is the operation's primary idempotency record.
    - Exempt only status transitions protected by atomic conditional writes.

## Authentication API-Key Persistence

- Keep service principals organization-owned and bind each Better Auth API-key credential through a same-organization composite foreign key. Keep `service_principal_id` nullable only for the short Better Auth create/link window; credentials have no user, account, member, session, or ACL ownership.
- Keep Better Auth API-key rows organization-owned with a cascading organization foreign key, unique hashed-key lookup, indexed organization/configuration/list order, and `(expires_at, id)` cleanup index.
- Keep plugin compatibility columns in the schema even when quota, refill, limiter, metadata, or session behavior is disabled. Never add plaintext-key persistence or a per-key permission join table.
- Model API-key assignability as one canonical component/action attribute. Fail ACL initialization when duplicate role-grant rows disagree about that attribute.
- Extend backoffice authentication cleanup with a bounded API-key branch using one cutoff, deterministic `expires_at NULLS LAST, id` order, capped deletes, and permanent deletion without an archive. Delete unlinked credentials after 15 minutes and retain the partial orphan `(created_at, id)` index.
- Enforce at most two active, unexpired credentials with one conditional link statement whose subquery counts active credentials. Batch its audit write and remove the unlinked Better Auth row when linking fails.
- Treat credential issuance as the one-time-secret exception to ordinary create replay. Require a UUIDv7 idempotency key and keep an organization/principal-scoped ledger with a request fingerprint, terminal operation state, and safe credential metadata; never persist the raw key. Commit the pending claim before Better Auth issuance so only the winning request may create a key, then link the credential, write its audit, and complete the ledger in one conditional D1 batch. Return completed duplicates from ledger metadata without a key or another audit, reject changed input, and keep pending and failed claims terminal. Retain the ledger until its principal is deleted, including after credential revocation.
