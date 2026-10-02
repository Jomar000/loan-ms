---
name: NOTES
description: Handover notes, special instructions, caveats, and fork-specific rules.
---

# Notes

## Authoritative Guidance

This document is the authoritative location for handover notes, special instructions, caveats, fork-specific behavior, and template-merge constraints that supplement the reusable baseline. It must not redefine or weaken the root guidance or reusable skills; surface any conflict instead.

Downstream forks must preserve this section. They must replace `Template-Specific Context` with `Fork-Specific Context` and record the fork's actual notes there.

### Opt-in Features

#### Service Principals

Organization-owned service principals with Better Auth API-key credentials are
implemented but feature-flag gated. These rules apply when a fork retains the
capability, whether enabled or disabled.

- Keep both APIs' and the backoffice build's `FEATURE_API_KEY` aligned: `1`
  enables; `0` or omission disables.
- When disabled, protected v1 and service-principal management routes return
  `404_NOT_FOUND`; the backoffice hides navigation and redirects the existing
  `service-principals` routes.
- Keep the Better Auth plugin, persistence, contracts, cleanup, and UI compiled.
  Keep both API test flags at `1` for complete regression coverage.

#### Object Storage

Object storage is implemented but feature-flag gated. These rules apply when a
fork retains the capability, whether enabled or disabled.

- Keep both APIs' and both web builds' `FEATURE_OBJECT_STORAGE` aligned: `1`
  enables; `0` or omission disables.
- When disabled, APIs return `404_NOT_FOUND`; the backoffice hides navigation and
  redirects object-storage routes.
- Object-storage variables and secrets are required only when enabled. Keep API
  test flags at `1` for regression coverage.

#### Application Email Delivery

Application email is implemented but feature-flag gated. See the root README's
Application Email Delivery section for provider selection and secrets.

- Keep each API's `FEATURE_MAIL` independent: `1` enables; `0` or omission
  disables. Keep the API test flag at `1` for regression coverage.
- When disabled, reset-request initiation routes return `404_NOT_FOUND` before
  database or authentication context is initialized; existing reset and
  verification tokens remain redeemable.
- Provider variables and secrets are required only when enabled.

#### In-App Browser Detection

The shared in-app browser recommendation notice is implemented but opt-in for
each web build.

- Set `FEATURE_IN_APP_BROWSER_DETECTION=1` independently in a web app to mount
  the notice from its root layout; `0` or omission disables it.
- Keep the notice and detection utilities in source and covered independently
  of a build's selected flag.

## Fork-Specific Context

### Audit Trail Policy

- Durable audit rows record confirmed successful operations only. Failed and
  denied attempts remain operational/security telemetry, not audit history.
- Audit rows are retained for 90 days by the database cleanup path.
- Every row has an organization, actor type, and captured actor display name.
  User, service-principal, anonymous, and system actors are supported without
  fabricating missing historical identity data.
- `auditTrail:read` belongs only to owner and admin roles. Members,
  unauthenticated requests, and management API credentials cannot read logs.
- Common registries live in
  `packages/validator/src/backoffice/auditTrail.schema.ts`; fork extensions
  belong only in `auditTrail.extension.schema.ts`, `snapshotPolicy.extension.ts`,
  and matching UI policy seams. Persisted values are closed and stable.
- Activity Logs routes are `/app/owner/activity-logs` and
  `/app/admin/activity-logs`. The four template cards are All Activity, Access
  & Security, Account & Profile, and Storage & Notifications.
- Summary counts retain every active filter except the selected group. Lists
  default to 25 rows, cap at 100, and use the internal ID as a stable timestamp
  tie-breaker.
- Browser controls default to the browser-local current day. The API receives
  explicit instants and does not infer the operator's timezone.

### D1 Audit Runtime

- Audit persistence uses SQLite JSON text and predeclared D1 batches so business
  mutations and required audit rows remain atomic without interactive
  transactions.
- The fresh-database baseline omits PostgreSQL-only GIN indexes and cron
  procedures. The Worker scheduled retention path owns the existing 90-day
  cleanup for this profile.
- Existing D1 deployments require a separately reviewed upgrade migration;
  these baseline changes apply only to newly initialized databases.
