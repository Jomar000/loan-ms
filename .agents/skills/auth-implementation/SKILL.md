---
name: auth-implementation
description: Project rules for Better Auth initialization, authentication strategies, session storage, authorization, and cookies. Use when implementing auth behavior or fixing authentication and permission bugs.
---

# Authentication (Better Auth)

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

- Load `better-auth-best-practices` for Better Auth API/configuration; add `email-and-password-best-practices`, `organization-best-practices`, `two-factor-authentication-best-practices`, or `better-auth-security-best-practices` for their respective domains.
- Use dedicated plugin import paths supported by the installed Better Auth exports; generic `better-auth/plugins` examples do not override that rule.
- When upstream Better Auth guidance refers to its separate create-auth skill, use this repository-native skill for project setup and integration constraints; create-auth is not vendored here.
- Treat this skill and the repository's other project skills as authoritative whenever generic upstream examples conflict with pnpm workspace usage, Cloudflare Worker runtime boundaries, per-request initialization, D1 persistence, application-owned Durable Object rate limiting, cookie policy, testing, or deployment approvals.
- Load `database-patterns` for auth persistence or schema work, `hono-patterns` for route context or middleware, `audit-trail-patterns` when authentication events are durably audited, `cloudflare-worker-testing` for auth fixtures, and `deployment-operations` for secrets or environment configuration.

## Initialization and Strategies

- Keep `src/auth/index.ts` app-specific, initialize request context once on the uniquely mounted auth child, and never use a global auth singleton.
- For unauthenticated reviewed auth routes, initialize D1, ACL, and Better Auth only after validation, CAPTCHA when applicable, and an accepted application rate-limit reservation.
- For protected auth routes, initialize D1, ACL, and Better Auth before the authentication or tenant guard; validate input and consume any applicable reservation after that guard.
- Enable Email + Password with custom `@noble/hashes` scrypt and the Username plugin. Keep Google OAuth values reserved and unwired.
- Treat mail as an application-wide capability with authentication as its first consumer. Gate outbound authentication mail with `FEATURE_MAIL`; when disabled, configure no provider-backed verification or reset callbacks and return the standard feature-not-found response only from routes that initiate outbound mail before protected context, while keeping password-reset and email-verification token redemption available. When enabled, route verification links, verification OTPs, and password resets through the provider-neutral mail adapter, select exactly one configured provider without fallback, and do not expose Email OTP as a sign-in route.
- Keep the scrypt hash and verification implementation in the app's shared `src/auth/password.ts` helper. Configure Better Auth and administrative password reset to call that helper directly; never inspect `auth.options`, the email-and-password option tree, or other Better Auth internals.
- Use the `organization` plugin with D1-backed custom roles and permissions built by `aclBuilder` in `src/auth/acl.ts`; keep D1 authoritative for roles and permissions.
- Keep the reserved phone-number and two-factor schema synchronized with Better Auth without registering their plugins or routes.

## Authentication Throttling

- Disable Better Auth's generic limiter with `rateLimit: { enabled: false }`. Protect reviewed server-side `auth.api` flows through the app adapter backed by `@PROJECT_NAME/rate-limit` and the local `RateLimit` Durable Object; define all limits in each surface's typed `AUTH_RATE_LIMIT_POLICIES` module.
- Bypass the application rate-limit adapter only when `ENVIRONMENT === 'development'`, before resolving limiter keys or contacting the Durable Object. Keep `test` and every other environment fully enforced and fail closed; do not substitute a loopback or proxy-header fallback. Treat any exposed development endpoint as intentionally unthrottled and protect it through local-only binding, Access, or tunnel isolation.

