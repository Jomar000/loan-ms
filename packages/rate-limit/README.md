# `@loanms/rate-limit`

`@loanms/rate-limit` is LoanMS's reusable exact rate-limit coordination
package for Cloudflare Workers. It provides structured logical keys,
privacy-preserving HMAC routing, typed Durable Object RPC, an exact
sliding-window reservation ledger, and a SQLite-backed Durable Object base
class.

The package owns rate-limit mechanics rather than application policy. API
applications choose the protected actions, construct normalized key tuples,
define limits and windows, translate decisions into protocol responses, and
decide how dependency failures affect availability.

## Last Comprehensive Audit Timestamp

`2026-08-22T02:04:51.9310835+08:00`

## Core capabilities

- Exact sliding-window limits backed by one expiring reservation per accepted
  consume.
- Atomic per-key decisions inside a SQLite Durable Object.
- Persistent reservation ledgers that survive Durable Object eviction and Worker
  redeployment.
- Deterministic one-object-per-key-and-policy routing through HMAC-SHA-256.
- Structured tuple keys with explicit scopes and collision-safe boundaries.
- Application-owned policy limits, windows, and ledger epochs.
- Single-key and compensating multi-key consumption.
- Exact reservation release for dependency and infrastructure failures.
- Whole-key reset for successful authentication or other application-defined
  recovery.
- Millisecond retry timing derived from the earliest active reservation.
- Alarm-driven cleanup with correctness-independent lazy expiry pruning.
- Fail-closed persisted-ledger validation without automatic state repair.
- Privacy-safe decision logs that omit raw key parts and secrets.
- Standalone Worker ownership by default with explicit cross-Worker coupling.
- Runtime-agnostic client, policy, and transport modules.

## Versioning

Rate-limit transport and application policy versions have separate
responsibilities.

| Version                        | Responsibility                                                     | Bump rule                                                               | Effect                                                                                    |
| ------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `RATE_LIMIT_TRANSPORT_VERSION` | Canonical HMAC tuple format and Durable Object identity derivation | Bump when tuple serialization or object-routing behavior changes        | Creates a new object-name epoch and isolates all new requests from the previous transport |
| `TRateLimitPolicy.version`     | Application-controlled ledger epoch for one policy                 | Bump when an application intentionally replaces the active policy epoch | Produces a new HMAC target for that policy while leaving unrelated policies unchanged     |
| `TRateLimitPolicy.limit`       | Maximum active reservations for one exact sliding window           | Change only through the owning application's reviewed policy definition | Produces a distinct HMAC target because the limit is part of the canonical tuple          |
| `TRateLimitPolicy.windowMs`    | Lifetime of each accepted reservation in milliseconds              | Change only through the owning application's reviewed policy definition | Produces a distinct HMAC target because the window is part of the canonical tuple         |

`RATE_LIMIT_TRANSPORT_VERSION` is exported from
`@loanms/rate-limit/transport`. Policy versions are values in application
policy definitions rather than a package-wide constant.

## Architectural principles

### Mechanics and policy remain separate

The package accepts a logical key and policy:

```ts
type TRateLimitKey = Readonly<{
    scope: string
    parts: readonly string[]
}>

type TRateLimitPolicy = Readonly<{
    algorithm: 'sliding-window'
    limit: number
    version: number
    windowMs: number
}>
```

The package does not decide whether an identity, client network, tenant,
actor-target pair, endpoint, or other application concept should form the
key. It also does not choose HTTP status codes, headers, suppressed success
responses, or audit behavior.

### One logical tuple has one atomic owner

The client serializes this canonical tuple before HMAC derivation:

```text
[
    "rateLimit",
    RATE_LIMIT_TRANSPORT_VERSION,
    scope,
    parts,
    algorithm,
    policyVersion,
    limit,
    windowMs
]
```

HMAC-SHA-256 produces a 64-character lowercase hexadecimal object name. The
client resolves that name with `namespace.getByName()`, so every caller using
the same key, policy, transport version, and secret reaches the same Durable
Object. Different tuple boundaries, scopes, policies, versions, or secrets
resolve independently.

No global Durable Object serializes unrelated rate-limit keys.

### Raw key material stays outside Durable Object identity

