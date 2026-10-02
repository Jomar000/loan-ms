---
name: hono-patterns
description: Project rules for Hono routes, middleware, context, validation, responses, tenancy, concurrency, observability, WebSockets, and audits. Use when changing backend API behavior.
---

# Hono Backend Patterns

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

- Load `auth-implementation` for auth, `database-patterns` for persistence, `validator-patterns` for schemas, `cloudflare-worker-testing` for tests, and `deployment-operations` for deployed configuration.

## API and Route Boundary

- Keep public/backoffice BFF routes under `apps/api-*/src/core/api/` and mount every HTTP endpoint below `/api`, including heartbeat and v1. Use app-specific `THonoInstance`, `THonoBindings`, and `THonoVariables` from each API's `src/types.ts`.
- Use Hono RPC types and shared Zod validators; frontends call typed clients without importing backend/database code. Follow `monorepo-troubleshooting` for Worker boundaries.
- Normalize runtime environment variables through middleware. Attach auth, permission, validation, and route guards directly to a single-endpoint child handler.

### GET versus QUERY

| Method  | Select when                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUERY` | Any domain input is inherently object/array-valued; pagination or sorting combines with at least one domain filter; or at least two scalar domain filters exist. Wrapping one scalar in `filters` does not itself qualify. |
| `GET`   | Path-only retrieval or scalar query strings meeting none of those conditions, including pagination/sorting without domain filters and one scalar filter without pagination/sorting.                                        |

- Apply this boundary to new endpoints and existing contracts that cross it.
- Preserve an existing below-threshold QUERY route unless an explicit migration requests GET.
- For `QUERY`:

    - Declare `.on('QUERY', ...)`, validate JSON, keep domain fields under `input.filters`, and keep `limit`/`offset`/`sortOrder` at root.
    - Consume validator defaults directly; never add handler `??`/destructuring defaults, flatten filters, or introduce an intermediate `request` object.
    - Treat it as safe/idempotent retrieval only; never mutate state or assume HTTP caching—TanStack Query owns frontend caching.
    - Never send GET bodies, substitute POST for reads, or retain duplicate GET compatibility by default.

- When a contract crosses the boundary, atomically migrate the route, validator, typed `$query({ json: input })` call, CORS allowed methods, backend/frontend CSRF safe-method lists, tests, and committed local Wrangler config.
- Retire GET unless compatibility is explicit; coordinate ignored deployed configs through `deployment-operations`.

## Middleware, Families, and Context

- Never use unscoped `.use(middleware)` in a child mounted with `.route('/', childRoute)`. Give a shared child a unique mount or scope middleware to `/exactPath` or `/prefix/*`.
- Use camelCase for static URL segments, compound route paths/files, and exports (for example `/objectStorage`, `/resetRequest`, `/signIn/email`, `objectStorage/uploadAttachment.ts`, `uploadAttachmentRoute`). Framework-owned external endpoints/SvelteKit routes follow their conventions. Never introduce kebab/snake case.
- Add families to the narrowest group and alphabetize final `.route(...)` declarations. `securityApiRoutePatterns` supplies default CORS/CSRF; `contextApiRoutePatterns` supplies request/database/auth context and includes WebSockets. Do not use broad `/*` middleware.
- Keep exceptions self-contained: heartbeat uses default CORS/CSRF; v1 uses reflected non-credentialed CORS plus request context; WebSockets run `wsOriginGuard()` before shared context and omit HTTP CORS/CSRF.
- Bindings include shared D1 databases, generic `RateLimit` Durable Objects, KV, and WebSocket namespaces. Object storage has no direct R2 binding; sign S3-compatible calls with `aws4FetchClient` configured from `CF_R2_*` vars/secrets.
- Use split `initContext.ts` middleware, mount only required context, and scope object-storage context to `/objectStorage/*`; do not use aggregate context middleware. Exclude `/auth/*` from root database/auth context patterns, mount request context once on the uniquely mounted auth child, and reuse one route-local database/auth middleware tuple.
- Order unauthenticated sign-in as validation, CAPTCHA, limiter, database/auth context, and authentication.
- Order unauthenticated reset-request, reset-redemption, and email-verification routes as validation, limiter, database/auth context, and Better Auth operation.
- Order protected auth routes as database/auth context, authentication or tenant guard, validation, and any applicable limiter.
- Use `ctx.get('dbClient')` for typed queries/transactions and `ctx.get('dbSchema')` for tables.
- Apply `authRateLimit` only to reviewed authentication routes. Keep generic mechanics in `@PROJECT_NAME/rate-limit`; keep action selection, normalization, policies, Hono errors, and binding access in each API's authentication adapter. Pass ordered structured key parts, never delimiter-concatenated strings.
- Validate requests and CAPTCHA before reservation consumption; reserve before password hashing, Better Auth, verification-token creation, or email work. Store the accepted decision in a typed internal context variable.
- Retain reservations for user-controlled failures, including thrown or returned 4xx outcomes. Release only the request's exact reservation after context-initialization failure or a classified infrastructure/5xx failure, including unexpected exceptions.
- Treat Better Auth 5xx responses and resolved email-provider errors as infrastructure failures; mark delivery successful only after provider success. Return `AUTHENTICATION_UNAVAILABLE` 503 for classified infrastructure failures on rate-limited Better Auth operations.
- Return the standard `RATE_LIMITED` 429 wrapper with `Retry-After` for blocked sign-in, password-change, reset-redemption, email-verification, and administrative flows.
- Reset sign-in buckets after successful authentication. After password-change success, reset its user bucket and forward the rotated session cookie; retain successful reset/verification token reservations.
- Suppressed self-service reset requests return the exact accepted success response without verification material, email, or persistent audit. Emit only a privacy-safe runtime log and do not claim timing equivalence without measured controls.

## Tenant Scope

- Authenticated tenant routes reject sessions without `session.activeOrganizationId` and derive tenant scope through `getActiveOrganizationId(ctx)` unless the route is an explicitly documented global endpoint.
- Never accept tenant scope from request input. Every organization-owned select/insert/update/delete includes `organizationId`; joins filter every organization-owned table by the same value.
- Privileged roles may widen user ownership only inside the active organization and never cross tenants.

## Validation, Responses, and Imports

- Validate with the matching app's `validateRequest(target, schema)` wrapper around `@hono/zod-validator`. Bind once as `const input = ctx.req.valid(target)` using the same target; never destructure directly from `ctx.req.valid(...)`.
- Use `json` for POST/QUERY bodies and `query` for below-boundary GET query strings. Validation failures return `DATA_VALIDATION` with Zod issues.

| Helper                                                                       | Response shape                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apiResponseOkWrapper(ctx, { data })`                                        | `{ success: true, data }`                                                   |
| `apiResponsePaginatedOkWrapper(ctx, { data, count, limit, offset })`         | `{ success: true, data, count, limit, offset }`                             |
| `apiResponseErrorWrapper(ctx, { code, message, validatorIssues?, status? })` | `{ success: false, error: { requestId, code, message, validatorIssues? } }` |

- Use shared response types from `@PROJECT_NAME/types/shared` and app wrappers from `src/utilities/helpers.ts`.
- Project responses explicitly with Drizzle. Accept/return `publicId` for relations; another string domain ID is allowed only when an existing public validator declares it. Resolve internal bigints only in tenant-scoped backend/database logic.
- For bulk-by-identifier and whole-range endpoints, follow the `validator-patterns` bounds: validated and capped identifiers deduped before count comparison, and a bounded range without `limit`/`offset`.
- Exclude internal/foreign-key IDs and timestamps unless contracted. Preserve the complete response union until `success` narrows it; paginated success includes `count`, `limit`, and `offset`.
- Do not add runtime output validation. During request processing, throw app `AppError`, never raw exceptions, so global `.onError` serializes failures. Startup/configuration parsers may throw ordinary `Error` before a request context exists.
- Group package imports before local imports, alphabetize module specifiers per group, and use `import type` for types.

## Concurrency and Retry Safety

- For each persisted status transition, define allowed sources and use an atomic conditional write (`WHERE id = ... AND status IN (...)`) or transaction locking.
- Throw domain `AppError` status `409` after a zero-row transition update.
- Test valid, repeated-409, and concurrent single-winner transition behavior.
- For each client-retryable create that can produce primary/related rows, counters, audits, WebSocket messages, or external effects:
    - Require a client-generated UUIDv7 `idempotencyKey` and enforce ownership-scoped uniqueness or use the dedicated request ledger required by `database-patterns`.
    - Replay the original success for an existing key, scoped to the server-derived ownership columns used by its uniqueness constraint.
    - Allow only the first request to create any row, counter, audit, message, or external call.
    - Exempt only status transitions protected by atomic conditional writes; never add keys to cancel/serve/update/complete or equivalent transitions.
- Coordinate persistence, validation, and frontend retries with `database-patterns`, `validator-patterns`, and `svelte-data-forms`.

## Tests

- Follow `cloudflare-worker-testing` for placement, concurrency, helpers, and direct `test:con`/`test:seq`/`test:srt` execution. Cover success, new domain errors, and applicable validation, auth, authorization, origin, and route guards.
- Assert that persisted responses exclude internal/foreign-key IDs and uncontracted timestamps while retaining every contracted field.
- Cover current `/api` mounts and heartbeat/v1/WebSocket isolation; test retired paths or methods only through temporary cutover files.
- Explain code-only refactors that require no new tests.

## Observability and WebSockets

- Emit info via `console.log(JSON.stringify({...}))` and errors via `console.error(JSON.stringify({...}))`; every entry has top-level `type`.
- Log caught or unexpected errors only by spreading `serializeError` from `@PROJECT_NAME/errors`; never log raw `error.message`, `stack`, `cause`, query parameters, or driver objects. It reads an allowlist of fields, keeps SQL text with inline literals and comments redacted plus parameter count and types but never values, keeps a stack only when its header matches the error and then only as `file:line:column` locations, omits `detail` and `where` for SQLSTATE classes 22 and 23, bounds the cause chain, and redacts URL credentials and tokens at every field limit. Its output is server-log-only and never a client response.
- Keep error messages fixed and put identifiers in allowlisted structured fields; never interpolate emails, names, tokens, or row values into messages.
- Include request ID, correlation ID, environment, and bounded policy scopes in authentication rate-limit block, release-error, and reset-error events; exclude raw identities, tokens, full networks, and secrets.
- Register `apps/api-{public,backoffice}/src/core/middleware/requestTimer.ts` exactly once in `core/index.ts` and keep `requestId -> requestTimer -> status check -> routes`.
- The `createMiddleware<THonoInstance>` timer logs in `finally` and records thrown `AppError.status` or `500`. Read `correlationId` after `await next()`; use `N/A` only when failure predates `initRequestContext()`.
- Request logs include `type: 'REQUEST'`, `requestId`, `correlationId`, method, `path`, status, millisecond duration, and `ctx.env.ENVIRONMENT`. Request and error logs set `path` from `getRequestLogPath(ctx)`, the matched route pattern such as `/api/ws/:stream/:target`, and never log the URL pathname, whose segments are user input.
- `apps/api-{public,backoffice}/src/services/realtime/publication.ts` is the domain-neutral publication base. Forks may add their own domain publishers without changing it and may pass one or more `publish*RealtimeAfterCommit` promises through the mirrored `schedule*RealtimePublications` helper for canonical `REALTIME_PUBLISH_ERROR` log-derived metrics. Keep scheduling post-commit and best effort so publication or logging failures never alter the completed business operation or HTTP response.
- `packages/websocket/src/server.ts` owns shared WebSocket server behavior and module-level `wsLog` and `wsError` and logs errors through the shared `serializeError`; never replace them with inline `console.*`. Use `WS_CONNECT`, `WS_CLOSE`, `WS_CLOSE_ERROR`, `WS_ERROR`, `WS_MESSAGE_PARSE_ERROR`, and `WS_MESSAGE_SEND_ERROR`.
- Each API keeps only its app-specific `WebSocketServer` subclass and environment wiring in `src/core/durableObject/webSocket.ts`. The shared base implements `webSocketError(ws, error)` so Durable Object errors are not swallowed.

## API-Key Routes

- Keep API-key management behind session, active-organization, and route-permission middleware. Derive tenant, actor, configuration, prefix, and plugin controls server-side; do not mount raw plugin management routes.
- On protected API surfaces, order middleware as request initialization, bounded header validation, exact application limiter reservation, database/ACL/auth initialization, one audience-specific verification, current-catalog permission intersection, endpoint permission guard, then endpoint work.
- Keep CORS preflight unauthenticated and non-credentialed. Accept only the reviewed API-key header and never fall back to cookies, sessions, query parameters, or `Authorization`.
- Retain limiter reservations for handled invalid, forbidden, and successful requests. Compensate only after independently classified infrastructure failures, and keep verification and authorization logs correlated and free of keys, hashes, or complete network identifiers.
- Keep the production API router empty until a real domain endpoint exists; use a test-only probe for successful middleware coverage.
- Credential issuance is the reviewed one-time-secret exception to ordinary create replay: durably claim an organization/principal-scoped UUIDv7 operation before Better Auth, never store the raw key, and allow only the winner to issue. Complete credential linking, audit persistence, and safe ledger metadata atomically in a conditional D1 batch. Return the winner as `201` with `outcome: 'issued'` and the raw key; return completed duplicates as `200` with `outcome: 'alreadyIssued'`, safe metadata, and no key or duplicate audit. Reject changed input and terminal pending/failed claims with `409`.
