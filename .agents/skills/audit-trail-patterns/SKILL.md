---
name: audit-trail-patterns
description: Project rules for durable audit trails, audit logging, and Activity Logs, including actor identity snapshots, JSON-safe audit records, redaction, transaction boundaries, tenant-scoped readers, cache freshness, and verification. Use when adding, changing, reviewing, or debugging audit schemas, writers, records, readers, or Activity Logs. Do not use for runtime diagnostics, request logs, metrics, analytics, or WebSocket operational logging.
---

# Audit Trail Patterns

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Boundary

Audit trails are immutable operational evidence. They are not an application
event bus, domain history replacement, runtime diagnostic log, analytics
stream, metric, WebSocket publication mechanism, or WebSocket operational log.

Fork context owns the audit policy listed under Fork Extension Boundary.
This skill governs its safe implementation.

## Task Routing

| Work | Read | Also load |
| --- | --- | --- |
| Schema, actor model, logger, writer, projector, retention | [Writer contract](references/writer-contract.md) | database-patterns, hono-patterns, validator-patterns; auth-implementation for authentication events |
| Read API, filters, details, Activity Logs, cache freshness | [Activity Log reader](references/activity-log-reader.md) | hono-patterns, validator-patterns, svelte-data-forms; Svelte skills when components change |
| Tests, reviews, completeness audits | [Verification](references/verification.md) plus every affected contract reference | cloudflare-worker-testing and affected subsystem skills |

Read both contract references when a change crosses writing and reading. Apply
template-merge-workflow when promoting or consuming this capability.

## Core Contract

- Every audit event has a stable public identity and timestamp, an applicable
  ownership scope, a registered component and action, an immutable actor
  snapshot, and a human-readable past-tense description.
- Derive organization and actor attribution only from trusted server context or
  a server-resolved override. Never accept attribution from request input.
- Put JSON-safe persistence types in the active database adapter's scoped
  `types.ts` and export them through that adapter surface. Derive request and
  response types from validators and frontend types from those validators.
- Project every affected record through an explicit domain allowlist before it
  reaches the persistence logger. Raw rows and request bodies never cross that
  boundary.
- Keep a database mutation and its audit in the same atomic unit. Record a
  confirmed irreversible external effect afterward without pretending that an
  audit failure rolled the effect back.
- Keep list responses compact and format allowlisted details server-side.
  Never expose unrestricted stored JSON.
- Mark a response only after an audit write succeeds. Frontends use that marker
  for immediate tenant cache invalidation and refetch audit lists and summaries
  on workspace entry to recover events from other producers.
- Remain tolerant of incomplete legacy rows. Do not fabricate actors,
  snapshots, labels, codes, or affected entities.

## Fork Extension Boundary

Concrete registry values, event coverage, retention windows, reader
permissions, default date ranges, routes, summary groups, labels, columns, and
fallback copy belong to fork context or feature configuration. Do not turn a
downstream choice into a reusable rule.

Name files for their responsibility and ownership. Keep validator registry
extensions in `auditTrail.extension.schema.ts`, snapshot allowlists, value
projectors, context rules, and label fields in
`snapshotPolicy.extension.ts`, and feature configuration in
`config.extension.ts` when this capability is shared
across template forks. Keep JSON conversion, diffing, normalization, and other
generic mechanics in responsibility-named template files. Common writer,
reader, validator, and UI code consumes the extension seams without embedding a
downstream fork's taxonomy or presentation policy.

Runtime and diagnostic logging stays under hono-patterns and the applicable
security or observability guidance. A persistent audit failure may emit a
structured operational error, but that error is not itself an audit record.