The HMAC secret must contain at least 32 UTF-8 bytes. Raw key parts and the
secret are not sent through Durable Object RPC or written to SQLite. RPC keys
contain only the policy, scope, and the first 12 hexadecimal characters of the
HMAC as a privacy-safe diagnostic prefix; release requests additionally carry
the opaque reservation ID returned by the Durable Object.

Applications must still avoid logging raw credentials, identity values,
tokens, full client addresses, or the coordination secret before they call
the package.

## Structured keys

A key contains one stable scope and an ordered tuple of application-normalized
parts:

```ts
const key = {
    scope: 'auth.sign-in-identity-network',
    parts: [
        normalizedIdentity,
        normalizedClientNetwork,
    ],
} as const
```

Tuple serialization preserves array boundaries. For example, `['ab', 'c']`
and `['a', 'bc']` produce different object names.

### Key bounds

| Value                 | Contract                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| Scope                 | 1-64 lowercase letters, digits, dots, or hyphens; starts with a letter |
| Parts per key         | 1-8                                                                    |
| Individual key part   | 1-512 UTF-8 bytes                                                      |
| Serialized parts      | At most 2,048 UTF-8 bytes                                              |
| HMAC secret           | At least 32 UTF-8 bytes                                                |
| Durable Object name   | 64 lowercase hexadecimal characters                                    |
| Diagnostic key prefix | First 12 lowercase hexadecimal characters of the derived object name   |

The package validates these bounds before namespace routing. Applications
own semantic normalization, including identity casing, IP representation,
tenant identifiers, and action-specific tuple ordering.

## Policy definitions

Use `defineRateLimitPolicy` to validate and preserve a literal policy type:

```ts
import { defineRateLimitPolicy } from '@loanms/rate-limit/policy'

export const signInIdentityPolicy = defineRateLimitPolicy({
    algorithm: 'sliding-window',
    limit: 20,
    version: 1,
    windowMs: 10 * 60 * 1000,
})
```

The limit, version, and window must be positive safe integers. Milliseconds
are the only package time unit. Protocol adapters may convert a denied
`retryAfterMs` value at their boundary, such as rounding up to whole seconds
for an HTTP `Retry-After` header.

Policy values participate in object identity. A changed limit or window does
not reinterpret an existing ledger.

## Exact sliding-window ledger

Each Durable Object owns one SQLite table:

```text
rate_limit_reservation
    id          TEXT PRIMARY KEY
    expires_at  INTEGER NOT NULL
```

An accepted consume inserts one UUID reservation with
`expires_at = now + windowMs`. A request is allowed while the number of
unexpired reservations is below `limit`.

For a policy with `limit = 3`:

```text
consume 1 --> allowed, remaining 2
consume 2 --> allowed, remaining 1
consume 3 --> allowed, remaining 0
consume 4 --> blocked until the earliest reservation expires
```

Every consume prunes expired rows before counting. The decision and accepted
reservation insert use synchronous local SQLite operations before the method
yields, preserving the Durable Object's per-object concurrency guarantee.
There is no external fetch, KV, R2, PostgreSQL, or other distributed storage
operation between evaluation and mutation.

Blocked requests create no reservation and do not extend the window. Their
`retryAfterMs` is the positive remaining lifetime of the earliest active
reservation. At exact expiry, that reservation is pruned and capacity becomes
available.

### Persisted-state validation

Every ledger summary used by `consume`, `release`, or `alarm` must satisfy one
of two shapes:

- an empty ledger has a non-negative safe-integer count of zero and `null`
  earliest/latest expiries; or
- a populated ledger has a positive safe-integer count, safe-integer
  earliest/latest expiries, and `earliestExpiry <= latestExpiry`.

A malformed summary fails closed before the package returns a decision or
schedules cleanup. The Durable Object emits a privacy-safe storage-validation
event and throws without automatically repairing, deleting, or resetting the
malformed ledger. Normal expiry pruning or an explicitly requested exact
release may already have occurred before summary validation. A client RPC
surfaces the failure as `RateLimitUnavailableError`.

`reset()` remains the explicit whole-key recovery operation. It does not read
the malformed summary before deleting the target ledger and stored state.

## Client operations

Create one request-scoped or application-scoped client from a namespace and
secret:

```ts
import { createRateLimiter } from '@loanms/rate-limit/client'

const limiter = createRateLimiter({
    namespace: env.LOANMSPUB_DO_RL,
    secret: env.CF_DO_RATE_LIMIT_SECRET,
})
```