| Flow                            | Required policy                                                                                                                | Limited behavior                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Sign-in                         | Enforce 5 failed attempts per identity and client network per 10 minutes, plus 20 failed attempts per identity per 10 minutes. | Return the standard `RATE_LIMITED` 429 response with `Retry-After`.                                 |
| Password change                 | Enforce 5 attempts per authenticated user per 10 minutes.                                                                      | Return the standard `RATE_LIMITED` 429 response with `Retry-After`.                                 |
| Self-service reset request      | Permit at most 1 actual send per identity per 60 seconds, 3 per identity per hour, and 10 per client network per hour.         | Return the exact accepted success response without creating verification material or sending email. |
| Password-reset redemption       | Enforce 5 attempts per reset token and 30 attempts per client network per 10 minutes.                                           | Return the standard `RATE_LIMITED` 429 response with `Retry-After`.                                 |
| Email verification              | Enforce 5 attempts per verification token and 30 attempts per client network per 10 minutes.                                  | Return the standard `RATE_LIMITED` 429 response with `Retry-After`.                                 |
| Administrative reset initiation | Enforce 10 requests per authenticated actor and target user per hour only when the route creates or sends reset material.      | Return the standard `RATE_LIMITED` 429 response with `Retry-After` and preserve auditing.           |

- Exclude direct administrative password changes from reset-initiation limits when they create no reset material; retain authorization and auditing. Keep the identity-only sign-in policy as a hard distributed-guessing bound and document its targeted-lockout tradeoff.
- Pass normalized structured key parts to `@PROJECT_NAME/rate-limit`; HMAC its canonical scope, parts, algorithm, policy version, limit, and duration tuple with `CF_DO_RATE_LIMIT_SECRET`.
- In enforced environments, prefer valid edge-provided `CF-Connecting-IPv6`; otherwise use `CF-Connecting-IP`. Normalize IPv4 exactly, IPv4-mapped IPv6 to exact IPv4, and IPv6 to canonical `/64`; fail closed with the authentication rate-limit configuration 503 when neither trusted address is valid.
- Validate normalized reset-request email addresses at 254 characters or fewer and reset or verification tokens as 1–512 ASCII `[A-Za-z0-9._-]` characters before using them as limiter key parts.
- Never store or log raw credentials, identities, reset or session tokens, full IP addresses, or the coordination secret.
- Retain reservations for invalid credentials, other user-controlled failures, and successful reset/verification token redemption. Release only the request's exact reservation after a context-initialization failure, Better Auth 5xx, email-provider error, or other infrastructure failure.
- Await provider delivery so errors reach reservation handling; invoke delivery-success hooks only after provider success. Do not copy upstream fire-and-forget mail examples.
- Reset sign-in buckets after successful authentication. Reset the password-change user bucket only after the application-owned atomic D1 batch rotates the current session and revokes prior sessions; sign and forward the rotated host-only cookie.
- Suppress persistent audit writes with suppressed self-service resets; emit only a privacy-safe runtime suppression log and document reset timing as a residual enumeration risk.

## Sessions and Authorization

