# Audit Trail Verification

Read this reference when adding audit coverage, reviewing completeness, or
verifying an audit implementation. Follow cloudflare-worker-testing for file
ownership, runner selection, isolation, fixtures, and command syntax.

## Static and Contract Checks

- Verify database JSON types are exported from the active persistence surface
  and the schema, migration, and generated snapshot agree.
- Verify actor constraints reject missing required IDs, mixed user/service
  identities, and invalid actor types.
- Verify every writer uses registered component, action, and entity values.
  Registry completeness checks must fail when a writer introduces an unknown
  value or a registered entity lacks a projector allowlist.
- Search for raw audit payloads, direct oldData/newData persistence, and writer
  calls containing records that do not cross the prepare boundary.
- Verify retained indexes correspond to actual tenant, date, component, action,
  actor, record, or cleanup queries.

## Writer Coverage

Cover representative create, update, transition, delete or revoke, multi-record,
and entity-free events. Assert exact safe snapshots, changed-field reduction,
date conversion, actor snapshots, descriptions, and the absence of secrets and
unrelated fields.

Cover user, service-principal, anonymous, system, pre-session, and normal
session attribution as applicable. Reject client-supplied ownership or actor
claims.

For internal mutations, inject audit failure and prove the business mutation
rolls back. For confirmed external effects, inject audit failure and prove the
effect is not misreported as rolled back or made automatically retryable.
Verify idempotent replay does not duplicate audits.

Verify the `Audit-Event-Recorded` marker appears after successful persistence
and is absent after failed, rolled-back, read-only, and unaudited requests.

## Reader and UI Coverage

- Cover validation, authentication, permission denial, management-credential
  policy, CORS, tenant isolation, cross-tenant not-found behavior, default
  dates, search, filters, stable pagination, ordering, summaries, and detail
  projection.
- Assert every configured exact and prefix group matcher and the complete
  `Record<TAuditGroup, number>` summary shape.
- Include events with null records in inclusion and exclusion filter tests.
- Assert compact lists and formatted details never expose stored context or
  unrestricted snapshots.
- Cover incomplete legacy actor and record data without fabricated values.
- Verify a successful marked response invalidates only the active tenant's
  audit query family; successful unmarked and failed marked responses do not.
- Verify list and summary queries refetch on workspace entry.
- Verify placeholder or stale list data is reused within one tenant but never
  rendered after switching tenants.
- Verify date-time controls use browser-local wall time and serialize the
  selected From minute at `:00.000` and To minute at `:59.999` to the
  correct ISO instants independently of the server time zone. Cover the
  server's runtime-local current-day fallback when dates are omitted.
- Cover loading, stale, empty, list error, summary error, retry, URL
  restoration, keyboard activation, and responsive behavior.

Run the affected database, validator, API, and web checks and lints, then only
the focused Vitest and Playwright files selected under
cloudflare-worker-testing. Documentation-only skill edits use skill validation
and static parity checks rather than unrelated application suites.
