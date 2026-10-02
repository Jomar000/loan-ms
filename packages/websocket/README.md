# `@loanms/websocket`

`@loanms/websocket` is LoanMS's reusable realtime transport package for
Cloudflare Workers and browser applications. It provides a sharded Durable
Object WebSocket architecture, a registered server-push event protocol,
authorization-aware fan-out, cross-surface topology contracts, and a
reference-counted browser connection manager.

The package is designed for low-frequency application notifications and
query invalidation at large connection counts. Delivery is best effort:
authoritative application state remains behind authenticated HTTP queries, and
clients resynchronize after initial connection, reconnection, or an ordering
gap.

## Last Comprehensive Audit Timestamp

`2026-08-01T08:11:50.8803657+08:00`

## Core capabilities

- Separate `public` and `backoffice` realtime surfaces.
- One broker per organization, surface, and stream.
- A fixed ring of 64 Hibernating leaf Durable Objects per broker.
- Deterministic exhaustive admission probing across the leaf ring.
- An application-wide `APP` stream acquired eagerly by the authenticated
  session lifecycle, plus lazily acquired dedicated `(stream, target)`
  connections.
- Compile-time stream and event registration with Zod payload schemas.
- Server-to-browser `realtime.events.v1` frames.
- Organization, identity, and role audience filtering.
- Optional durable sequencing for organization-wide broadcasts.
- Durable authorization-version revocation with failed-leaf retries.
- Bounded fan-out concurrency, deadlines, publication rate limiting, and
  slow-client protection.
- A browser manager with connection sharing, reference counting, reconnects,
  event deduplication, gap detection, and session-boundary cleanup.
- Runtime-agnostic bootstrap, command-reconciliation, and refresh-group
  coordination primitives.
- Topology profiles for local, independent, shared-security, and shared-event
  deployments.
- Centralized constants, schemas, and shared contract types.

## Versioning

`realtime.events.v1` is the application-neutral registered server-push event
protocol. Application event names and payload schemas remain independently
owned by the downstream `realtime-contracts` package.

| Constant                     | Value                | Responsibility                                                                  | Bump rule                                                             | Migration effect                                                                                 |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `REALTIME_WIRE_VERSION`      | `realtime.events.v1` | Negotiation, shared frame envelopes, serialization, sequencing, and wire limits | Bump when clients and servers need a new wire contract                | Clients and servers must deploy support for the new `Sec-WebSocket-Protocol` token               |
| `REALTIME_STORAGE_VERSION`   | `1`                  | Persisted Durable Object scopes and Hibernation socket attachments              | Bump when persisted realtime state needs a new schema                 | Existing Durable Object state and attachments require migration, reset, or explicit read support |
| `REALTIME_TRANSPORT_VERSION` | `1`                  | Durable Object identities and deterministic shard-probe routing                 | Bump when object identity or admission routing must enter a new epoch | New object names and probe assignments isolate traffic from the previous transport epoch         |

The versions are independent even though all three currently represent their
first contract. A bump to one does not imply a bump to either of the others.
The wire constant is exported from `@loanms/websocket/protocol`; storage and
transport constants are exported from `@loanms/websocket/transport`.

## Architectural principles

### Server-push transport

Realtime-v1 WebSockets carry server-push frames only. Browser commands and
mutations travel through authenticated HTTP endpoints:

```text
browser HTTP mutation
    |
    +--> authenticate and authorize
    +--> validate input
    +--> execute an idempotent transaction
    +--> commit
    +--> construct a registered event
    +--> publish through the realtime broker
```

The WebSocket package does not provide a browser publication endpoint.
Application data received from a connected browser is rejected with policy
close code `1008`.

### Queries remain authoritative

WebSocket delivery is not durable replay, exactly-once delivery, or proof that
a mutation committed. The browser manager exposes readiness and recovery
callbacks so each application can:

- bootstrap its initial authoritative query state when the first `READY` frame
  arrives;
- invalidate and refetch when a replacement connection becomes ready;
- invalidate and refetch when an explicit or locally detected `GAP` occurs.