- Store sessions and verification records in D1 through the Better Auth Drizzle adapter with `provider: "sqlite"` and `transaction: false`. Do not configure `secondaryStorage` or `session.storeSessionInDatabase`; use KV only as a non-authoritative cache when atomicity is unnecessary.
- Better Auth operations may perform related writes as separate statements and have no implicit cross-statement rollback with `transaction: false`. Keep self-service password change and reset credential, verification/session, and audit mutations in one bounded application-owned D1 batch; fault-inject the batch boundary and require the prior credential, token, sessions, audit state, and rate-limit recovery to remain fail-secure.
- Treat Better Auth's rejection of expired records as the runtime correctness boundary; use the backoffice scheduled handler only to remove untouched expired session and verification rows.
- Delete expired authentication records permanently at their D1 expiry cutoff; never archive their tokens, identifiers, or values.
- Identify credential accounts by `accountId = userId`, `providerId = 'credential'`, and `userId`. Never use a provider-only credential lookup.
- Use `isSessionAuthenticated` for a valid unlocked user when current organization membership is unnecessary, such as organization listing or switching.
- Use `isTenantAuthenticated` for tenant routes; it composes session authentication with active-organization membership and role validation, then populates `role` and `isPrivilegedRole`.
- Use `isAuthorized(permissions)` for permission checks; it composes `isTenantAuthenticated` before `auth.api.hasPermission`.
- For both public and backoffice sessions, always expose UI ACL grants under `session.permissions`, grouped by ACL resource and action as `session.permissions.<group>.<action>`; never add separate top-level permission maps. The reusable template returns `permissions: {}` on each surface until its UI consumes a grant.
- Put each surface's fork-specific grant projection in `sessionPermissions.extension.ts` and its Zod shape in `sessionPermissions.extension.schema.ts`; keep the shared session builder and validator wiring aligned with the template. Derive each exposed flag from effective grants across all roles in the active organization, using keyed group checks such as `hasPermission[group](action)` in a consuming fork.
- Add group and action flags only for concrete UI consumers. Define denied defaults in the permission schema once; default missing groups to all false and reject malformed supplied flags. Initialize client session permissions from that schema and clear the entire object during organization transitions. Server permission guards remain authoritative.
- Keep `userRoles` as the session's role source. In both web clients, expose `getRoles()`, `hasRole(role)`, and `hasAnyRole(roles)` on session state for selectors, routing, and role-specific UI. Return no active roles during unauthenticated, expired, or transitioning phases and clear cached roles when an organization transition begins. Preserve separate `session.permissions` checks on ACL-gated actions; client role methods never replace server authorization.
- For ACL-gated actions, write focused positive and negative tests for single and combined roles, active-organization switches, and direct API requests; include foreign-tenant identifiers when the action accepts them.
- Before changing the active organization, the initiating tab must refuse while its current tenant has active mutations. This client guard never replaces server-side membership or tenant authorization.

## Cookies

- Use host-only `__Host-` cookies with `secure: true`, `path: "/"`, no `domain`, `partitioned`, and `sameSite: "strict"`. Name production cookies `__Host-session_token` and `__Host-csrf_token`; prefix both with the full environment outside production. Override the complete Better Auth session-cookie name to prevent its prefix, duplicate suffix, and `__Secure-` prefix.

## Service Principals and API-Key Credentials

- Model service principals as organization-owned non-human identities that own assignable application ACL permissions. Better Auth API keys are immutable credentials that authenticate a linked principal; credentials own no user, account, member, session, or permission state.
- Treat the `userId` passed during Better Auth issuance only as the administering session required by the plugin. It never binds the credential to that user. Keep API-key sessions disabled, and never let a credential administer principals or credentials.
- Require `servicePrincipal.read` for credential context, plus `apiKey.read`, `apiKey.create`, or `apiKey.delete` for credential list, issue, or revoke respectively. Reserve nonassignable `apiKey.update` for plugin compatibility because credentials cannot be changed or re-enabled.
- Configure each audience explicitly with a fixed prefix, database-backed hashing, bounded name/expiry, one reviewed header, and no plugin quota, limiter, metadata, secondary storage, or session fallback.
- Return the raw key only from a successful create response with `Cache-Control: no-store`. Never log, audit, cache, persist in browser storage, or redisclose the raw key or its stored hash.
- Require a UUIDv7 idempotency key for credential issuance and claim it durably through the organization/principal-scoped issuance ledger before invoking Better Auth. Return the raw key only to the winning `201` response; a completed duplicate returns safe metadata with `outcome: 'alreadyIssued'` and never rediscloses the key. Pending, failed, or changed-input claims never issue again.
- Verify the required audience once, clear the presented raw key immediately, load the linked enabled principal through credential, organization, and audience predicates, then intersect principal permissions with the current ACL API-key-assignable catalog. Require the audience root `access` permission plus an endpoint-specific assignable permission.
- Validate the bounded key format before limiter, database, ACL, or Better Auth initialization. Return the same generic `401` for missing, malformed, invalid, revoked, disabled, unlinked, and wrong-audience credentials; use `403` only for an authenticated linked principal that lacks effective authorization. Never accept cookies, sessions, query parameters, or `Authorization` as fallback.
