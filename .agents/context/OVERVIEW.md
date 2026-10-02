---
name: OVERVIEW
description: Project identity, purpose, users, and core workflows.
---

# Overview

## Authoritative Guidance

The root `README.md` is the authoritative human-facing description of the
repository baseline. Do not duplicate its capability, architecture, setup,
environment, or lifecycle inventory here.

Use this document for the fork's product purpose, intended users, domain
terminology, scope, and core workflow decisions. Project context may supplement
the template baseline and reusable skill guidance, but it must not silently
redefine or weaken either one.

Downstream forks must preserve this section. They must replace
`Template-Specific Context` with `Fork-Specific Context` and record the fork's
actual product overview there.

## Template-Specific Context

The source template deliberately leaves product-specific overview decisions
unspecified.

### Activity Logs

Owners and administrators can investigate successful organization activity
through tenant-scoped lists, group summaries, and formatted event details.
Unified search includes event IDs and IP addresses, and date, module, action,
actor, and record-type filters support focused review. Details expose only
allowlisted, JSON-safe snapshots and human-readable changes; raw persisted
snapshots and invented legacy values are never returned.