### Realtime query coordination

`@loanms/websocket/coordination` provides three browser- and Worker-safe
primitives. They invoke application callbacks but do not fetch data, define
events, compare domain versions, own query keys, or depend on TanStack Query.

`createRealtimeBootstrapCoordinator` subscribes to recovery notifications and
invokes `bootstrap` once. The first `READY` normally triggers bootstrap; a
configurable timeout (five seconds by default) provides the fallback. When the
timeout wins, the later first `READY` is reported through `recover` as
`ready-after-timeout`. Subsequent `GAP` and reconnect `READY` notifications
also invoke `recover`. `dispose()` clears the timer and recovery subscription
idempotently.

`createRealtimeCommandReconciler<TExpectation, TEvent, TVersion>` starts
tracking an expectation before invoking its HTTP command, so a matching event
may arrive before or after the HTTP response. Callers provide expectation and
version matchers, event refresh, and timeout fallback callbacks. A matching
event cancels the fallback timer and the command resolves only after both the
HTTP response and event refresh succeed. When no event arrives after a
successful response, the fallback runs after the configurable timeout (five
seconds by default). Command, refresh, and fallback failures reject the
returned promise. `dispose()` unsubscribes and rejects pending commands with
`RealtimeCommandReconcilerDisposedError`.

`createRealtimeRefreshCoordinator<TGroup, TVersion>` unions groups requested
in one microtask and passes the ordered union to the caller's `execute`
callback. Requests received during an active pass form at most one trailing
union. Successfully completed versioned requests enter a bounded ledger (256
entries by default), and the caller's `isVersionCovered` comparison determines
whether later requests can be suppressed. Unversioned requests always execute.
Execution failures reject the requests in that pass without preventing later
work.

### Physical surface isolation

Public and backoffice connections use separate Durable Object namespaces,
bindings, object identities, and connection routes. Cross-surface behavior is
explicitly enabled by a topology profile and a narrow publisher or remote
broker capability; a client cannot connect through one surface to enter the
other surface's connection namespace.

### Registered streams only

URL segments and browser input never become arbitrary stream or Durable Object
names. Applications compose a registry from the built-in `APP` stream and
explicit dedicated stream definitions.

## Sharded transport

The package uses a broker-and-leaf topology:

```text
browser
   |
   +-- APP connection ---------------------------+
   |                                             |
   +-- dedicated (stream, target) connection ----+--> authenticated API route
                                                       |
                                          exhaustive leaf probe
                                                       |
                                                       v
                                              leaf[0..63] socket

trusted server publication
   |
   v
stream broker --> bounded RPC fan-out --> 64 leaves --> matching sockets

authorization revocation
   |
   v
stream broker --> durable pending set --> 64 leaves --> matching sockets close
```

### Object scope

A persisted broker scope is:

```ts
{
    storageVersion: 1
    surface: 'public' | 'backoffice'
    organizationId: string
    stream: string
}
```

A persisted leaf scope inherits the broker scope and adds:

```ts
{
    topology: 'leaf'
    shardIndex: number
}
```

Targets are connection metadata rather than part of object identity. One
stream ring can therefore host many dedicated targets without creating a
separate 64-object ring for every target.

Collision-safe Durable Object names serialize the complete scope tuple:

```ts
createRealtimeBrokerObjectName(scope)
createRealtimeLeafObjectName(scope, shardIndex)

// transport version 1
// ["realtimeBroker",1,surface,organizationId,stream]
// ["realtimeLeaf",1,surface,organizationId,stream,shardIndex]
```

`storageVersion` validates persisted state; it is intentionally not the object
identity epoch. `REALTIME_TRANSPORT_VERSION` owns object names and probe
routing.

### Admission

Each connection is assigned a deterministic 64-entry probe order derived from
its server-created connection ID and trusted broker scope. The probe step is
always odd, so every leaf in the power-of-two ring is visited exactly once.

Every leaf performs the final scope, revocation, capacity, and
`acceptWebSocket()` decisions inside its Durable Object concurrency boundary.
Admission distinguishes:

- `WEBSOCKET_CAPACITY_UNAVAILABLE` when all 64 leaves explicitly report full;
- `WEBSOCKET_SHARD_UNAVAILABLE` when one or more probes fail for infrastructure
  or routing reasons.

### Capacity and transport limits

| Contract                            |             Value |
| ----------------------------------- | ----------------: |
| Leaves per ring                     |                64 |
| Socket soft cap per leaf            |             8,192 |
| Nominal sockets per ring            |           524,288 |
| Canonical server frame              | 8,192 UTF-8 bytes |
| JSON nesting depth                  |                16 |
| Aggregate JSON array/object members |               256 |
| Slow-client buffered threshold      |      65,536 bytes |
| Broker fan-out concurrency          |                 6 |
| Broker fan-out deadline             |          5,000 ms |
| Server publication rate             |      2 per second |
| Server publication burst            |                 5 |

The leaf soft cap is an admission control independent of object naming.
Practical capacity and publication rates are validated for each deployed
environment through representative load testing.

The base classes supply the table's defaults through protected publication,
fan-out, deadline, and leaf-cap methods. Application overrides must provide a
finite non-negative publication rate, finite integer burst and leaf cap of at
least one, fan-out concurrency from 1 through 64, and a positive integer
deadline supported by the runtime timer. Invalid values fail unavailable
before fan-out or admission; invalid publication configuration does not write
rate-bucket state. Forks that do not override these methods retain the template
defaults. Stored bucket tokens are clamped to the active burst, so changing a
validated limit does not require a Durable Object storage migration.

## Stream registry

The registry describes every accepted stream and event family.

### Built-in `APP` stream

`APP` is the package's application-wide stream. It:

- uses one tenant-wide browser connection for application-global events;
- accepts no target;
- carries organization-delivery events that may select organization, identity,
  or role audiences;
- uses the `active_tenant` recovery policy;
- closes immediately after its last browser owner releases it;
- is reserved and cannot be replaced by a dedicated definition.

The built-in registry contains the `APP` substrate without application event
definitions. API applications compose their own registry by supplying
surface-specific `appEvents`.

### Dedicated streams

A dedicated stream definition supplies:

- a stable uppercase wire name;
- a bounded lowercase metrics label;
- a target Zod schema that validates and normalizes targets;
- an authorization-policy identifier;
- a recovery-policy identifier;
- registered event definitions;
- an idle-retention duration for an unowned browser connection.

Each acquired `(stream, target)` pair uses an additional feature-scoped browser
connection. Equivalent acquisitions share that connection through the browser
manager's reference counting.

Target syntax and target authorization are separate. The registry normalizes
the target first; the API then invokes the registered authorization callback
with trusted admission context before upgrading the connection.

### Event definitions

Each event definition declares:

- allowed audience kinds: `organization`, `identity`, or `role`;
- delivery mode: `organization`, `target`, or `both`;
- a Zod payload schema.

Registry construction rejects invalid delivery values, missing or non-Zod
payload schemas, and missing or non-Zod dedicated target schemas so malformed
runtime definitions fail during startup rather than first use.

The protocol validates both the frame envelope and the registered event/payload
pair before serialization, broker acceptance, or browser dispatch.

### Wire bounds

| Value                                             | Contract                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Stream wire name                                  | 1–32 uppercase letters, digits, or underscores; begins with a letter |
| Event name and error code                         | 1–64 uppercase letters, digits, or underscores; begins with a letter |
| Metrics, recovery, and authorization-policy label | 1–32 lowercase letters, digits, or underscores; begins with a letter |
| Target                                            | 1–256 characters after stream-specific normalization                 |
| Opaque organization or identity value             | 1–256 characters                                                     |
| Transport role                                    | 1–64 characters                                                      |
| Roles per socket attachment                       | 1–8 unique values                                                    |
| Values per identity or role audience              | 1–64 unique values; role values use the transport role bound         |
| Shard index                                       | 0–63                                                                 |

