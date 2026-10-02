---
name: DESIGN
description: Visual direction, UX principles, layout behavior, and component intent.
---

# Design

## Activity Logs

Activity Logs uses a stable data-workspace layout with exactly four clickable
summary cards in this order: All Activity, Access & Security, Account & Profile,
and Storage & Notifications. Search, browser-local date range, module, action,
actor type, record type, active filters, ordering, and pagination remain visible
without displacing the table.

Rows open a right-side detail sheet by click, Enter, or Space. Desktop columns
show Date and time, Activity, Module, Actor, and Source/IP. Event IDs remain
available through unified search and event details. Narrow layouts preserve Date
and time, Activity, and Actor while moving the remaining context, including
affected records, into the detail sheet. Loading, stale-refresh, terminal error,
filtered-empty, unavailable-summary, and missing-snapshot states must remain
explicit and keep the workspace stable.
