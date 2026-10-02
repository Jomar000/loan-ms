# Activity Log Reader Contract

Read this reference when exposing audit records through an API, Activity Logs
workspace, filters, summaries, details, or frontend cache coordination.

## API Boundary

- Require session authentication and an explicit fork-owned read permission.
  Management credentials or other actor classes receive access only when
  fork policy deliberately grants it.
- Derive tenant scope from trusted server context and apply it to every list,
  summary, and detail query. A cross-tenant detail request returns not found.
- Use a safe retrieval method selected by hono-patterns. Validate filters,
  pagination, ordering, and dates through the owning surface's Zod schemas.
- Order by event timestamp plus the internal immutable ID as a stable
  tie-breaker. Apply fork-owned defaults on the server so direct callers and
  the UI behave consistently.
- Search only reviewed display fields. An IP address can participate in the
  unified search instead of requiring a separate input. Selection filters must
  define how null or recordless events behave; excluding one entity type must
  not accidentally exclude events with no records.
- Summary counts honor the currently applied search, date, and detail filters.
  If the UI has a selected summary group, ignore only that group when
  calculating the cards so the user can switch groups without losing context.
- Define every fork summary group through configurable exact-component and
  component-prefix matchers. Materialize summary results as a complete
  `Record<TAuditGroup, number>` so missing groups fail at compile time instead
  of becoming absent or undefined counts.

## Response Projection

Keep list responses compact: public ID, timestamp, component, action,
description, actor snapshot, affected-record summaries, source channel, and
request IP when allowed.

The detail response may add user agent and formatted affected-record values.
Convert snapshots into allowlisted field/label/value and before/after
structures. Never return oldData, newData, or another unrestricted raw JSON
escape hatch.
Stored record context is server-internal correlation metadata and is also
excluded. Expose context only through a separate fork-owned, allowlisted
display projection and matching validator contract; never return the stored
context object directly.

Handle legacy data explicitly:

- Preserve null actor fields and missing record metadata.
- Distinguish no affected entity from an affected entity whose snapshot was not
  recorded.
- Use fork-owned fallback copy and never infer historical values from the
  current entity row.

## Frontend Freshness

- Derive frontend response and filter types from the validator schemas.
- Prefix every audit query key with the active tenant and one shared audit
  family segment. Lists, summaries, details, filters, and future audit queries
  stay beneath that family.
- After a successful audit write, expose `Audit-Event-Recorded` through CORS.
  The shared HTTP client dispatches an invalidation signal only when the
  response succeeded and that header equals true.
- Handle the invalidation signal declaratively at the authenticated app/session
  boundary and invalidate the complete active-tenant audit family.
- Refetch list and summary queries whenever the Activity Logs workspace mounts,
  even inside their stale window. This recovers events created in another tab,
  another frontend, a scheduled job, or an external service.
- Reuse stale or placeholder list data only when its query key belongs to the
  active tenant. A tenant switch must never render the prior tenant's rows.
- Do not invalidate audit queries merely because any unsafe HTTP request
  succeeded. Do not require a WebSocket event for the audit freshness contract.

## Workspace Behavior

Use fork context and svelte-patterns for layout and visual treatment.
Regardless of presentation:

- Represent loading, stale-data refresh, empty, terminal list error, and summary
  error states distinctly. Failed summary counts must not look like legitimate
  zeros.
- Keep search, date range, detail filters, ordering, pagination, and an optional
  summary group synchronized with the URL when the workspace supports
  restorable state.
- Treat date-time controls as browser-local wall time. Normalize From to the
  selected minute at `:00.000` and To to the selected minute at `:59.999`,
  then serialize both as explicit ISO instants for the API. When dates are
  omitted, the server derives its fallback from the current runtime-local
  calendar day; do not hard-code a fork or server time zone.
- Make rows keyboard activatable and expose complete metadata and formatted
  changes through an accessible detail surface.
- Preserve the fork's primary columns on narrow screens and move secondary
  metadata into the detail surface.
