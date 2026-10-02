# shadcn-svelte CLI Reference

Configuration is read from `packages/ui/components.json`. See [components.json](https://shadcn-svelte.com/docs/components-json) on the docs site for the full schema.

> **IMPORTANT:** Run the repository-installed CLI from the repository root through the UI workspace: `pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte <command>`. The UI package already contains `packages/ui/components.json`; do not use `pnpm dlx`, a floating `@latest`, or `-c packages/ui`.

> Use the flags below or verify additional flags with the installed command's `--help`; never guess. The CLI auto-detects the package manager; do not assume a `--package-manager` flag.

## Contents

- Commands: `init`, `add`, `apply`, `update`, `registry build`
- Proxy / outgoing requests
- Presets (via `init` and `apply`)

---

## Commands

### `init` — Initialize an existing project

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte init [options]
```

Installs dependencies, adds the `cn` util, creates `packages/ui/components.json`, and sets up CSS variables. This package is already initialized; run `init` only for an explicitly requested reinitialization and never create a root config.

| Flag                        | Short | Description                                                               | Default   |
| --------------------------- | ----- | ------------------------------------------------------------------------- | --------- |
| `--preset <preset>`         | —     | Encoded design-system preset string from the docs site                    | —         |
| `-c, --cwd <path>`          | `-c`  | Working directory                                                         | current   |
| `--no-deps-install`         | —     | Add dependencies to `package.json` without installing                     | —         |
| `--skip-preflight`          | —     | Ignore preflight checks and continue                                      | `false`   |
| `--reinstall`               | —     | Reinstall existing components when the style changes                      | —         |
| `--no-reinstall`            | —     | Skip reinstalling existing components when the style changes              | —         |
| `--base-color <name>`       | —     | Base color: `neutral`, `stone`, `zinc`, `mauve`, `olive`, `mist`, `taupe` | —         |
| `--css <path>`              | —     | Path to the global CSS file                                               | —         |
| `--components-alias <path>` | —     | Import alias for components                                               | —         |
| `--lib-alias <path>`        | —     | Import alias for lib                                                      | —         |
| `--utils-alias <path>`      | —     | Import alias for utils                                                    | —         |
| `--hooks-alias <path>`      | —     | Import alias for hooks                                                    | —         |
| `--ui-alias <path>`         | —     | Import alias for UI components                                            | —         |
| `--proxy <proxy>`           | —     | Fetch registry items through this proxy                                   | env-based |
| `-h, --help`                | `-h`  | Help                                                                      | —         |

---

### `add` — Add components

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte add [options] [components...]
```

Adds components from the configured registry. Arguments are component names from the registry index, or a **URL** to a registry JSON item. With **no** component names, the CLI prompts you to pick components interactively.

| Flag               | Short | Description                                     | Default   |
| ------------------ | ----- | ----------------------------------------------- | --------- |
| `-c, --cwd <path>` | `-c`  | Working directory                               | current   |
| `--no-deps-install`| —     | Add dependencies to `package.json` without installing | —     |
| `--skip-preflight` | —     | Ignore preflight checks and continue            | `false`   |
| `-a, --all`        | —     | Install all UI components                       | `false`   |
| `-y, --yes`        | —     | Skip confirmation prompt                        | `false`   |
| `-o, --overwrite`  | —     | Overwrite existing files                        | `false`   |
| `--proxy <proxy>`  | —     | Fetch components through this proxy             | env-based |
| `-h, --help`       | `-h`  | Help                                            | —         |

---

### `apply` — Apply a preset to an existing project

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte apply [options] [preset]
```

Applies a design-system preset to the initialized UI package. It updates `packages/ui/components.json`, reinstalls generated components (except `utils`), and installs required dependencies. Follow the same named-file replacement approval workflow as `update` whenever `apply` replaces primitives; never preserve or reapply local primitive patches.

Use `--only theme` or `--only font` to apply only part of a preset without reinstalling UI components.

Get a preset code from the builder at [shadcn-svelte.com/create](https://shadcn-svelte.com/create).

| Flag                | Short | Description                                    | Default   |
| ------------------- | ----- | ---------------------------------------------- | --------- |
| `--preset <preset>` | —     | Encoded preset; use this flag or the positional argument | —         |
| `--only <parts...>` | —     | Apply only `theme` and/or `font` from the preset | —       |
| `-c, --cwd <path>`  | `-c`  | Working directory                              | current   |
| `-y, --yes`         | `-y`  | Skip confirmation prompt                       | `false`   |
| `-s, --silent`      | `-s`  | Mute output                                    | `false`   |
| `--no-deps-install` | —     | Add dependencies to `package.json` without installing | —  |
| `--skip-preflight`  | —     | Ignore preflight checks and continue           | `false`   |
| `--proxy <proxy>`   | —     | Fetch registry items through this proxy        | env-based |
| `-h, --help`        | `-h`  | Help                                           | —         |

Requires the existing `packages/ui/components.json`. Do not run `init` as a prerequisite in this repository.

---

### `update` — Refresh installed components

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte update [options] [components...]
```

Updates components already installed in the UI package. In the installed CLI version 1.7.0 (verified 2026-09-26), this supported command is hidden from the top-level command list; inspect its options directly with `pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte update --help`.

| Flag                | Short | Description                                           | Default   |
| ------------------- | ----- | ----------------------------------------------------- | --------- |
| `-c, --cwd <path>`  | `-c`  | Working directory                                     | current   |
| `--skip-preflight`  | —     | Ignore preflight checks and continue                  | `false`   |
| `--no-deps-install` | —     | Add dependencies to `package.json` without installing | —         |
| `-a, --all`         | —     | Update every installed component                      | `false`   |
| `-y, --yes`         | —     | Skip confirmation prompt                              | `false`   |
| `--proxy <proxy>`   | —     | Fetch components through this proxy                   | env-based |
| `-h, --help`        | `-h`  | Help                                                  | —         |

Inspect the worktree first without committing, stashing, resetting, or discarding work automatically. Require explicit authorization for the named generated files that will be replaced; reuse authorization already supplied for that scope. Generated primitives must not contain preserved local patches; move a still-required non-composable correction into a qualified override before updating. Use `update --all` only when every installed primitive is explicitly in scope, then review the resulting diff.

---

### `registry build` — Build a custom registry

```bash
pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte registry build [options] [registry]
```

Reads a `registry.json` and writes registry JSON files for distribution. Default input: `./registry.json`, default output: `./static/r`.

| Flag                  | Short | Description                     | Default      |
| --------------------- | ----- | ------------------------------- | ------------ |
| `-c, --cwd <path>`    | `-c`  | Working directory               | current      |
| `-o, --output <path>` | `-o`  | Output directory for JSON files | `./static/r` |
| `-h, --help`          | `-h`  | Help                            | —            |

---

## Outgoing Requests

### Proxy

The CLI can fetch the registry through a proxy. If `HTTP_PROXY` or `http_proxy` is set, requests respect it. You can also pass `--proxy` on `init`, `add`, `apply`, or `update`.

```bash
HTTP_PROXY="<proxy-url>" pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte init
```

---

## Presets

Design-system options (style, theme, icons, fonts, etc.) can be captured as an encoded **preset** string from the builder on [shadcn-svelte.com/create](https://shadcn-svelte.com/create).

- **Intentional reinitialization:** pass the preset to **`pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte init --preset <string>`** only when explicitly requested.
- **Existing UI package:** use **`pnpm --filter=@PROJECT_NAME/ui exec shadcn-svelte apply --preset <string>`** to update configuration, restyle generated components, and install dependencies.

---

## `packages/ui/components.json` — useful fields for agents

| Field / path         | Meaning                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `tailwind.css`       | Global CSS file path (Tailwind entry / theme variables)          |
| `tailwind.baseColor` | Base palette; change through an authorized preset/reinitialization workflow                          |
| `aliases.*`          | Import aliases; must match `svelte.config.js` / `tsconfig` paths |
| `registry`           | Base registry URL (default `https://shadcn-svelte.com/registry`) |
| `style`              | Registered style name (e.g. `nova`, `vega`, …)                   |
| `iconLibrary`        | Icon set key (`lucide`, `tabler`, …) — drives generated imports  |
| `typescript`         | Whether TS and optional custom config path                       |

Resolved paths (including `tailwindCss`, `ui`, `components`) are computed relative to `packages/ui`. Read `packages/ui/components.json` and list `packages/ui/src/components/` when you need a snapshot of installed primitives.
