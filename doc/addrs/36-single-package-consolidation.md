# ADR 36: Single-Package Consolidation

## Status

Accepted. Restructures the package topology described by `monorepo-structure.md` and referenced throughout ADRs 11, 24, 26, 31, 35. No decision recorded in those ADRs is superseded: their intent survives as src-level module boundaries within one npm package. Earlier `packages/jie-*` paths and `@cuzfrog/jie-*` package names in those ADRs describe the pre-consolidation layout; the mapping below reconciles them.

## Context

The repo was a bun-workspaces monorepo of eight packages (`jie-platform`, `jie-cli`, `jie-tui`, `jie-utils`, `jie-team-installer`, `jie-team`, `code-lens`, `mock-llm-backend`) coordinated by a root `catalog:` block. The split once paid for itself: it forced a sharp content/runtime boundary (ADR 11) and let distribution concerns land in their own package (ADR 35). Three things eroded that value:

1. **DI already carries the boundaries.** Since ADR 31, every concern boundary is an awilix container seam (`bootPlatform`, `bootTui`) plus a module gate (`MODULE.md` `no-new-exports`). The npm-package edge duplicated that boundary in a coarser, less enforceable form - and was the weaker of the two (catalog versions drift in attention, package roots invite deep imports).
2. **The import graph was already a star.** Every cross-package import went through a package-root barrel (`index.ts`); there were zero deep imports. The packages were not independently consumable - `jie-cli` was the only entry, and it pulled the whole graph. Publishing them separately would have shipped seven packages no one imports piecemeal.
3. **Distribution overhead with no upside.** Eight `package.json` files, a catalog to keep aligned, and a per-package versioning story - all to produce one CLI binary. D6 (publish topology) forced the question: the answer was "one package".

## Decision

Collapse the eight workspace packages into a single publishable package, `@cuzfrog/jie`, rooted at `src/`. The mock-only LLM server moves under `tests/`. Directory mapping:

| Was | Now |
|---|---|
| `packages/jie-platform/` | `src/platform/` |
| `packages/jie-cli/` | `src/cli/` |
| `packages/jie-tui/` | `src/tui/` |
| `packages/jie-utils/` | `src/utils/` |
| `packages/jie-team-installer/` | `src/team-installer/` |
| `packages/jie-team/` | `src/team-content/` |
| `packages/code-lens/` | `src/code-lens/` |
| `packages/mock-llm-backend/` | `tests/mock-llm-backend/` |

`packages/jie-ink/` is not in the table: it was deleted by ADR 30 and any remaining references to it are historical.

**What carries over unchanged.**

- The two awilix containers stay separate (ISP): `bootPlatform` and `bootTui` are not merged. The TUI still reaches the platform only through the `JiePlatform` handle (`asValue`), never platform internals.
- The `MODULE.md` gate convention stays. Module visibility is enforced at the src-directory level exactly as it was at the package level; `no-new-exports` lists are unchanged in intent.
- ADR 11 agnosticism stays: `src/platform/` has no import of `src/team-content/`, in any form. Team blueprints are still data read from filesystem paths. The bundled `default-coders` blueprint lives at `src/team-content/default-coders/`; first-run auto-install (D1, addressed separately) copies it to `~/.jie/teams/` so the platform reads it from the same filesystem locations as any installed team.
- ADR 35's installer boundary stays: `src/team-installer/` is still CLI-side, never imported by `src/platform/` or `src/team-content/`. It is now a module within the package rather than a separate npm package, but the concern split is identical.

**Publish shape.** One `package.json` at the repo root. `"files": ["src"]` whitelists the distributable; because the gitignored `.env` sits at repo root (outside `src/`), it is excluded from the tarball - bun's `pm pack` does not honor `.gitignore`, so the whitelist is load-bearing. `"bin"` exposes `jie` (`src/cli/index.ts`) and `code-lens` (`src/code-lens/main.ts`). No `workspaces`, no `catalog:`; every dependency is pinned once at the root. Versioning is whole-package: one version, one `bun publish`.

## Rationale

- **One boundary mechanism, not two.** DI + module gates already encode every boundary the packages encoded. Keeping the package split meant maintaining the same wall in two places - and the package wall was the weaker one (no tooling enforced it, only convention).
- **The star graph proved independence was fictional.** A package boundary earns its cost when consumers can depend on a subset. Nothing depended on a subset; the barrels existed only to feed `jie-cli`. Collapsing them removes 57 barrel indirections with zero behavior change.
- **Publishing and versioning get trivial.** One `bun publish` replaces coordinated multi-package releases; the catalog/version-alignment problem disappears. D6's three options collapsed to the simplest one because the preconditions for independent versioning (independent consumers) never held.
- **The `.env` leak is closed structurally.** `files: ["src"]` excludes everything outside `src/` from the tarball. The whitelist is also the publish surface - the smallest it can be.

## Consequences

- `monorepo-structure.md` is rewritten for the single-package layout; it is the authoritative current map. ADRs that predate this decision keep their `packages/jie-*` paths as historical record; the table above is the reconciliation.
- `@cuzfrog/jie-team` is no longer a separately published package. The `default-coders` blueprint ships inside `@cuzfrog/jie`; third-party teams remain installable via `jie team add <npm-spec>` (the installer resolves any npm package with `<id>/TEAM.md` dirs at its root). D1 covers first-run seeding of the bundled blueprint.
- Imports that were `from "@cuzfrog/jie-<x>"` are now relative paths (`from "../<x>"` or `"./<x>"`). No deep imports existed, so the rewrite was a 1:1 barrel-to-relative substitution - the internal dependency graph is unchanged.
- `tsconfig.json` `include` covers `src/**/*.ts`, `tests/**/*.ts`, `scripts/**/*.ts`. Type-checking is one project, one `tsc --noEmit`.
- Test path fixtures that hardcoded `packages/...` were updated; the only semantic fix beyond renames was `src/platform/team/parser.test.ts` pointing at `../../team-content/default-coders`.
