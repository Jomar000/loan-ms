# `@loanms/database`

`@loanms/database` is LoanMS's shared Drizzle and Cloudflare D1 persistence
package. It owns the canonical SQLite schema, the D1 binding client factory,
flat default and test migration histories, and the compatibility record for
the repository's PostgreSQL-to-D1 conversion.

Worker code imports the runtime-safe `@loanms/database/d1` subpath and creates
one Drizzle client from the current invocation's `D1Database` binding. The
public API Wrangler configuration is the sole migration owner; public and
backoffice APIs bind the same database in each environment.

## Core capabilities

- A runtime-safe Drizzle client factory for Cloudflare D1 bindings.
- One canonical 29-table SQLite schema shared by both API surfaces.
- Explicitly named business constraints, partial indexes, and composite tenant
  relationships.
- Epoch-millisecond integer timestamps exposed as `Date` values by Drizzle.
- Flat Wrangler-compatible schema, trigger, default-seed, and test-seed
  migrations.
- Better Auth, service-principal, notification, object-storage, audit, and
  realtime persistence contracts.
- D1-compatible conditional writes, request ledgers, and bounded batch
  foundations used by API-owned atomic operations.
- A documented source-to-D1 compatibility ledger for schema review and migration
  verification.

## Architectural principles

### Binding-owned clients

`dbClient(binding)` creates a Drizzle client directly from the current
invocation's D1 binding. Clients are not cached across Worker invocations and
have no connection teardown lifecycle.

### Schema ownership

`src/d1/schema.ts` is the sole schema definition. Backend applications and
migration/test tooling may import the database package; frontends access
persistence only through typed API clients.

Organization-owned records scope reads, writes, uniqueness, idempotency, and
related foreign keys by `organization_id`. Global and user-owned Better Auth
records retain their declared ownership boundaries.

### Application atomicity

D1 does not provide PostgreSQL-style interactive transactions. Application-owned
workflows use atomic conditional statements, predeclared D1 batches, optimistic
predicates, uniqueness constraints, and ownership-scoped idempotency ledgers.
Coupled application-owned effects should keep every statement in one bounded
batch.

Better Auth uses the Drizzle SQLite adapter with `transaction: false`, so generic
adapter operations have no implicit cross-statement rollback. LoanMS's
self-service password change and reset routes therefore own bounded D1 batches
that couple credential, reset-token/session, and audit mutations. Fault-injection
tests require the whole batch to roll back and preserve the prior credential,
token, and sessions on infrastructure failure.

### Migration ownership

The public API Wrangler configuration exclusively owns shared D1 migrations.
Both local APIs use the same `.wrangler/state` persistence directory and
database identity, so a migration is applied once and observed by both
surfaces. Staging and production migrations require reviewed Wrangler
configuration and explicit human approval.

Wrangler selects D1 bindings from the active environment, not from the deployed
configuration filename. Every remote staging or production migration command
must therefore pass `--env=staging` or `--env=production` respectively, even
when it uses `wrangler-staging.toml` or `wrangler-production.toml`.

## Package organization

| Path                                      | Responsibility                                                    |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `src/d1/client.ts`                        | Construct a Drizzle client from a `D1Database` binding            |
| `src/d1/schema.ts`                        | Define tables, constraints, indexes, checks, and timestamp modes  |
| `src/d1/index.ts`                         | Export `dbClient` and the `dbSchema` namespace                    |
| `src/d1/migrations/default/`              | Fresh schema, runtime triggers, and dependency-ordered defaults   |
| `src/d1/migrations/test/`                 | Test-only seed history                                            |
| `drizzle.config.ts`                       | Credential-free SQLite schema and migration-generation ownership  |
| `../../apps/api-public/wrangler.toml`     | Local/test D1 migration ownership                                 |
| `../../apps/api-backoffice/wrangler.toml` | Shared binding and backoffice scheduled-maintenance configuration |

## D1 compatibility ledger

This ledger records the fresh `fullstack_d1` conversion from the
`fullstack_postgres` PostgreSQL schema at `18747a60`. It describes the current
repository only; PostgreSQL data export/import is not included.

### Storage conversions

