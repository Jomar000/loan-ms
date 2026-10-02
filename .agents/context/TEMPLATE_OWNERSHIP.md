---
name: TEMPLATE_OWNERSHIP
description: Source-template identity and comparative branch capability boundaries.
---

# Template Branch Capabilities

## Capability Profiles

| Capability                               | `fullstack_postgres`                                                         | `fullstack_d1`                                                                        | `landing_static`                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Workspace surface                        | Public and backoffice web apps, both Worker APIs, and all shared packages    | Same as `fullstack_postgres`                                                          | Public web app and shared UI only                               |
| HTTP contracts and frontend behavior     | Complete reference behavior                                                  | Same as `fullstack_postgres`                                                          | Static landing behavior; no backend-dependent application flows |
| Persistence                              | Drizzle-managed PostgreSQL through Hyperdrive                                | Drizzle-managed Cloudflare D1 shared by both APIs                                     | None                                                            |
| Authentication and authorization         | Better Auth, organizations, sessions, and role-based access                  | Same as `fullstack_postgres`                                                          | None                                                            |
| Object storage, notifications, and audit | Complete reference behavior                                                  | Same as `fullstack_postgres`                                                          | None                                                            |
| Realtime transport                       | Hibernating Durable Objects, authorization-aware fan-out, and query recovery | Same as `fullstack_postgres`                                                          | None                                                            |
| Profile-specific infrastructure          | PostgreSQL adapters, migrations, transaction semantics, cleanup, and tests   | D1 adapters, bindings, migrations, atomicity strategies, cleanup ownership, and tests | Browser-safe two-workspace tooling and landing-safe CSP         |

`fullstack_postgres` is the complete source-template capability baseline.
`fullstack_d1` retains the same application features, workspace topology,
and external contracts; its only profile-level difference is the backing
database and the internal infrastructure required by D1.

`landing_static` is the stripped frontend-only capability profile. It retains the
public static surface and shared design system while excluding backoffice, API,
database, authentication, object-storage, notification, audit, realtime, and
backend test/environment capabilities.
