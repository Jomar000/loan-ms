---
name: validator-patterns
description: Project rules for Zod request/response contracts, shared fields and refinements, surface ownership, and validator exports. Use when changing schemas, field validators, refinements, response helpers, or validator package exports.
---

# Validator Patterns

## Last Comprehensive Audit Timestamp

`2026-09-17T23:54:50+08:00`

## Related Skills

* Load `database-patterns` for persistence shape, `hono-patterns` for routes/responses, `auth-implementation` for auth contracts, `audit-trail-patterns` for audit registries and API contracts, `svelte-data-forms` for frontend handling, and `monorepo-troubleshooting` for dependencies/exports.

## Package and Shared Exports

`@PROJECT_NAME/validator` depends on `@PROJECT_NAME/types` through TypeScript project references. Keep it runtime-safe across backend/frontend boundaries and never import database code.

Shared exports live at `@PROJECT_NAME/validator/shared`:

| Source | Exports and rules |
| --- | --- |
| `packages/validator/src/shared/field.ts` | `vBoolean(fieldName)`, `vBigInt({ fieldName, message, min, max })`, `vInt({ fieldName, message, min, max })`, `vIsoDate(fieldName)`, `vIsoDateTime(fieldName)`, `vNumeric({ fieldName, message, min, max })`, `vSha256(fieldName)`, and `vText({ fieldName, message, min, max })`. Use them for supported boolean, safe bigint-range integer, integer, strict ISO calendar dates, explicitly zoned ISO date-times, numeric, lowercase SHA-256, and bounded text; use raw `z.*` only for unsupported literals, unions, formats, transforms, or domain refinements. |
| `packages/validator/src/shared/base.ts` | `postalAddressInputSchema`, `readManyInputSchema`, `outputSchema<Data>`, `cursorPaginatedOutputSchema<Data, Cursor>`, and `paginatedOutputSchema<Data>`. |
| `packages/validator/src/shared/refinement.ts` | `password()`, `uniqueArrayValues()`, and `updatedFields()` `.check()` callbacks. `password()` checks uppercase, lowercase, numeric, and symbol. `updatedFields()` requires at least one non-excluded field whose parsed value is not `undefined`; it rejects `{}` and excluded-only objects with `Nothing to update.`, while `null`, `false`, `0`, and `''` count as supplied values. Omit the refinement when empty updates are intentional. |

`readManyInputSchema` is the sole authority for root `limit`, `offset`, and `sortOrder` defaults; domain schemas compose rather than redefine them. `paginatedOutputSchema` requires `count`, `limit`, and `offset`.

`cursorPaginatedOutputSchema(data, cursor)` returns the shared error or `{ success: true, data, error?: null, limit, nextCursor }`. `nextCursor` uses the supplied schema and is `null` on the final page; cursor pagination replaces offset `count`/`offset`, and shared `TApiResponseCursorPaginatedOk<T>` and `TApiResponseCursorPaginated<T>` type it as `string | null`.

Output helpers are contract artifacts; they do not require runtime parsing of every API response.

## Retrieval Schemas

For QUERY contracts with domain-selection input, compose a domain `filtersSchema` regardless of route/handler name:

```typescript
const filtersSchema = z.object({
    publicId: z.string().optional(),
    isDisabled: z.boolean().optional(),
})

export const resourceReadInputSchema = z.object({
    filters: filtersSchema,
})

export const resourceReadManyInputSchema = readManyInputSchema.extend({
    filters: filtersSchema.default({}),
})
```

