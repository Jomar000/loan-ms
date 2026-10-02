# Skill Upstream Provenance

This registry is the canonical record of skill ownership, upstream sources, and
applied source revisions for this repository. Keep this file identical at
`.agents/skills/PROVENANCE.md` and `.claude/skills/PROVENANCE.md`.

## Terminology

- **Repository-native**: authored and maintained in this repository without an
  external skill baseline.
- **Vendored-verbatim**: matches the recorded upstream source except for
  whitespace-only normalization. Repository-specific constraints belong in root
  instructions or repository-native companion skills.
- **Vendored-adapted**: based on a recorded upstream revision with deliberate
  repository-specific changes.
- **Applied revision**: the immutable upstream commit whose skill content was
  incorporated into the local copy.
- **Last checked revision**: the newest upstream commit reviewed for changes. It
  may be newer than the applied revision when the relevant upstream content did
  not change.

Source revisions identify skill content. They are separate from installed product
and tool versions.

## Vendored Skills

All links use canonical repositories and immutable commit revisions. The
previously registered skills were checked on `2026-09-26`;
`ui-ux-pro-max` was checked on `2026-09-27` (Asia/Manila).

| Local skill | Classification | Canonical source | Upstream path | Applied revision | Last checked revision | Adaptation notes |
| --- | --- | --- | --- | --- | --- | --- |
| `better-auth-best-practices` | Vendored-verbatim | [better-auth/skills](https://github.com/better-auth/skills) | [`better-auth/best-practices`](https://github.com/better-auth/skills/tree/20c9e88a5c007461a703f1c213572b073196113e/better-auth/best-practices) | [`20c9e88a5c007461a703f1c213572b073196113e`](https://github.com/better-auth/skills/commit/20c9e88a5c007461a703f1c213572b073196113e) | Same as applied | None. Use repository-native `auth-implementation` for local setup and constraints. |
| `better-auth-security-best-practices` | Vendored-verbatim | [better-auth/skills](https://github.com/better-auth/skills) | [`security`](https://github.com/better-auth/skills/tree/20c9e88a5c007461a703f1c213572b073196113e/security) | [`20c9e88a5c007461a703f1c213572b073196113e`](https://github.com/better-auth/skills/commit/20c9e88a5c007461a703f1c213572b073196113e) | Same as applied | None. |
| `email-and-password-best-practices` | Vendored-verbatim | [better-auth/skills](https://github.com/better-auth/skills) | [`better-auth/emailAndPassword`](https://github.com/better-auth/skills/tree/20c9e88a5c007461a703f1c213572b073196113e/better-auth/emailAndPassword) | [`20c9e88a5c007461a703f1c213572b073196113e`](https://github.com/better-auth/skills/commit/20c9e88a5c007461a703f1c213572b073196113e) | Same as applied | None. |
| `organization-best-practices` | Vendored-verbatim | [better-auth/skills](https://github.com/better-auth/skills) | [`better-auth/organization`](https://github.com/better-auth/skills/tree/20c9e88a5c007461a703f1c213572b073196113e/better-auth/organization) | [`20c9e88a5c007461a703f1c213572b073196113e`](https://github.com/better-auth/skills/commit/20c9e88a5c007461a703f1c213572b073196113e) | Same as applied | None. |
| `two-factor-authentication-best-practices` | Vendored-verbatim | [better-auth/skills](https://github.com/better-auth/skills) | [`better-auth/twoFactor`](https://github.com/better-auth/skills/tree/20c9e88a5c007461a703f1c213572b073196113e/better-auth/twoFactor) | [`20c9e88a5c007461a703f1c213572b073196113e`](https://github.com/better-auth/skills/commit/20c9e88a5c007461a703f1c213572b073196113e) | Same as applied | None. |
| `svelte-code-writer` | Vendored-verbatim | [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools) | [`tools/skills/svelte-code-writer`](https://github.com/sveltejs/ai-tools/tree/e7d93fcc168b5f4b3fec57c22f49a36d57e8ee1a/tools/skills/svelte-code-writer) | [`e7d93fcc168b5f4b3fec57c22f49a36d57e8ee1a`](https://github.com/sveltejs/ai-tools/commit/e7d93fcc168b5f4b3fec57c22f49a36d57e8ee1a) | [`a5a92c680ebe0d432593f4228a122cb59f5a0c74`](https://github.com/sveltejs/ai-tools/commit/a5a92c680ebe0d432593f4228a122cb59f5a0c74) | None. Root instructions translate upstream `npx` examples at execution time. |
| `svelte-core-bestpractices` | Vendored-verbatim | [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools) | [`tools/skills/svelte-core-bestpractices`](https://github.com/sveltejs/ai-tools/tree/e7d93fcc168b5f4b3fec57c22f49a36d57e8ee1a/tools/skills/svelte-core-bestpractices) | [`e7d93fcc168b5f4b3fec57c22f49a36d57e8ee1a`](https://github.com/sveltejs/ai-tools/commit/e7d93fcc168b5f4b3fec57c22f49a36d57e8ee1a) | [`a5a92c680ebe0d432593f4228a122cb59f5a0c74`](https://github.com/sveltejs/ai-tools/commit/a5a92c680ebe0d432593f4228a122cb59f5a0c74) | None. |
| `shadcn-svelte` | Vendored-adapted | [huntabyte/shadcn-svelte](https://github.com/huntabyte/shadcn-svelte) | [`skills/shadcn-svelte`](https://github.com/huntabyte/shadcn-svelte/tree/dabbd4c00fbca1feef29a2a155b2eecf6bb4ea7a/skills/shadcn-svelte) | [`dabbd4c00fbca1feef29a2a155b2eecf6bb4ea7a`](https://github.com/huntabyte/shadcn-svelte/commit/dabbd4c00fbca1feef29a2a155b2eecf6bb4ea7a) | [`9ebdb0bbc0276745c092a86882e2179203be317e`](https://github.com/huntabyte/shadcn-svelte/commit/9ebdb0bbc0276745c092a86882e2179203be317e) | Adapted for monorepo commands, package ownership, immutable generated primitives, and repository UI rules. |
| `ui-ux-pro-max` | Vendored-adapted | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | [`.claude/skills/ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/09170eec67eefd46a7ae85de61b40c194020f997/.claude/skills/ui-ux-pro-max) | [`09170eec67eefd46a7ae85de61b40c194020f997`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/commit/09170eec67eefd46a7ae85de61b40c194020f997) | Same as applied | Complete upstream skill copied. Only `SKILL.md` script commands and invocation guidance were adapted for repository-root execution through `.agents/skills/ui-ux-pro-max`. |

## Repository-Native Skills

These skills are maintained locally. Their applied upstream revision is
**N/A — maintained in this repository**.

| Local skill | Local source |
| --- | --- |
| `audit-trail-patterns` | [`audit-trail-patterns/SKILL.md`](audit-trail-patterns/SKILL.md) |
| `auth-implementation` | [`auth-implementation/SKILL.md`](auth-implementation/SKILL.md) |
| `cloudflare-worker-testing` | [`cloudflare-worker-testing/SKILL.md`](cloudflare-worker-testing/SKILL.md) |
| `database-patterns` | [`database-patterns/SKILL.md`](database-patterns/SKILL.md) |
| `deployment-operations` | [`deployment-operations/SKILL.md`](deployment-operations/SKILL.md) |
| `hono-patterns` | [`hono-patterns/SKILL.md`](hono-patterns/SKILL.md) |
| `implementation-review` | [`implementation-review/SKILL.md`](implementation-review/SKILL.md) |
| `monorepo-troubleshooting` | [`monorepo-troubleshooting/SKILL.md`](monorepo-troubleshooting/SKILL.md) |
| `svelte-data-forms` | [`svelte-data-forms/SKILL.md`](svelte-data-forms/SKILL.md) |
| `svelte-patterns` | [`svelte-patterns/SKILL.md`](svelte-patterns/SKILL.md) |
| `template-merge-workflow` | [`template-merge-workflow/SKILL.md`](template-merge-workflow/SKILL.md) |
| `validator-patterns` | [`validator-patterns/SKILL.md`](validator-patterns/SKILL.md) |

## Project Compatibility Context

The 2026-09-26 documentation audit compared every tracked upstream skill path
and its supporting files against the checked revision. No source content changed;
applied revisions remain unchanged.

Installed versions below were inspected against repository configuration and
relevant implementation. They do not version skill sources or imply application
runtime test coverage. Earlier compatibility records used Better Auth `1.7.4`
and shadcn-svelte CLI `1.6.1`.

The shadcn-svelte CLI `1.7.0` commands and flags in `shadcn-svelte/cli.md`
were verified using the repository-installed binary's help on `2026-09-26`.
Top-level help still omits `update`; direct `update --help` remains available.

| Product or tool | Inspected project version | Repository source |
| --- | --- | --- |
| Better Auth | `1.7.6` | [`pnpm-lock.yaml`](../../pnpm-lock.yaml) |
| `@sveltejs/mcp` | `0.1.26` | [`pnpm-lock.yaml`](../../pnpm-lock.yaml) |
| shadcn-svelte CLI | `1.7.0` | [`pnpm-lock.yaml`](../../pnpm-lock.yaml) |

## Maintenance Procedure

For local wording or repository-adaptation edits, preserve recorded upstream
revisions and apply steps 4–7. Steps 2–3 apply when checking or incorporating
upstream changes.

1. Read this registry and the root skill-routing rules before updating a vendored
   skill.
2. Fetch the canonical upstream repository separately. Diff the applied revision
   against the candidate head for the recorded upstream path.
3. Review every changed upstream file and validate claims against the project's
   installed product or tool version.
4. Keep vendored-verbatim content unchanged except for whitespace-only
   normalization. Put repository-specific behavior in root instructions or
   repository-native companion skills. For a vendored-adapted skill, preserve
   and re-evaluate every recorded adaptation.
5. Validate each changed skill with the skill validator and run any
   skill-specific verification required by the root instructions.
6. Copy the final canonical content to the matching `.claude/skills/` path and
   verify the mirrors by hash.
7. Verify that every immediate skill directory appears exactly once in this
   registry and that all source links use immutable revisions.
8. Update the applied revision only after upstream content is incorporated and
   verification passes. Update the last checked revision only after upstream
   comparison and verification, including when upstream content is unchanged.
   Do not change a `Last Comprehensive Audit Timestamp` unless the separate
   comprehensive-audit requirements are satisfied.
