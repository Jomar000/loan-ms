---
name: svelte-data-forms
description: Project rules for typed frontend data access, TanStack Query, realtime recovery, forms, mutations, submission safety, and idempotency. Use when changing frontend queries, socket ownership or refresh, filters, forms, create/update/delete flows, or retries.
---

# Svelte Data, Forms, and Submission Safety

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

* Load `svelte-code-writer`, `svelte-core-bestpractices`, and `svelte-patterns` when creating, editing, or analyzing `.svelte` components or `.svelte.ts`/`.svelte.js` modules, or changing route/component structure or visual UI.
* Load `audit-trail-patterns` for Activity Logs query families, mutation invalidation, and revisit refresh.
* Load `hono-patterns`, `validator-patterns`, and `deployment-operations` when QUERY changes cross frontend/backend boundaries.

## Typed Client and QUERY Boundary

* Fetch through typed `src/lib/clients.ts` wrappers; never import database code or cast `await response.json()`.
* Preserve `responseJson` until checking `success`. Use an early guard for terminal failures before success-only data. Retain both discriminant branches only when `responseJson.error.code`, `message`, or `requestId` drives non-terminal UI.
* Call every `QUERY` route with `$query({ json: input })`, including a retained QUERY route that falls below the method-selection boundary. Never use `$get` or serialized query parameters; send only selected inputs and let validators apply defaults. Use `hono-patterns` to select or migrate the route method.
* Add `QUERY` to each calling frontend client's `SAFE_METHODS` so safe reads receive no CSRF token. Coordinate backend CORS/CSRF through `hono-patterns` and `deployment-operations`.

Canonical tenant query factory:

```typescript
type TResourceQueries = {
    filters?: { isDisabled?: boolean; searchFilter?: string }
    limit?: number
    offset?: number
    sortOrder?: 'asc' | 'desc'
}

type TResourcePage = {
    data: TResource[]
    count: number
    limit: number
    offset: number
}

type TResourceQueryOptions = Omit<
    CreateQueryOptions<TResourcePage, Error>,
    'enabled' | 'queryKey' | 'queryFn'
>

export function createResourceQuery(
    scope: { readonly organizationSlug: string },
    queries: TResourceQueries = {},
    options: TResourceQueryOptions = {},
) {
    return createQuery(() => {
        const organizationSlug = scope.organizationSlug
        const input = {
            ...(queries.filters === undefined ? {} : { filters: queries.filters }),
            ...(queries.limit === undefined ? {} : { limit: queries.limit }),
            ...(queries.offset === undefined ? {} : { offset: queries.offset }),
            ...(queries.sortOrder === undefined ? {} : { sortOrder: queries.sortOrder }),
        }

        return {
            ...options,
            enabled: Boolean(organizationSlug),
            queryKey: createTenantKey(organizationSlug, 'resource', input),
            queryFn: async () => {
                const responseJson = await (
                    await honoClient.resource.readMany.$query({ json: input })
                ).json()
                if (!responseJson.success) throw new Error(responseJson.error.message)
                const { data, count, limit, offset } = responseJson
                return { data, count, limit, offset }
            },
        }
    })
}
```

* Import `CreateQueryOptions` as a type and `createTenantKey` from `$lib/states/session/tenant`.
* Pass tenant scope separately from JSON queries, read `organizationSlug` inside the reactive accessor, guard empty slugs, and prevent options from overriding `enabled`, `queryKey`, or `queryFn`.
* Mirror the optional JSON contract, construct only explicitly selected input, keep domain values under `filters` and pagination/sorting at root, and use the same unserialized object in request and key.
* Expose changing Svelte state through property getters, not captured primitives. Use plain keys only for explicitly public, global, or session-level data.

```typescript
const resourceQuery = createResourceQuery({
    get organizationSlug() {
        return session.data.organizationSlug
    },
})
```

## Queries and Mutations

* Use `createQuery(() => ({ queryKey, queryFn }))` and `createMutation(() => ({ mutationKey, mutationFn }))` with stable array keys containing every result-changing identifier, applied filter, page, and action variant.
* Prefix every tenant-scoped query and mutation key with `createTenantKey(session.data.organizationSlug, ...)`, matching the tenant query-key hierarchy, and disable queries while the slug is empty. Keep public/global/session-recovery queries and public/global/session-level mutations unprefixed.
* Mutation keys are hierarchy/inspection metadata only; they do not authorize, alter server-derived tenant scope, or cancel execution.
* Query functions return narrowed success data and throw terminal API failures. Mutations use the same narrowing; success UI requires confirmed success and never runs from an error callback.
* Use `mutateAsync` for ordered create/update/remove follow-up; use `mutate` only when all handling lives in callbacks. Return mutation data when callbacks/cache/callers need it; otherwise resolved/rejected completion is sufficient.
* For no-body liveness endpoints, require `response.ok` and return the typed response directly. Shared `ky` does not throw HTTP errors, while network/DNS failures reject; do not wrap these endpoints in `TApiResponse`.

