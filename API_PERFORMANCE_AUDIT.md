# API request performance

Reviewed on 2026-11-11. Changes are prepared locally; no deployment or remote
database migration was performed.

## Verified improvements

The counts below cover route data queries, excluding authentication, session,
and middleware queries. Previous counts are derived from the original code;
new counts are asserted by Worker integration tests against isolated D1.

| Request                   | Previous data-query work                                               | Current data-query work                                                 |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Loan product page         | Count, page, then one reread per product: `2 + N` statements           | 2 statements in one batch, with the full public projection              |
| Loan page                 | Count, page, then one reread per loan: `2 + N` statements              | 2 statements in one batch, with borrower names and loan snapshots       |
| Renewal page              | Count, page, then one reread per renewal: `2 + N` statements           | 2 statements in one batch, with both loan references                    |
| Payment history           | Count, page, then receipt and allocations per row: `2 + 2N` statements | 3 statements for 1–99 payments; 4 for 100 payments, in two batches      |
| Report summary            | 4 sequential aggregates, scanning the ledger twice                     | 3 aggregates in one batch, scanning the ledger once                     |
| Collector schedule        | Load assignments, then bind every assigned loan ID into a second query | 1 statement with a tenant-scoped assignment subquery                    |
| Borrower page             | Separate count and page requests to D1                                 | Count and page in one batch, with a deterministic ID tie-breaker        |
| Company-fund transactions | Load the page, then all matching IDs to count them                     | SQL count and page in one batch; no full ID list returned to the Worker |

A 25-payment page now uses 3 data statements instead of 52. Loan, product, and
renewal pages with 25 rows use 2 instead of 27. These are reductions in database
work, not production latency measurements.

Payment allocations use chunks of 99 receipt IDs, reserving one parameter for
the tenant. Tests exercise the full 100-payment page and verify every statement
stays within D1's 100-bound-parameter limit. A collector test exercises 101
assignments and checks that only assigned collections are returned. See
[Cloudflare's D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Joined public IDs have explicit SQL aliases because the installed Drizzle D1
batch adapter maps result objects back into ordered values. Duplicate SQL column
names would otherwise overwrite values before date and field decoding. Tests
check receipt allocations, loan snapshots, renewal references, and nullable ledger
references after batching.

## Database indexes

The generated incremental migration is
`packages/database/src/d1/migrations/default/00000000000002_api_performance_indexes.sql`.
It adds five indexes without rewriting existing migrations or data:

- `borrower_idx_recent`: tenant, creation time, ID.
- `loan_idx_recent`: tenant, creation time, ID.
- `payment_idx_recent`: tenant, creation time, ID.
- `loan_renewal_idx_recent`: tenant, processing time, ID.
- `capital_transaction_idx_period`: tenant, transaction time, ID.

Before these indexes, local SQLite plans used temporary B-trees for the four
unfiltered tenant page sorts, and period totals searched by tenant alone. D1
`EXPLAIN QUERY PLAN` regressions now verify that each recent-page index removes
the temporary sort and the ledger index constrains both date bounds. Report
predicates include only supplied date bounds so the range is usable by the
index. Unbounded, lower-only, upper-only, and two-sided report filters are covered.

Indexes add some storage and write-maintenance cost. Existing databases need the
new migration applied through the public API's migration owner before receiving
the index benefits. Remote application requires separate human approval under
`AGENTS.md`.

## Browser requests

Payment creation/reversal, loan approval/release, and their consuming pages now
have one owner for refreshes: the mutation's awaited cache invalidation. Removed
the additional page-level refetches that repeated the same reads after successful
mutations. Related query families refresh in parallel and remain tenant-scoped.

Payments, renewals, releases, and fund mutations also invalidate the affected
company-fund and report queries, so the financial dashboard updates without an
extra manual reload. Query tests assert the affected tenant families are each
invalidated once.

The existing query clients already deduplicate shared query keys, disable
automatic query retries, and use a five-minute default freshness window. Session
and CSRF initialization already share the heartbeat flow. These mechanisms were
retained. Object-storage attachment paths already prefetch records and sign URLs
in parallel; the inspected loops do not perform a database reread per attachment.

## Files changed for this work

Backend routes under `apps/api-backoffice/src/core/api/`:
`borrowers.ts`, `collections.ts`, `companyFund.ts`, `loans.ts`, `payments.ts`,
`renewals.ts`, and `reports.ts`.

Database: `packages/database/src/d1/schema.ts` and the incremental migration above.

Browser query modules under `apps/web-backoffice/src/lib/modules/`:
`companyFund/queries.ts`, `loan/queries.ts`, `payment/queries.ts`, and
`renewal/queries.ts`. Consuming components:
`borrower/components/BorrowerProfilePage.svelte`,
`loan/components/LoanDetailPage.svelte`,
`payment/components/CollectionsPage.svelte`, and
`payment/components/PaymentHistoryTable.svelte`.

Regression coverage: backoffice API `borrowers.seq.test.ts`,
`companyFund.seq.test.ts`, `loans.seq.test.ts`, `payments.seq.test.ts`,
`renewals.seq.test.ts`, new `reports.con.test.ts`, and shared
`queryPerformance.shared.ts`; public API `integration/d1Migrations.seq.test.ts`;
the four browser query modules' `queries.con.spec.ts` files.

## Validation

- Backoffice API: 27 affected sequential cases and 4 report cases passed.
- Shared database: all 8 migration/constraint/query-plan cases passed through
  the public API's isolated D1 setup.
- Browser: 10 query utility cases and 44 affected component cases passed.
- Backoffice API and web type checks passed; Svelte reported zero errors and
  warnings. All four changed Svelte components passed the local autofixer.
- Database schema check, build, and lint passed.
- Backoffice API and web lint passed; the changed public API test passed ESLint.
- Backoffice Worker dry-run build and static web production build passed.
- Working-tree diff whitespace check passed.

## Measurement limits

The audit focused on database access patterns and browser request coordination
across the repository, with changes concentrated in the lending and collection
workflows. It does not establish a production p50/p95 latency or maximum supported
traffic level for every endpoint. Live D1 size, region, contention, cold starts,
device/network conditions, and external storage or email services still affect
response times. Production profiling is needed to quantify those effects after
an approved migration and deployment.
