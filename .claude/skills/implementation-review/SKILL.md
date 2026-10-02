---
name: implementation-review
description: >
  Review implementations for plan compliance, correctness, and unnecessary
  complexity. Use for implementation reviews, static sanity passes, or inspection
  of code and tests for simplification; not as an extra workflow for every edit.
---

# Implementation Review

## Last Comprehensive Audit Timestamp

`2026-09-26T09:22:44+08:00`

## Scope and Mode

Use supplied requirements or an approved plan as the contract. Do not invent
requirements or turn a focused review into a repository-wide audit.

Establish the requested files, revision, and mode before assessing findings:

- For staged changes, inspect `git diff --cached` and the index content with
  `git show :path/to/file`. When staged and unstaged versions differ, use the
  index versions of relevant contracts and callers too; do not attribute working
  tree fixes or defects to the staged patch. Read surrounding code as needed.
- A static review reports findings without edits or test execution. Read tests
  and their configuration as evidence; do not report them as executed. Report
  only findings by default when remediation has not been requested.
- When remediation is already authorized, make focused corrections and run
  affected verification under the owning skills. Do not ask for generic
  confirmation. Keep Git mutation and other operational approval boundaries.
- Remediating a staged patch does not authorize staging, reverting unstaged
  work, or overwriting it. Preserve unrelated edits and explain any difference
  between the reviewed index and verified working tree.

## Concrete Simplicity Checks

Prefer the simplest implementation that satisfies the actual contract. Trace
producer behavior and consumer requirements before recommending removal; fewer
lines alone are not evidence of improvement.

Inspect identity mappings, unnecessary object reconstruction, repeated
conversions, redundant branches, duplicate state, and abstractions that add
indirection without removing meaningful complexity. Reuse existing helpers when
their semantics fit; do not introduce a generic helper or framework for a small
local correction.

When runtime behavior is already correct, fix missing type information at the
producing boundary instead of adding runtime transformations. Type assertions do
not validate, convert, or decode values. Preserve necessary validation,
normalization, response projections, null handling, and security boundaries.

For example, a Drizzle selection already returns a native boolean, but a handler
maps every row, destructures and reconstructs it, and replaces the field with
`value === true`. Verify the runtime value, nullability, and complete response
projection first. If the mapping performs no real transformation, accurately type
the SQL expression (for example, `sql<boolean>` for a verified non-null boolean)
and return the selected rows directly, following
[Backend Query Access](../database-patterns/SKILL.md#backend-query-access).
This is not a ban on destructuring, mapping, or boolean normalization when they
perform a required transformation.

Assess mutation guards from each mutation's actual return and failure contract.
A mutation that throws on failure and guarantees success data may make a further
truthiness check redundant. Retain guards when successful results can be absent
or depend on the selected action. Adjacent handlers are not evidence that a guard
is unnecessary.

## Apply the Owning Rules

Load only specialists relevant to the reviewed behavior, including their mandatory
companions. Reference existing rules instead of maintaining a second rule set:

| Review concern | Owning guidance |
| --- | --- |
| Typed query output and runtime decoding | [Database: Backend Query Access](../database-patterns/SKILL.md#backend-query-access) |
| Explicit response projections and complete response unions | [Hono: Validation, Responses, and Imports](../hono-patterns/SKILL.md#validation-responses-and-imports), [Validator: Idempotency and Contract Safety](../validator-patterns/SKILL.md#idempotency-and-contract-safety) |
| Response narrowing, success UI, mutation results | [Data/forms: Typed Client](../svelte-data-forms/SKILL.md#typed-client-and-query-boundary), [Queries and Mutations](../svelte-data-forms/SKILL.md#queries-and-mutations) |
| User-facing failure messages, uncertain outcomes, refresh failures, recovery blockers | [Data/forms: Failure Handling and Recovery](../svelte-data-forms/SKILL.md#failure-handling-and-recovery) |
| Submission locks, all dialog dismissal paths, confirmed persistence, retries | [Data/forms: Safe and Idempotent Submissions](../svelte-data-forms/SKILL.md#safe-and-idempotent-submissions) |
| Observable behavior, actual accessible names, accurate mocks, fixture diagnosis | [Testing: Test Quality](../cloudflare-worker-testing/SKILL.md#test-quality) |
| Affected commands and proof that intended tests ran | [Testing: Running Tests](../cloudflare-worker-testing/SKILL.md#running-tests) |

Keep workflow-specific recovery choices in product documentation. A POS invoice
flow does not establish a universal clear-selection, reload-page, or automatic
retry policy. If a reusable implementation rule is genuinely missing, identify
its native specialist owner before proposing it; never weaken vendored guidance.

## Findings and Verification

Report substantive findings with severity, precise file/line location, triggering
condition, impact, and the smallest suitable correction. Separate bugs,
repository-rule violations, and optional simplifications. Tie plan-compliance
findings to the supplied requirement. Omit speculative findings and stylistic
noise; clean code may require no findings.

State the reviewed scope/revision and verification limits. For remediation,
report corrections and affected checks actually run, including failures or
unverified behavior. Working-tree test results do not prove a divergent staged
snapshot passes. Do not execute tests in static-only mode or claim a test passed
because a selector discovered no tests.