Registry helpers include:

```ts
defineRealtimeEvent(definition)
defineRealtimeStream(definition)
createRealtimeRegistry({ appEvents, streams })
createRealtimeTargetAuthorizer(registry, handlers)
resolveRealtimeAdmission(input)
```

### Fork-owned realtime contracts

A downstream fork that adds custom `APP` events or dedicated streams should
keep those domain contracts outside `@loanms/websocket`. When the API and
browser need the same registry, create one fork-owned workspace at
`packages/realtime-contracts`, named `@PROJECT_NAME/realtime-contracts`.

This is one package for the fork's shared realtime contract set, not one package
per stream or socket. A fork that uses only the empty built-in `APP` registry
does not need this package.

The realtime-contracts package owns:

- event and stream names;
- payload and target schemas;
- stream definitions and public/backoffice registries;
- recovery-, metrics-, and authorization-policy identifiers.

It must remain Worker- and browser-runtime-safe. Database access, authorization
handlers, publication side effects, environment bindings, and frontend recovery
behavior remain in their owning API or web application.

Both runtimes import and inject the same registry:

```ts
import { publicRealtimeRegistry } from '@PROJECT_NAME/realtime-contracts'

// API Durable Object
class WebSocketServer extends WebSocketServerBase<Environment> {
    protected getRealtimeRegistry() {
        return publicRealtimeRegistry
    }
}

// Browser application
const manager = createWsClientManager({
    getUrl,
    registry: publicRealtimeRegistry,
})
```

The browser manager must receive the same registry as the API. Without it, the
browser falls back to the built-in registry, whose `APP` stream defines no
events: every fork-defined `APP` event fails validation with `UNKNOWN_EVENT`
and is dropped before any `onFrame` or recovery callback runs. In the web
applications, inject the registry through the
`EXTENSION_APP_REALTIME_REGISTRY` seam in
`utilities/wsClientManager/registry.extension.ts`; a structural guard spec
fails when an event listed for invalidation is missing from that registry.

## Realtime event wire protocol

Clients negotiate:

```text
realtime.events.v1
```

The application-neutral registered server-push event protocol is an explicit
WebSocket subprotocol and is accepted only when offered by the client and
selected by the server.

### Server frames

All frames are discriminated by `type`.

#### `READY`

Sent immediately after leaf admission:

```ts
{
    type: 'READY'
    wireVersion: 'realtime.events.v1'
    stream: string
    target?: string
    connectionId: string
    authorizationVersion: string
}
```

#### `EVENT`

Carries a registered server event:

```ts
{
    type: 'EVENT'
    eventId: string
    stream: string
    target?: string
    event: string
    payload: unknown
    occurredAt: string
    sequence?: string
}
```

`eventId` is UUIDv7, `occurredAt` is an ISO datetime with an offset, and a
sequence is a positive decimal string. The registry narrows `payload` through
the event's Zod schema.

#### `GAP`

Signals non-contiguous ordered delivery:

```ts
{
    type: 'GAP'
    stream: string
    target?: string
    expected: string
    received: string
}
```

#### `ERROR`

Reports a bounded protocol error:

```ts
{
    type: 'ERROR'
    code: string
    recoverable: boolean
}
```

### Parsing and serialization

Protocol utilities:

- measure UTF-8 bytes with `TextEncoder`;
- reject oversized input before JSON parsing;
- enforce aggregate JSON depth and member limits;
- validate the frame discriminated union;
- verify the stream, target, event, delivery mode, and payload against the
  registry;
- serialize a canonical frame once for broker fan-out.

`serializeValidatedRealtimeServerFrame` returns the supplied validated frame,
its UTF-8 byte count, and the canonical serialized string. Leaves send that
same string without reconstructing the event.

## Publication and fan-out

Trusted server code publishes a transport-neutral descriptor containing:

- source and destination surfaces;
- organization and stream;
- optional target;
- event name, UUIDv7 event ID, and occurrence time;
- audience;
- projected payload.