| PostgreSQL representation        | D1/SQLite representation                            | Application contract                          |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| identity `bigint`                | `INTEGER PRIMARY KEY AUTOINCREMENT`                 | Numeric IDs remain internal                   |
| `uuid`                           | `TEXT`                                              | UUIDv7 is generated by application code       |
| `jsonb`                          | JSON-mode `TEXT`                                    | Drizzle exposes the declared TypeScript shape |
| `timestamptz`                    | epoch-millisecond `INTEGER`                         | Drizzle exposes `Date`                        |
| native enum                      | typed `TEXT` plus `CHECK`                           | Existing enum string unions are retained      |
| bounded `varchar`                | `TEXT` plus length `CHECK` where required           | Existing validators remain authoritative      |
| PostgreSQL regex checks          | SQLite `GLOB`, equality, and length checks          | Current accepted values are retained          |
| deferred foreign keys            | immediate foreign keys and dependency-ordered seeds | Business relationships are retained           |
| automatic `updated_at` functions | explicit SQLite triggers                            | Existing timestamp behavior is retained       |

### Table inventory

All 29 source-derived tables and the organization-scoped formula-profile
snapshot table are present in the consolidated baseline migration. Business
foreign keys, unique constraints, checks, and partial indexes are retained
using SQLite equivalents.

| Domain         | Tables                                                                                                       | D1 notes                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Audit and keys | `audit_trail`, `key_counter`, `key_value`                                                                    | JSON records use JSON text; tenant attribution and actor snapshots are required                                    |
| Notifications  | `notification_event`, `notification_delivery`                                                                | Event idempotency, delivery uniqueness, unread checks, and indexes are retained                                    |
| Object storage | `object_storage`, `object_storage_acl`, `upload`, `upload_attachment`, `upload_attachment_batch_request`     | Composite tenant FKs, hash uniqueness, ACL cascade, and request ledger are retained                                |
| User domain    | `user_attribute`, `user_profile`, `user_address`, `user_relationship`                                        | UUID public IDs are application-generated; address and relationship checks are retained                            |
| Better Auth    | `account`, `invitation`, `member`, `organization`, `apikey`, `session`, `two_factor`, `user`, `verification` | Adapter provider is `sqlite`; sessions, verification, organizations, API keys, and reserved 2FA schema remain      |
| Realtime       | `websocket_revocation_operation`, `websocket_revocation_delivery`                                            | Idempotent operations, composite delivery FK, recovery index, and retention fields are retained                    |
| Authorization  | `service_principal`, `service_principal_credential_issuance`, `permission`, `role`                           | JSON permissions use JSON text; credential limits and one-time-secret replay are enforced by conditional D1 writes |
| Loan formulas  | `loan_formula_profile`                                                                                       | Immutable organization-scoped calculation snapshots use integer minor units and basis points                       |

### Constraint and index inventory

The baseline retains all column-level primary-key, `NOT NULL`, and simple
`UNIQUE` declarations from the source schema. The currently documented
explicitly named business-constraint inventory is:

- Foreign keys: `fk_account_user_id_user_id_fk`,
  `fk_apikey_reference_id_organization_id_fk`,
  `fk_apikey_reference_id_service_principal_id_service_principal_organization_id_id_fk`,
  `fk_audit_trail_organization_id_organization_id_fk`,
  `fk_audit_trail_user_id_user_id_fk`,
  `fk_invitation_inviter_id_user_id_fk`,
  `fk_invitation_organization_id_organization_id_fk`,
  `fk_key_counter_organization_id_organization_id_fk`,
  `fk_key_value_organization_id_organization_id_fk`,
  `loan_formula_profile_fk_organization`,
  `fk_member_organization_id_organization_id_fk`,
  `fk_member_user_id_user_id_fk`,
  `fk_notification_event_organization_id_organization_id_fk`,
  `fk_object_storage_organization_id_organization_id_fk`,
  `fk_permission_role_id_role_id_fk`,
  `fk_service_principal_organization_id_organization_id_fk`,
  `service_principal_credential_issuance_fk_principal`,
  `fk_session_active_organization_id_organization_id_fk`,
  `fk_session_user_id_user_id_fk`, `fk_two_factor_user_id_user_id_fk`,
  `fk_upload_attachment_organization_id_organization_id_fk`,
  `fk_upload_organization_id_organization_id_fk`,
  `fk_upload_user_id_user_id_fk`,
  `fk_user_address_user_id_user_id_fk`,
  `fk_user_attribute_user_id_user_id_fk`,
  `fk_user_profile_user_id_user_id_fk`, and
  `fk_user_relationship_user_id_user_id_fk`.