## Failure Handling and Recovery

* Preserve API messages intended for users; use action-specific fallbacks when unavailable, without exposing internal details or inventing causes. Claim notification, rollback, or safe retry only when the operation contract and observed outcome support it.
* Distinguish an explicitly rejected operation, an uncertain response where persistence may have occurred, and a confirmed write followed by failed UI refresh. Keep successful-write evidence through recovery; follow the submission/idempotency rules below for retries.
* When fresh data is required before another action, inspect the query library's actual refresh contract and options. A resolved promise can contain an error result; check that result or use a verified throwing option before declaring recovery complete.
* A continuing recovery blocker is separate from the pending submission lock, which still releases in `finally`. Prefer existing query state when it captures the blocker, and provide a clear recovery action before re-enabling actions that require fresh data.
* Keep workflow-specific selection clearing, reload, and retry decisions in product documentation; do not derive universal policy from one workflow.

## Event-Driven Realtime Queries

* Use event-driven query mode only when every authoritative state change has a websocket trigger or an explicit local fallback.
* Load initial data normally or through `createRealtimeBootstrapCoordinator`; treat the first `READY` as synchronization readiness, not an automatic cache refresh.
* Scope `GAP` and reconnect recovery through realtime query metadata. Keep event-driven options opt-in, tag the owning tenant/stream/target, and never use a targetless query as a wildcard for targeted recovery.
* Reconcile commands event-first with `createRealtimeCommandReconciler`: register the expectation before the HTTP command, refresh from a matching event, and use a bounded fallback when no event arrives.
* Do not let navigation, window focus, display timers, browser network reconnects, or same-tenant session refreshes cause blanket invalidation.
* Key socket-owning effects to stable tenant, stream, and target scalars. An unchanged scope must not release or reacquire APP or dedicated leases after a session refresh.
* Make a query refresh on each APP event only by tagging it with `appRealtimeEventQueryMeta(slug)`. Catalog, settings, and other lookup queries use `appRealtimeQueryMeta(slug)` and stay recovery-only. The event flag is independent of `EVENT_DRIVEN_QUERY_OPTIONS`, which only disables mount and focus refetches.
* Events refresh only the queries on screen, so an event-driven entry that was off screen, such as a previous filter or a page left behind, may have missed some. Spread `REVALIDATE_ON_ACTIVATION_QUERY_OPTIONS` into such a query so that showing the entry again refetches it, with its cached data on screen until the response arrives. This is a per-entry refetch, not an invalidation, and `EVENT_DRIVEN_QUERY_OPTIONS` instead trusts the cache.
* List the event names that trigger invalidation in `states/session/appRealtime.extension.ts` and register every one in the browser registry through `utilities/wsClientManager/registry.extension.ts`. An event missing from the browser registry fails validation as `UNKNOWN_EVENT` and is dropped before `SessionProvider` sees it; the extension guard spec fails when a listed event is unregistered.

## Forms

Follow `svelte-patterns` section ownership: form setup, field aliases, and subscriptions in Forms; schema aliases/static config in Constants; submit functions in Handlers. Move reusable non-component validation to `.ts` utilities.

## Debounced Search

Use one flow: plain initial value → separate draft/applied states → debounce draft into applied → use applied in the query key, request, and URL.

* Never bind inputs to query-key/query-function state or initialize one rune from another with `$state(searchFilter)`.
* URL synchronization updates both states; applying input trims it and resets pagination.
* Autocomplete may use a distinct interval, but its key uses the debounced value.
* For QUERY, keep domain filters under `filters` and normalize the applied filter before calling the factory.
* When one screen needs enabled/disabled views, fetch the smallest combined set once and derive locally instead of competing queries.

Focused excerpt: retain the required component sections and URL-writing flow when integrating it.

```svelte
<script lang="ts">
    const initialSearchFilter = page.url.searchParams.get('searchFilter') || ''
    let searchFilter = $state(initialSearchFilter)
    let inputSearchFilter = $state(initialSearchFilter)
    let pageNumber = $state(1)
    let rowsPerPage = $state(100)

    const listQuery = createResourceQuery(
        {
            get organizationSlug() {
                return session.data.organizationSlug
            },
        },
        {
            get filters() {
                return searchFilter ? { searchFilter } : {}
            },
            get limit() {
                return rowsPerPage
            },
            get offset() {
                return rowsPerPage * (pageNumber - 1)
            },
            sortOrder: 'asc',
        },
    )

    const handleSearchInput = debounce(() => {
        searchFilter = inputSearchFilter.trim()
        pageNumber = 1
    })

    function syncFromUrl(url: URL) {
        searchFilter = url.searchParams.get('searchFilter') || ''
        inputSearchFilter = searchFilter
    }
</script>

<input bind:value={inputSearchFilter} oninput={handleSearchInput} />
```

## Safe and Idempotent Submissions

For every create/update/remove flow:

1. Use a component-local action lock (`isSubmitting`, `isSaving`, or `isConfirming`), even with mutation pending state or idempotency.
2. Start handlers with an early return, set the lock before awaiting, and release it in `finally`.
3. Disable every submit/confirm/cancel/abort/back/close control while its local lock or mutation is pending. Apply the same guard to dialog dismissal through close buttons, Escape, outside interaction, and any other supported dismissal path. One modal with several actions uses one shared action lock.
4. After confirmed create persistence, immediately clear/reset create input state when leaving it visible could permit resubmission. If persistence succeeds but UI follow-up fails, preserve saved-record/receipt state and warn instead of encouraging duplicate retry.
5. Enforce the dismissal guard with a function binding, `bind:open={() => open, handleOpenChange}`, whose handler returns early when the lock is held and otherwise assigns the state. A one-way `open={open}` with an early-return `onOpenChange` does not veto dismissal: the dialog primitive updates its own state before calling the handler, so Escape and outside interaction still close it. Cover the pending state with a test that presses Escape and clicks the overlay.

When a create requires `idempotencyKey`:

* Create one `createIdempotencyKeyLifecycle` from `$lib/utilities/idempotencyKey` per create workflow or component instance and submit its UUIDv7 `current` value.
* Do not manually generate a replacement key in the component or mutation.
* Do not duplicate the helper implementation or hand-roll its state inside components or feature modules, and do not re-export the utility through feature-specific modules; import it directly from the app-wide utility.
* Preserve the same key and attempt-coupled snapshots after API or network failures and allow retry; persistence may have succeeded. Show pre-persistence API failures as retryable.
* Call `confirmSuccess()` only after confirmed persistence and local cleanup; it rotates the key before the workflow closes/resets.
* Bind the key to its payload: call `claim(payload)` before submitting, send the returned `key`, and when `claim` returns `{ ok: false, reason: 'payload-mismatch' }` refuse locally without a request and tell the user to retry the unresolved attempt unchanged.
* When one component instance can target different records, call `abandonAttempt()` on dialog close or draft reset so a key claimed for one record is never reused for another.
* Omit idempotency keys from updates and atomic status transitions.

```typescript
const idempotencyKey = createIdempotencyKeyLifecycle()

async function handleCreate() {
    if (isSubmitting) return
    const payload = { name: name.trim() }
    const claim = idempotencyKey.claim(payload)
    if (!claim.ok) {
        toast.error('Retry the unresolved request without changing its details.')
        return
    }
    isSubmitting = true
    try {
        await createMutation.mutateAsync({ ...payload, idempotencyKey: claim.key })
        resetCreateState()
        idempotencyKey.confirmSuccess()
    } finally {
        isSubmitting = false
    }
}
```

### One-Time Secrets

* For API-key creation, lock submission locally, set automatic mutation retries to `false`, and use the shared `createIdempotencyKeyLifecycle` helper with a separate instance per workflow/component, as required by the issuance contract.
* Snapshot the key and complete issuance inputs on the first submit. Preserve that exact attempt after API or network failures and reject changed retry input locally. The narrow exception is an explicit, operator-confirmed recovery action that warns the previous request is not canceled and its secret cannot be recovered: clear the saved attempt and mutation error, call the shared lifecycle's `abandonAttempt()`, reset the form, and do not submit or revoke anything. Keep `confirmSuccess()` reserved for an `issued` or `alreadyIssued` response; both lifecycle operations generate their replacement UUIDv7 inside the shared helper.
* Deliver an `issued` raw secret through an ephemeral component callback; return only safe metadata plus the outcome from the mutation so the secret never enters TanStack Query state. An `alreadyIssued` response never invokes the secret callback. Clear a shown secret when its dialog closes and exclude it from persistence, URLs, logs, analytics, and form restoration.
* Scope API-key query and mutation keys to the active tenant and invalidate safe metadata after create, update, and revoke. For `alreadyIssued`, pending, failed, or otherwise ambiguous outcomes, refresh metadata and instruct the user to inspect and revoke any uncertain credential before issuing a replacement; never imply that the raw key is recoverable.

## CSV Import and Export

Use `$lib/utilities/csv` (`web-backoffice`) for every CSV read and write; never hand-roll CSV strings, strip commas to avoid quoting, or add another parser.

* Export with `toCsv`/`toCsvSections`, then `downloadCsv(csv, createCsvFileName(base, stamp))`. The utility quotes fields, writes dates as ISO strings, neutralizes spreadsheet formulas, and prefixes a UTF-8 BOM so Excel detects the encoding.
* Import with `parseCsvFile(file, { requiredHeaders, headerAliases, maxRows, maxBytes })` and branch on its `ok` result; it reads through `file.text()` and never throws for bad content. Do not use PapaParse workers, `download`, or `File` input, which need `FileReader` or extra CSP `connect-src` access.
* Validate parsed rows with the shared Zod contract before submitting them, and treat the CSV as untrusted input.