Publication resolution validates routing before creating broker input. Target
normalization never mutates the caller's descriptor, and applications can
project a different bounded payload for each destination surface.

Rejection precedence is deterministic: descriptor shape, source surface,
destination surface, destination match, origin/source relationship, topology
route, organization, stream, event, event ID, timestamp, audience, and target.
The destination broker performs event-specific payload validation after
surface projection. Broker rejection codes distinguish invalid frames,
oversized frames, exhausted publication capacity, and unavailable fan-out.

The broker:

1. validates the RPC input and registry relationship;
2. verifies and normalizes the target;
3. validates the registered payload;
4. validates its immutable stored scope;
5. consumes durable publication capacity;
6. allocates a sequence when required;
7. serializes and size-checks the canonical frame;
8. loads active revocations;
9. fans out to all 64 leaves with bounded concurrency and a shared deadline;
10. validates leaf results before aggregation.

A healthy leaf with no eligible sockets is a successful fan-out target.
Partial leaf failure remains an accepted best-effort publication when at least
one leaf responds with a valid result. If no leaf succeeds, the broker returns
`FANOUT_UNAVAILABLE`.

### Sequence scope

Durable sequences are scoped by:

```text
(surface, organizationId, stream)
```

Only an organization-wide broadcast intended for every healthy subscriber in
that scope receives a sequence. Target-, identity-, and role-filtered events
remain unsequenced so intentionally excluded clients do not infer false gaps.

Sequences are persisted and transmitted as positive decimal strings. Browser
ordering arithmetic uses `BigInt` and never converts sequence values to
JavaScript numbers.

## Authorization and revocation

Network-facing authentication and permission checks belong to the API
application. The package receives trusted admission context containing the
organization, identity, roles, session expiry, surface, connection UUID, and
opaque authorization-version UUID.

### Hibernation attachment

Each admitted socket serializes stable routing and authorization metadata:

- `storageVersion: 1` and leaf topology;
- surface, organization, stream, and shard index;
- connection and authorization-version UUIDs;
- identity and roles;
- session expiration;
- negotiated `wireVersion: 'realtime.events.v1'`;
- normalized target.

The attachment contains no cookies, session tokens, payloads, or secrets.
Leaves can restore routing, filtering, expiry, and revocation behavior after
Hibernation without relying on in-memory maps.

### Durable revocation

A revocation directive identifies:

- a UUIDv7 operation;
- organization and identity;
- the revoked authorization-version UUID;
- the directive expiration time.

The broker records each operation with a durable set of pending shard indexes,
atomically schedules its retry or expiry alarm, and fans it out to all 64
leaves. Updated pending-shard state and its next alarm are also committed
together. Alarm reconciliation removes expired operations and clears the alarm
only when no active operation remains. Each leaf persists the blocked
identity/version pair before closing matching sockets. Reauthenticated sockets
carrying a replacement version are not affected.

Active revocations are included with subsequent publication calls. A leaf
persists all supplied directives in one batch, builds the blocked
identity/version set, and applies revocation, attachment validation, expiry,
filtering, backpressure, and delivery decisions in one socket traversal. The
public single-revocation RPC retains its replay contract.

Revocation persistence across database mutations and surfaces is coordinated
by the API and database layers. The package supplies idempotent broker and leaf
RPC contracts plus topology-driven revocation destinations.

## Browser connection manager

`createWsClientManager` creates one tab-local manager that can own multiple
physical sockets.

```ts
const manager = createWsClientManager({
    getUrl: (stream, target) =>
        target === undefined
            ? `/api/ws/${stream.toLowerCase()}`
            : `/api/ws/${stream.toLowerCase()}/${target}`,
    registry,
})

const app = manager.connectApp()
const dedicated = manager.connect('ACTIVITY', activityId)
```

### Ownership model

- `connectApp()` acquires the registered `APP` connection.
- `connect(stream, target)` acquires a normalized dedicated key.
- Concurrent acquisitions for the same normalized `[stream, target]` key share
  one physical socket and reconnect loop.