### Consume

```ts
const result = await limiter.consume({ key, policy })

if (!result.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
}
```

An allowed result contains:

```ts
{
    allowed: true
    remaining: number
    reservation: {
        key: TRateLimitKey
        policy: TRateLimitPolicy
        reservationId: string
    }
    retryAfterMs: 0
}
```

A blocked result contains:

```ts
{
    allowed: false
    remaining: 0
    retryAfterMs: number
}
```

### Multi-key consumption

`consumeMany` evaluates one or more independent inputs concurrently. This
supports composite application policies such as identity-only plus
identity-and-network limits.

```ts
const result = await limiter.consumeMany([
    { key: identityNetworkKey, policy: identityNetworkPolicy },
    { key: identityKey, policy: identityPolicy },
])
```

When every consume succeeds, the result contains all reservations. If any
input blocks, the client attempts to release accepted siblings and returns the
largest blocking `retryAfterMs`. If any dependency fails, the client attempts
the same compensation and rethrows the failure.

Compensation is best effort. A failed compensating release can retain an
accepted sibling until its normal expiry, causing temporary over-throttling
rather than additional capacity.

### Release

`release` removes only the reservation named by an accepted result. It does
not clear another request's reservation.

```ts
await limiter.release(result.reservation)
await limiter.releaseMany(result.reservations)
```

Use exact release only when the application decides an accepted attempt must
not consume capacity, such as after an infrastructure dependency fails. Do
not release user-controlled failures when they are intended to count.

`releaseMany` waits for every mutation and throws an `AggregateError` when one
or more releases fail.

### Reset

`reset` removes every reservation for one exact key and policy target.

```ts
await limiter.reset({ key, policy })
await limiter.resetMany([{ key, policy }])
```

Applications can reset failure buckets after a successful authentication or
another reviewed recovery event. `resetMany` throws an `AggregateError` when
one or more resets fail.

## Expiration and cleanup

Correctness does not depend on alarms. Every consume, release, and alarm
prunes reservations whose expiry is less than or equal to the current time.

An accepted consume schedules the alarm for the latest active reservation
expiry. Alarm handling:

1. ensures the SQLite schema exists;
2. deletes expired reservations;
3. reschedules itself for the latest remaining expiry; or
4. drops the reservation table and deletes stored state when no reservation
   remains.

Repeated or late alarms are safe because cleanup evaluates the current ledger
rather than deleting a remembered window blindly. A newly accepted
reservation therefore determines the next active cleanup time.

## Failure model

The package distinguishes configuration failures from unavailable rate-limit
infrastructure:

| Error                         | Meaning                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `RateLimitConfigurationError` | A key, policy, secret, scope, key prefix, reservation, or expiry violates the package contract |
| `RateLimitUnavailableError`   | Namespace resolution or Durable Object RPC failed                                              |
| `AggregateError`              | One or more explicit release or reset mutations failed                                         |

The package does not convert failures into an allowed decision. Applications
choose their protocol response and normally fail closed for
authentication-sensitive flows. The client adds no independent RPC timeout;
runtime and application request deadlines own timeout behavior.

A malformed persisted-ledger summary is an infrastructure failure rather than
an application configuration error. The server throws after logging the
validation failure, and the client converts that rejected RPC into
`RateLimitUnavailableError`.

## Observability

The Durable Object logs one structured `RATE_LIMIT_DECISION` event for each
allowed or blocked consume:

```ts
{
    type: 'RATE_LIMIT_DECISION'
    decision: 'allow' | 'block'
    keyPrefix: string
    limit: number
    remaining: number
    scope: string
}
```

The HMAC prefix supports correlation of unusually hot logical targets without
exposing raw tuple parts. Logs omit the coordination secret, reservation IDs,
and raw application identifiers.

Malformed persisted summaries emit a structured error event:

```ts
{
    type: 'RATE_LIMIT_STORAGE_VALIDATION_FAILED'
    operation: 'alarm' | 'consume' | 'release'
    keyPrefix?: string
    scope?: string
}
```

Request-driven validation includes the privacy-safe HMAC prefix and scope.
Alarm validation omits them because raw key material and derived routing
metadata are not persisted for cleanup. The event never includes malformed
stored values.

