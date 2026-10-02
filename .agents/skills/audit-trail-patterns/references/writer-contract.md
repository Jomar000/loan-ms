# Audit Writer Contract

Read this reference when changing audit persistence, actor attribution,
snapshot projection, retention, or any mutation that writes an audit event.

## Persistence Types

Keep the JSON-safe types database-owned and available from the active database
surface:

    type TAuditJsonValue =
        | null
        | boolean
        | number
        | string
        | TAuditJsonValue[]
        | { [key: string]: TAuditJsonValue }

    type TAuditSnapshot = Record<string, TAuditJsonValue>

    type TAuditRecord = {
        entityType: string
        table: string
        id: string
        label?: string
        code?: string
        context?: TAuditSnapshot
        oldData?: TAuditSnapshot
        newData?: TAuditSnapshot
    }

The audit event stores immutable actor display data, its registered component
and action, a past-tense description, optional projected records, request IP
and user agent when available, and the event timestamp.

Use profile-appropriate JSON storage, constraints, indexes, migrations, and
cleanup. Add indexes only for implemented reader access patterns. Use JSON
containment indexes only when supported by the active database profile.

## Taxonomy and Actors

- Keep component, action, actor-type, and entity-type values in closed,
  Zod-backed registries. Concrete values are fork-owned. Add a value before
  a writer uses it and preserve persisted names once released.
- Define required and prohibited identifiers for every registered actor type.
  An authenticated-person actor retains its user ID; a service-credential actor
  retains its principal and credential IDs; pre-session and server-owned actors
  retain no inapplicable human or credential IDs.
- Snapshot actor display name, optional identifier, and applicable role at
  event time. Historical attribution must not change when a user, membership,
  or service principal is renamed, disabled, or removed.
- Require the fork's ownership scope for every scoped event. Permit a global
  event only when fork policy and schema explicitly support it.
- Allow attribution overrides only for trusted server flows that cannot use the
  normal session context. Resolve every override server-side.

## Projection and Redaction

Writers may assemble a domain input containing unknown row values, but they
must call auditTrailLogger.prepare before invoking auditTrailLogger. The logger
accepts only projected TAuditRecord arrays and must not perform late redaction
after raw input has crossed its boundary.

Maintain an explicit allowlist for every registered entity type. New database
or request fields remain excluded until reviewed. Convert supported values to
JSON-safe data; encode dates consistently and omit unsupported values.

Define record context in `snapshotPolicy.extension.ts` through the extension input
type and per-entity `contextPolicies`. The template's empty policy and `never`
input type leave context disabled. Context passes through the prepare boundary
alongside snapshots; it must follow the same redaction rules.

- Without an entity context policy, omit context.
- `required` rejects absent context; otherwise absent context is omitted.
- When context is supplied, include only the policy's `fields`. Every listed
  field must be present and project to a defined JSON-safe value.
- Use a field's `fieldProjectors` entry when configured, otherwise the generic
  JSON conversion. Custom projectors must return JSON-safe values.
- Run `validateRecord({ context, id })` after projection for fork-specific
  consistency checks. Projection or validation failures reject preparation.

Context is preserved independently of the before/after changed-field reduction.

Projected context is server-internal correlation metadata. Generic Activity Log
list and detail responses must not expose it. A fork that needs context in
operator-facing details must define a separate allowlisted display projection
and validator contract; never return the stored context object directly.

Apply these snapshot semantics:

- Create: newData contains the safe display snapshot.
- Update: oldData and newData contain only allowlisted fields whose values
  changed.
- State transition: record the prior and resulting state.
- Delete or revoke: oldData contains the safe prior snapshot.
- Multi-entity operation: attach every materially affected record and its
  relevant before/after values.
- Entity-free event: omit records rather than inventing a target.

Always exclude credentials and authentication material, including passwords,
hashes, tokens, cookies, API keys, reset and verification secrets, session
data, signing material, and unrelated personal fields. One-time secrets must
not appear in snapshots, labels, codes, descriptions, operational errors, or
tests.

## Consistency and Failure Semantics

- Pass the active transaction client when business data is stored internally.
  Audit failure rejects the transaction; a replayed idempotent request must not
  create another audit event.
- Audit authentication, email, object-storage, or another irreversible
  external effect only after its success is confirmed. Use the request client
  without the business transaction and report audit failure operationally.
- Do not report or retry an already completed external effect as though the
  audit write had reversed it.
- Emit the `Audit-Event-Recorded` response marker only after persistence
  succeeds. A failed best-effort write, rolled-back request, read request, or
  unaudited command must not emit it.
- Event coverage for failed, denied, suppressed, or no-op attempts is fork
  policy. Do not add those records implicitly.

Treat audit rows as append-only. Retention cleanup may delete expired rows
according to fork policy; normal application flows must not update or
delete historical events.