- Different targets use independent sockets and can coexist.
- Every acquisition receives its own subscription ownership.
- `release()` is idempotent and removes only that owner's callbacks.
- The final release closes immediately or after the stream's idle-retention
  interval.
- When idle retention is zero, the final release closes and removes the entry;
  a later acquisition creates a new physical connection.
- `disconnectAll()` closes every socket and cancels every timer.

### Connection behavior

The manager:

- requests the `realtime.events.v1` subprotocol;
- validates text frames before dispatch;
- deduplicates the latest 256 event IDs per connection key;
- tracks ordered sequences as `BigInt`;
- discards stale or duplicate ordered events;
- creates a local `GAP` when it observes a forward sequence jump;
- protects replacement sockets with generation tokens;
- retains active subscriptions across reconnects;
- isolates subscriber, telemetry, and every recovery callback failure;
- requires every frame-bearing stream to match its physical connection;
- requires exact targets for `READY`, `GAP`, and targeted events while
  retaining targetless organization events on dedicated streams;
- times out a connecting socket after 15 seconds;
- reconnects with a 2-second exponential base and 30-second cap, applying
  equal jitter from 50% through 100% of each capped delay;
- resets reconnect attempts after 30 seconds of stability.

A transport close preserves the referenced logical subscription entry and its
subscribers while the manager reconnects. Reconnection necessarily creates a
new physical socket and performs another HTTP `101` upgrade. Likewise,
reacquisition after a zero-retention final release creates a new connection.
Multiple `101` rows for one URL therefore represent distinct physical
handshake attempts, not reuse of one WebSocket.

### Session lifecycle

`createAppRealtimeLifecycle` integrates the manager with authenticated
session state:

- one active organization key owns one `APP` acquisition;
- repeated activation for the same organization is idempotent;
- tenant change disconnects all previous sockets before acquiring `APP`;
- authentication loss disconnects all sockets;
- disposal permanently releases the lifecycle;
- `onFrame` receives every validated `APP` frame (`READY`, `EVENT`, `GAP`, and
  `ERROR`) and detaches with the lease on tenant change, authentication loss,
  and disposal; filter to `EVENT` frames and leave gap and reconnect handling
  to the recovery callbacks;
- recovery callbacks remain application-owned.

Socket-owning effects must acquire and release from stable scalar scope values,
such as organization key, stream, and normalized target. A refresh that keeps
those values unchanged is not a lease boundary. Tenant changes, target
changes, consumer disposal, authentication loss, and physical transport
closure remain valid lifecycle boundaries.

## Topology profiles

The topology contract supports:

| Profile                     | Security revocation     | Ordinary events      |
| --------------------------- | ----------------------- | -------------------- |
| `local-only`                | Local enabled surface   | Local only           |
| `independent-surfaces`      | Local source surface    | Local only           |
| `shared-auth-security-only` | Local and peer surfaces | Local only           |
| `shared-auth-events`        | Local and peer surfaces | Direction-controlled |

`shared-auth-events` directions are:

- `public-to-backoffice`;
- `backoffice-to-public`;
- `bidirectional`.

Topology utilities derive revocation destinations and ordinary event
destinations. Capability validation requires:

- a remote broker for either shared-authorization profile;
- a realtime publisher when the active surface has an outgoing ordinary-event
  edge.

Local and independent profiles operate without cross-surface capabilities.

## Contract organization and validation

Shared contracts follow one dependency direction:

```text
constants.ts --> schemas.ts --> types.ts --> feature modules
```

### `constants.ts`

Owns the independent wire, storage, and transport versions; bounded names and
arrays; frame and JSON limits; shard and fan-out controls; publication
thresholds; and rejection-code tuples. It has no imports.

### `schemas.ts`

Owns reusable transport-neutral Zod schemas in dependency order:

- topology;
- registry names and fields;
- scopes, audiences, attachments, and revocations;
- protocol frames;
- broker and leaf RPC;
- cross-surface publications.

It imports only Zod, shared validator refinements, and package constants.

### `types.ts`