* Require `filters` for single-result QUERY domain selection. For lists with optional filters, default omitted `filters` to `{}`; use `readManyInputSchema` directly only for an intentionally filterless QUERY list.
* Keep pagination/sorting at the root and domain filters under `filters`. Compose filtered lists with `readManyInputSchema.extend(...)`.
* For GET below the `hono-patterns` QUERY boundary, keep path/query scalar fields at the root; never add `filters` only for convention.
* Preserve tri-state booleans: omitted means all, `false` enabled, `true` disabled. Use native JSON booleans/arrays, never CSV or query-string encodings.
* Do not expose/accept bigint identity fields, internal/foreign-key IDs, or `createdAt`/`updatedAt` by default. Use `publicId` or a non-bigint domain identifier already declared by an existing public contract; allow another field only when the contract explicitly requires it.
* For intentional exceptions such as high-volume limits, define the difference in the endpoint validator, document the reason beside it, and test defaulted, explicit, and invalid input. Never override validator defaults in handlers/query factories.
* For bulk-by-identifier endpoints, validate every identifier with `z.uuid`, bound the array with `.max`, and dedupe identifiers in the handler before comparing the requested count with the matched count so duplicates cannot cause a false mismatch.
* For whole-range endpoints that return every row in a bounded range, bound the range with `.check` (for example a maximum span) and omit `limit`/`offset`. Test the accepted maximum and the first rejected value.

## Domain Organization and Exports

| Surface | Package/path |
| --- | --- |
| Public | `@PROJECT_NAME/validator/public/*` and `packages/validator/src/public` |
| Backoffice | `@PROJECT_NAME/validator/backoffice/*` and `packages/validator/src/backoffice` |

Existing groups include `auth`, `user`, `admin/user`, and `objectStorage`. Place a schema under the API/app surface owning its contract.

When adding or changing validators:

1. Update the owning `*.schema.ts` using shared fields, bases, and refinements.
2. Declare dependencies before dependents and alphabetize independent direct exports.
3. Re-export from the nearest `index.ts` with the same dependency/alphabetization order.
4. Add a `package.json` export only for a new consumable subpath, never for a named schema already inside one.
5. Run `pnpm --filter=@PROJECT_NAME/validator build`, subject to the pnpm failure boundary in `monorepo-troubleshooting`.

## Idempotency and Contract Safety

For each client-retryable create identified by `hono-patterns`, require `idempotencyKey` and validate it with `z.uuidv7(...)`. Coordinate the nullable persistence column with `database-patterns` and retry behavior with `svelte-data-forms`. Exempt only atomic conditional-write status transitions.

* Use shared Zod validators for request contracts and keep public/backoffice schemas separated.
* Share equivalent logic across surfaces; duplicate only intentionally different contracts.
* Align error/output schemas with shared response types and explicit projections so internal identity fields/timestamps do not leak.

## Rate-Limit Key Safety

* Validate format and byte-safe bounds for every request-derived limiter key part.
* Before limiter use, normalize authentication email addresses to lowercase and limit them to 254 characters; reuse that schema for reset requests and reserved sign-up contracts.
* Accept password-reset and email-verification token key parts only as 1–512 ASCII `[A-Za-z0-9._-]` characters.
* Reject invalid or oversized key parts with the normal `DATA_VALIDATION` 400 response before CAPTCHA, limiter, database, or authentication context work.

## Service-Principal and Credential Contracts

* Expose a reviewed audience enum and canonical permission record. At the server boundary, require the audience access permission and reject unknown, non-assignable, system, management, and other-audience grants.
* Use strict inputs scoped to the operation: principal creation accepts bounded trimmed name/description, reviewed audience, canonical permissions, and a UUIDv7 idempotency key; principal updates accept mutable name/description/permissions. Credential issuance accepts its principal ID, bounded trimmed name, expiry, and idempotency key; revocation accepts the required identifiers. Whole-day expiry is nullable at issuance, where `null` means no expiry. Exclude tenant, actor, configuration, prefixes, plaintext keys, hashes, enabled state, metadata, quotas, refills, counters, and plugin rate-limit settings.
* Return safe metadata from principal lists/updates and credential lists, and the raw key only from credential create success; never return its hash. Require at least one mutable field for principal updates. Credentials are immutable; expiry is selected only at issuance.
* Require UUIDv7 `idempotencyKey` for credential issuance. Model its create result as a discriminated union: `outcome: 'issued'` includes the one-time raw key, while `outcome: 'alreadyIssued'` contains only safe credential metadata. Never make the key optional on a shared undifferentiated response.
