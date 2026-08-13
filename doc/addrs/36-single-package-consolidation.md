# ADR 36: Single-Package Consolidation

## Status

Accepted. Restructures the package topology described by `monorepo-structure.md` and referenced throughout ADRs 11, 24, 26, 31, 35. No decision recorded in those ADRs is superseded: their intent survives as src-level module boundaries within one npm package. Earlier `packages/jie-*` references are historical.

## Context

The repo was a bun-workspaces monorepo of eight packages (`jie-platform`, `jie-cli`, `jie-tui`, `jie-utils`, `jie-teams-installer`, `jie-team`, `code-lens`, `mock-llm-backend`) coordinated by a root `catalog:` block. The split once paid for itself: it forced a sharp content/runtime boundary (ADR 11) and let distribution concerns land in their own package (ADR 35). Three things eroded that value:

DI and module gates already enforce boundaries; import graph is a star.

## Decision

Collapse the eight workspace packages into a single publishable package, `@cuzfrog/jie`, rooted at `src/`. The mock-only LLM server moves under `tests/`. **What carries over unchanged.**

- The two awilix containers stay separate (ISP): `bootPlatform` and `bootTui` are not merged. The TUI still reaches the platform only through the `JiePlatform` handle (`asValue`), never platform internals.
- The `MODULE.md` gate convention stays. Module visibility is enforced at the src-directory level exactly as it was at the package level; `no-new-exports` lists are unchanged in intent.
- ADR 11 agnosticism stays: `src/platform/` has no import of `src/manifest/` (teams or shared agents), in any form. Team blueprints are still data read from filesystem paths. The bundled `jie-dev-team` blueprint lives at `src/manifest/teams/jie-dev-team/`; first-run auto-install (D1, addressed separately) copies it to `~/.jie/teams/` so the platform reads it from the same filesystem locations as any installed team (supplemented by ADR 40).
- ADR 35's installer boundary stays: `src/manifest/installer/` is still CLI-side, never imported by `src/platform/` or `src/manifest/`. It is now a module within the package rather than a separate npm package, but the concern split is identical.

**Publish shape.** One package (`@cuzfrog/jie`) rooted at `src/`; `"files": ["src"]` excludes root-level files like `.env`. No workspaces or catalog.

## Rationale

- One mechanism; star graph; single publish.

## Consequences

- `monorepo-structure.md` is rewritten for the single-package layout; it is the authoritative current map. ADRs that predate this decision keep their `packages/jie-*` paths as historical record; the table above is the reconciliation.
- `@cuzfrog/jie-team` is no longer a separately published package. The `jie-dev-team` blueprint ships inside `@cuzfrog/jie`; third-party teams remain installable via `jie team add <npm-spec>` (the installer resolves any npm package with `<id>/TEAM.md` dirs at its root). D1 covers first-run seeding of the bundled blueprint.
- Imports that were `from "@cuzfrog/jie-<x>"` are now relative paths (`from "../<x>"` or `"./<x>"`). No deep imports existed, so the rewrite was a 1:1 barrel-to-relative substitution - the internal dependency graph is unchanged.
- `tsconfig.json` `include` covers `src/**/*.ts`, `tests/**/*.ts`, `scripts/**/*.ts`. Type-checking is one project, one `tsc --noEmit`.
- Test path fixtures that hardcoded `packages/...` were updated; `src/platform/team/parser.test.ts` points at `../../manifest/teams/jie-dev-team` after the consolidation to `src/manifest/`.