Owns cross-feature DTO and contract types. Schema-backed types use `z.infer`;
handwritten types describe registries, admission, authorization, publication,
protocol parsing, topology capabilities, and browser interfaces. Public types
used only by one feature may remain beside that feature's behavior.

### Feature modules

Feature modules own behavior and re-export their established contracts:

- `protocol.ts`
- `publisher.ts`
- `registry.ts`
- `topology.ts`
- `transport.ts`
- `client.ts`
- `coordination.ts`
- `server.ts`

Implementation-private constants, one-use schemas, stored-record types,
managed socket state, and environment constraints remain beside their
behavior.

### Zod boundary

Schema-representable contracts use centralized Zod validators:

- `z.uuid()` for connection and authorization-version identifiers;
- `z.uuidv7()` for event and revocation operation identifiers;
- positive decimal-string sequences;
- ISO datetimes with offsets;
- bounded names, targets, arrays, counts, shard indexes, and timestamps;
- shared uniqueness refinements where uniqueness is part of the contract.

Opaque wire identifiers use strict Zod strings and numbers. They are not
trimmed or coerced at transport boundaries.

Procedural validation remains intentionally local for behavior that is not a
declarative field contract:

- UTF-8 byte measurement;
- JSON parsing and aggregate complexity;
- temporal comparisons;
- registry relationships;
- topology routing;
- authorization decisions;
- rate-bucket arithmetic;
- sequence ordering;
- protocol-header tokenization;
- WebSocket connection state.

### Persisted-state validation

Durable Object state is parsed before use. Invalid scope, revocation, or
sequence state fails closed and is logged without exposing sensitive values.
Invalid scope and authorization state are not silently replaced. Invalid
sequence state makes publication unavailable. Token-bucket state uses a
bounded fresh-burst fallback so malformed rate metadata cannot create
unbounded capacity.

Broker aggregation validates each leaf RPC result. A malformed result is
treated as a failed fan-out target.

## Observability

Package logs are structured JSON with a top-level `type`. Lifecycle,
admission, publication, backpressure, storage validation, and revocation paths
emit bounded event names such as:

- `WS_CONNECT`, `WS_CLOSE`, `WS_CLOSE_ERROR`, and `WS_ERROR`;
- `WS_PUBLISH_REJECTED`;
- `WS_BROKER_RATE_LIMITED`;
- `WS_BROADCAST_COMPLETED`, `WS_BROADCAST_PARTIAL_FAILURE`, and
  `WS_BROADCAST_UNAVAILABLE`;
- `WS_SLOW_CONSUMER_CLOSED`;
- `WS_AUTHORIZATION_REVOKED`, `WS_REVOCATION_PARTIAL_FAILURE`,
  `WS_REVOCATION_RETRY`, and `WS_REVOCATION_COMPLETED`;
- `WS_STORAGE_VALIDATION_FAILED`;
- `WS_TRANSPORT_GAUGE`.

Organization and Durable Object identities are represented by stable,
versioned hashes in package logs. Payload bodies, cookies, session tokens,
authorization-version values, and internal transport headers are not logged.
Target, identity, connection, organization, and event identifiers are not
metric-label dimensions. Close logs retain the close code but omit the
peer-provided reason. Transport gauges count the
`REALTIME_WIRE_VERSION` socket tag and deserialize only the accepted or closing
socket for scope dimensions.

The browser manager can emit bounded lifecycle telemetry through
`TRealtimeClientTelemetryEvent`.

The API applications expose mirrored `schedule*RealtimePublications` helpers
for optional source-side, log-derived metrics. Each failed destination emits a
`REALTIME_PUBLISH_ERROR` record with the bounded operation, destination,
failure code, and local or remote delivery type. Unexpected rejected promises
use `PROMISE_REJECTED` with an unknown destination and delivery. Scheduling is
post-commit and best effort, so these failures do not change a completed
business operation or HTTP response.

## Package boundaries