- Domain composite keys and foreign keys: `notification_delivery_pk_e7r2mv`,
  `notification_delivery_fk_event_h5n9qs`,
  `notification_delivery_fk_member_b8v4cx`,
  `object_storage_acl_fk_osorg1`, `object_storage_acl_fk_member`,
  `upload_attachment_fk_uporg1`, `upload_attachment_fk_osorg1`,
  `upload_attachment_batch_request_fk_upload_u5n8ra`,
  `upload_attachment_batch_request_fk_actor_m9q2dk`,
  `websocket_revocation_delivery_pk`,
  `websocket_revocation_delivery_fk_operation`,
  `websocket_revocation_operation_fk_organization`, and
  `websocket_revocation_operation_fk_user`.
- Composite unique constraints: `account_provider_id_account_id_unique`,
  `key_counter_organization_id_key_unique`,
  `key_counter_organization_id_public_id_unique`,
  `key_value_organization_id_key_unique`,
  `key_value_organization_id_public_id_unique`,
  `loan_formula_profile_organization_id_name_version_unique`,
  `loan_formula_profile_organization_id_public_id_unique`,
  `member_organization_id_user_id_unique`,
  `notification_event_unique_orgid1`,
  `notification_event_organization_id_public_id_unique`,
  `notification_event_organization_id_event_key_unique`,
  `object_storage_unique_orgid1`,
  `object_storage_organization_id_hash_sha256_is_public_unique`,
  `object_storage_acl_organization_id_object_storage_id_user_id_unique`,
  `permission_component_action_role_id_unique`,
  `service_principal_organization_id_public_id_unique`,
  `service_principal_organization_id_id_unique`,
  `service_principal_organization_id_idempotency_key_unique`,
  `service_principal_credential_issuance_unique_request`,
  `upload_unique_orgid1`, `upload_organization_id_idempotency_key_unique`,
  `upload_attachment_organization_id_upload_id_object_storage_id_unique`,
  `upload_attachment_batch_request_unique_k7m2qx`,
  `user_address_user_id_idempotency_key_unique`, and
  `websocket_revocation_operation_unique_org_id`.
- Checks: `apikey_config_id_check`, `audit_trail_actor_type_check`,
  `loan_formula_profile_check_name`, `loan_formula_profile_check_version`,
  `loan_formula_profile_check_interest_method`,
  `loan_formula_profile_check_interest`,
  `loan_formula_profile_check_term_days`,
  `loan_formula_profile_check_payment_frequency`,
  `loan_formula_profile_check_installment_count`,
  `loan_formula_profile_check_timezone`,
  `loan_formula_profile_check_rounding_mode`,
  `loan_formula_profile_check_final_installment_residue_policy`,
  `loan_formula_profile_check_renewal_settlement_method`,
  `loan_formula_profile_check_partial_credit_policy`,
  `loan_formula_profile_check_min_completed_installments`,
  `loan_formula_profile_check_default_active`,
  `loan_formula_profile_check_retired_at`,
  `notification_delivery_check_read_j3f7pd`,
  `notification_event_check_action_d4p7kx`, `organization_slug_check`,
  `role_name_check`, `service_principal_audience_check`,
  `service_principal_name_check`, `user_email_check`,
  `service_principal_credential_issuance_check_state`,
  `service_principal_credential_issuance_check_metadata`,
  `user_username_check`, `user_address_type_check`,
  `user_address_check_country`, `user_address_check_psgc`,
  `user_profile_gender_check`,
  `websocket_revocation_delivery_check_attempt`,
  `websocket_revocation_delivery_check_surface`,
  `websocket_revocation_delivery_check_delivery`,
  `websocket_revocation_delivery_check_error_length`,
  `websocket_revocation_operation_check_versions`,
  `websocket_revocation_operation_check_reason_length`, and
  `websocket_revocation_operation_check_fingerprint_length`.