Applications own distinct configuration/unavailable response codes, mutation
failure logs, request correlation, metrics aggregation, and alerting.

## Package boundaries

`@loanms/rate-limit` depends only on the Worker-safe `@loanms/errors`
package. Worker-facing modules otherwise use Web Crypto and Cloudflare Durable
Object APIs without Node-only APIs or direct environment access.

| Owner              | Responsibility                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Rate-limit package | Policy/key validation, HMAC routing, typed client operations, reservation mechanics, SQLite persistence, alarms   |
| API applications   | Protected actions, policy values, normalized tuple parts, bindings, secrets, HTTP behavior, logging, and auditing |
| Cloudflare edge    | Volumetric abuse controls, WAF rules, bot controls, and infrastructure-level traffic protection                   |
| Better Auth        | Authentication behavior invoked after application-owned throttling permits the reviewed request                   |

The package is not a Better Auth `rateLimit.customStorage.consume` adapter.
LoanMS keeps Better Auth's generic limiter disabled and applies reviewed
application-level policies around selected server-side authentication flows.
Plugin-defined or default Better Auth rate-limit rules do not automatically
flow through this package.

## Public subpaths

The package exposes behavior-focused subpaths:

| Subpath                        | Purpose                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `@loanms/rate-limit/client`    | Namespace client, single/multi-key operations, errors, and public result types |
| `@loanms/rate-limit/policy`    | Policy contract, validation, and `defineRateLimitPolicy`                       |
| `@loanms/rate-limit/server`    | SQLite Durable Object base class and typed RPC request/response contracts      |
| `@loanms/rate-limit/transport` | Structured key validation, transport version, and HMAC target derivation       |

Internal `errors.ts` and `types.ts` modules are not package subpaths. Their
established public symbols are re-exported through the client or server
subpaths.

## Durable Object integration

Each owning API application exports a thin concrete class:

```ts
import { RateLimitBase } from '@loanms/rate-limit/server'

import type { THonoBindings } from '../../types.js'

export class RateLimit extends RateLimitBase<THonoBindings> {}
```

Wrangler declares the class with SQLite storage and binds the local namespace:

```toml
[exports.RateLimit]
type = "durable-object"
storage = "sqlite"

[[durable_objects.bindings]]
name = "LOANMSPUB_DO_RL"
class_name = "RateLimit"
```

Public and backoffice APIs own local `RateLimit` classes, `_DO_RL` bindings,
policy definitions, and `CF_DO_RATE_LIMIT_SECRET` values by default. This
topology lets either Worker deploy independently.

Intentional cross-Worker coupling is a deployment concern. A consumer may
point its `_DO_RL` binding at an owning Worker with `script_name` only after
the package implementation, complete policies, policy versions, and
coordination secret match. Deploy the owner before the consumer. The package
contains no surface name or binding-name dependency.

## Verification

Run package commands from the repository root:

```bash
pnpm --filter=@loanms/rate-limit check
pnpm --filter=@loanms/rate-limit lint
pnpm --filter=@loanms/rate-limit test:con
pnpm --filter=@loanms/rate-limit build
```

The package concurrency suite covers safe-integer policy bounds, HMAC
isolation, malformed key/secret rejection, and compensating multi-key client
behavior. Each API application's Worker suites cover repeated exact-maximum
concurrency, independent keys, concurrent expiry, short and long window
boundaries, release, reset, eviction persistence, idempotent and late alarms,
stored-state cleanup, malformed-state rejection, explicit recovery, and
authentication-route integration.

When package contracts change, check both API applications because they own
the concrete Durable Object subclasses and direct client integrations.

## Scope

The package intentionally does not provide:

- Cloudflare WAF, bot-management, or volumetric edge rate limiting;
- a Better Auth custom-storage adapter or automatic plugin-rule integration;
- Hono middleware or HTTP response schemas;
- authentication, authorization, CAPTCHA, or audit behavior;
- application-specific policy values or key normalization;
- fixed-window, token-bucket, or leaky-bucket algorithms;
- a global cross-Worker namespace by default;
- PostgreSQL, D1, KV, R2, or external-cache persistence;
- an application-level RPC timeout or retry policy;
- analytics storage, dashboards, or alert delivery.

These boundaries keep the package reusable for application-level limits while
leaving domain policy, deployment topology, and protocol behavior with their
owning applications.