`@loanms/websocket` depends on `@loanms/errors`, `@loanms/types`,
`@loanms/validator/shared`, and Zod. Worker-facing modules remain
runtime-agnostic and do not import database code, Hono applications, frontend
state, TanStack Query, Node-only APIs, or direct environment access.

Integration responsibilities remain outside the package:

| Owner                           | Responsibility                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API applications                | Authenticated upgrade routes, trusted session conversion, target authorization, Durable Object exports and bindings, post-commit publication, cross-surface adapters |
| Web applications                | Manager construction, session lifecycle integration, feature acquisition/release, query invalidation                                                                 |
| Fork realtime-contracts package | Shared event names, payload and target schemas, stream definitions, registries, and policy identifiers                                                               |
| Database package                | Membership authorization versions, durable revocation outbox, transactional mutation and persistence-level idempotency                                               |
| Validator package               | Shared HTTP request/response schemas and reusable field validators                                                                                                   |
| Types package                   | Stable domain types that are not transport implementation details                                                                                                    |

LoanMS provides this domain-neutral publication foundation as the base
template. Consumer projects may freely add their own event contracts,
projections, and domain publisher wrappers; they can use or extend the API
schedulers without moving consumer-specific behavior into the template.

## Public subpaths

The package exposes behavior-focused subpaths:

| Subpath                          | Purpose                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `@loanms/websocket/client`       | Browser manager and `APP` session lifecycle                       |
| `@loanms/websocket/coordination` | Bootstrap, command, and refresh-group coordination                |
| `@loanms/websocket/server`       | Durable Object leaf and broker base classes                       |
| `@loanms/websocket/protocol`     | Frame validation, parsing, serialization, negotiation, and gaps   |
| `@loanms/websocket/publisher`    | Cross-surface descriptor resolution and publisher contracts       |
| `@loanms/websocket/registry`     | Stream/event composition, target authorization, and admission     |
| `@loanms/websocket/topology`     | Surface profiles, destinations, and capability validation         |
| `@loanms/websocket/transport`    | Object names, hashing, probing, guards, limits, and bounded tasks |

Internal `constants.ts`, `schemas.ts`, and `types.ts` modules are not package
subpaths. Their established symbols are re-exported through the relevant
behavior-focused API.

## Durable Object integration

API applications provide thin concrete classes:

- a leaf class extending `WebSocketServerBase`;
- a broker class extending `WebSocketBrokerBase` and returning the active
  surface's leaf namespace from `getLeafNamespace()`;
- optional `getRealtimeRegistry()` overrides when the application composes
  registered events or dedicated streams;
- optional limit overrides for controlled testing.

The leaf namespace is used only for admitted browser sockets. The broker
namespace is used only for trusted publication and revocation RPC.

Authenticated API routes conventionally expose:

```text
GET /api/ws/app
GET /api/ws/:registeredStream/:target
```

The `APP` route accepts no target. Dedicated routes require a target and apply
the stream's normalization and authorization contracts before attempting
leaf admission. Organization, identity, roles, authorization version, surface,
connection ID, shard order, and internal object name are server-derived.

## Verification

Run package commands from the repository root:

```bash
pnpm --filter=@loanms/websocket check
pnpm --filter=@loanms/websocket lint
pnpm --filter=@loanms/websocket test:con
pnpm --filter=@loanms/websocket build
```

When public contracts change, check the API and web workspaces that directly
consume the affected subpaths. API Durable Object behavior that requires one
shared Worker runtime is covered by each API application's WebSocket SRT
suite:

```bash
pnpm --filter=@loanms/api-public test:srt
pnpm --filter=@loanms/api-backoffice test:srt
```

## Scope

The package intentionally does not provide:

- durable ordinary-event replay;
- exactly-once delivery;
- queue-backed normal publication;
- high-frequency media or game-state streaming;
- browser-to-WebSocket application commands;
- arbitrary client-selected streams or object names;
- cross-tab socket leadership;
- database persistence or application-specific authorization policy;
- a concrete dedicated product stream.

These boundaries keep the package focused on scalable realtime signaling,
authorization-aware delivery, and deterministic client resynchronization.