The documented explicit index inventory is `account_idx_1`, `apikey_idx_1`,
`apikey_idx_2`, `apikey_idx_3`, `apikey_idx_4`, `audit_trail_unique_1`,
`audit_trail_idx_1`, `audit_trail_idx_2`, `audit_trail_idx_3`,
`audit_trail_idx_4`, `audit_trail_idx_5`, `audit_trail_idx_6`,
`audit_trail_idx_7`, `invitation_idx_1`,
`invitation_idx_2`, `invitation_idx_3`,
`loan_formula_profile_unique_active_default`,
`loan_formula_profile_organization_id_idempotency_key_unique`, `member_idx_1`,
`notification_delivery_idx_list_q4m8tz`,
`notification_delivery_idx_unread_k6p3wx`, `object_storage_acl_idx_1`,
`permission_idx_1`, `service_principal_idx_1`, `session_idx_1`,
`session_idx_2`, `session_idx_3`, `two_factor_idx_1`, `two_factor_idx_2`,
`upload_idx_1`, `upload_attachment_idx_1`,
`upload_attachment_batch_request_idx_actor_p4c8vw`,
`upload_attachment_batch_request_idx_1`, `user_address_unique_primary1`,
`user_address_idx_1`, `verification_idx_1`, `verification_idx_2`,
`websocket_revocation_delivery_idx_recovery`,
`websocket_revocation_operation_idx_identity`, and
`websocket_revocation_operation_idx_retention`.

Drizzle's SQLite dialect generated shorter names for 31 source indexes. Their
documented source-to-D1 mapping is mechanical:

| PostgreSQL source index                                           | D1 index                                |
| ----------------------------------------------------------------- | --------------------------------------- |
| `account_user_id_index`                                           | `account_idx_1`                         |
| `apikey_reference_id_config_id_created_at_id_index`               | `apikey_idx_1`                          |
| `apikey_service_principal_id_enabled_expires_at_id_index`         | `apikey_idx_2`                          |
| `apikey_created_at_id_index`                                      | `apikey_idx_3`                          |
| `apikey_expires_at_id_index`                                      | `apikey_idx_4`                          |
| `audit_trail_organization_id_public_id_index`                     | `audit_trail_unique_1`                  |
| `audit_trail_organization_id_logged_at_id_index`                  | `audit_trail_idx_1`                     |
| `audit_trail_organization_id_service_principal_public_id_index`   | `audit_trail_idx_2`                     |
| `audit_trail_user_id_index`                                       | `audit_trail_idx_3`                     |
| `audit_trail_logged_at_index`                                     | `audit_trail_idx_4`                     |
| `audit_trail_organization_id_component_logged_at_index`           | `audit_trail_idx_5`                     |
| `audit_trail_organization_id_action_logged_at_index`              | `audit_trail_idx_6`                     |
| `audit_trail_organization_id_actor_type_logged_at_index`          | `audit_trail_idx_7`                     |
| `invitation_email_index`                                          | `invitation_idx_1`                      |
| `invitation_inviter_id_index`                                     | `invitation_idx_2`                      |
| `invitation_organization_id_index`                                | `invitation_idx_3`                      |
| `member_user_id_index`                                            | `member_idx_1`                          |
| `object_storage_acl_organization_id_user_id_index`                | `object_storage_acl_idx_1`              |
| `permission_role_id_index`                                        | `permission_idx_1`                      |
| `service_principal_organization_id_audience_created_at_id_index`  | `service_principal_idx_1`               |
| `session_expires_at_id_index`                                     | `session_idx_1`                         |
| `session_user_id_index`                                           | `session_idx_2`                         |
| `session_active_organization_id_index`                            | `session_idx_3`                         |
| `two_factor_secret_index`                                         | `two_factor_idx_1`                      |
| `two_factor_user_id_index`                                        | `two_factor_idx_2`                      |
| `upload_user_id_index`                                            | `upload_idx_1`                          |
| `upload_attachment_organization_id_object_storage_id_index`       | `upload_attachment_idx_1`               |
| `upload_attachment_batch_request_organization_id_upload_id_index` | `upload_attachment_batch_request_idx_1` |
| `user_address_user_id_type_index`                                 | `user_address_idx_1`                    |
| `verification_expires_at_id_index`                                | `verification_idx_1`                    |
| `verification_identifier_index`                                   | `verification_idx_2`                    |

The remaining seven explicit indexes retained their source names:
`notification_delivery_idx_list_q4m8tz`,
`notification_delivery_idx_unread_k6p3wx`,
`upload_attachment_batch_request_idx_actor_p4c8vw`,
`user_address_unique_primary1`, `websocket_revocation_delivery_idx_recovery`,
`websocket_revocation_operation_idx_identity`, and
`websocket_revocation_operation_idx_retention`.

`apps/api-public/test/fixtures/d1CompatibilityManifest.ts` is the frozen
independent inventory derived from `fullstack_postgres` commit `18747a60`.
`apps/api-public/test/integration/d1Migrations.seq.test.ts` consumes that
manifest, enforces it against `sqlite_schema`, checks all 29 tables and 21
runtime triggers, and requires `PRAGMA foreign_key_check` to remain empty.

## Runtime infrastructure

- `00000000000000_default_schema.sql` contains the dependency-ordered schema,
  constraints, indexes, and default seeds. It includes the former additive
  migrations, including the formula-profile removal marker that preserves
  historical references. Epoch-millisecond defaults are explicitly cast to
  `INTEGER` so optimistic timestamp predicates remain exact.
- `00000000000001_runtime_triggers.sql` installs explicit `updated_at`
  triggers.
- Organization formula initialization remains application-owned; the baseline
  does not seed formula profiles.
- `99999999999999_test_data.sql` is a separate test-only migration history.
- The public API Wrangler configuration is the single migration owner. Public
  and backoffice D1 bindings point to the same database per environment.
- Backoffice scheduled handlers own audit, session, verification, and API-key
  retention. Both APIs retain their five-minute realtime recovery schedules.

## Removed PostgreSQL implementation objects

- PostgreSQL schemas, native enum objects, sequences, and sequence
  synchronization
- deferrable-FK setup
- PL/pgSQL functions and trigger functions
- `pg_cron` jobs and PostgreSQL job history
- Supabase `api.keepalive_version`
- the dormant archive-schema trigger extension
- Hyperdrive connection configuration and `postgres-js` clients

No business constraint or index is intentionally discarded solely because D1
cannot represent it; the frozen source-derived manifest independently verifies
the documented mapping.

## Capabilities not provided by D1

- arbitrary interactive transactions and cross-query rollback
- advisory locks, row locks, and `SKIP LOCKED`
- Hyperdrive pooling and PostgreSQL protocol access
- PL/pgSQL procedures and database-owned cron
- native enum, UUID, JSONB, timestamptz, sequence, regex, and SQLSTATE behavior
- server-generated UUID defaults for direct SQL callers
- the dormant archive-schema extension point
- PostgreSQL concurrent-write throughput and database-size headroom

Conditional statements, D1 batches, optimistic version predicates, uniqueness
constraints, and request ledgers are the mechanisms used to preserve
application-owned invariants; they do not recreate those general PostgreSQL
capabilities or add rollback to Better Auth's multi-write flows.

## Package boundaries

| Owner                 | Responsibility                                                                         |
| --------------------- | -------------------------------------------------------------------------------------- |
| Database package      | D1 client factory, canonical schema, migrations, and compatibility inventory           |
| Public API            | Sole shared-migration owner and public-surface persistence integration                 |
| Backoffice API        | Backoffice persistence integration and scheduled retention ownership                   |
| Both API applications | Request-scoped clients, business atomicity, authorization, audit coupling, and retries |
| Web applications      | Typed API consumption; no direct database access                                       |

The package does not own HTTP validation, authorization decisions, business
workflows, Durable Object storage, frontend state, or environment-specific
secrets.

## Public subpaths

| Subpath               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `@loanms/database/d1` | D1 client factory and canonical `dbSchema` namespace |

The package intentionally has no root runtime export. Worker-facing consumers
use the explicit `/d1` boundary.

## Verification

Run package commands from the repository root:

```bash
pnpm --filter=@loanms/database check
pnpm --filter=@loanms/database lint
pnpm --filter=@loanms/database build
```

Apply and inspect the shared local migration history through the public API
configuration:

```bash
pnpm --filter=@loanms/database migrate:dev
```

To prove both API configurations resolve that same local database, run the
isolated smoke check. It creates a temporary Wrangler persistence directory,
migrates it once through the public API configuration, reads one seeded
organization through each API configuration, compares the rows, and removes
the temporary directory:

```bash
pnpm test:d1-shared-persistence
```

The focused migration integration suite asserts all 29 documented tables, the
explicit constraints and indexes in this ledger, all 21 runtime triggers,
integer timestamp storage, and an empty `PRAGMA foreign_key_check` result:

```bash
pnpm --filter=@loanms/api-public test:seq test/integration/d1Migrations.seq.test.ts
```

## Scope

- This is a fresh D1 profile; PostgreSQL data export/import is not provided.
- The flat default migration history is the baseline for newly created
  databases, not an in-place upgrade path for an existing database.
- Existing databases require a separately reviewed upgrade migration before
  schema-dependent deployment.
- Remote D1 creation, staging/production migrations, and deployment remain
  explicit operator-owned actions.
