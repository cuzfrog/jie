# ADR 16: Role Identifier Is the Filename Stem

## Status

Accepted. The role identifier is the `.md` filename stem, with no `name:` override. There is no frontmatter field that overrides this.

## Context

An earlier design introduced a `name:` frontmatter field for agent `.md` files. The intent was to let team authors override the role identifier (and thus the `agent_key = {role}-{N}` slot) without renaming the file. The field was optional: if present, it won; if absent, the filename stem was used.

This surfaced contradictions across the spec:

| Source | Said |
|---|---|
| `06-agent-model.md` "AgentSoul" interface | `name:` wins, stem fallback |
| `06-agent-model.md` Frontmatter fields table | `name:` wins, stem fallback |
| `06-agent-model.md` "Blueprint Loading" prose | stem only |
| `ui/tui.md` `roles: string[]` parameter | stem only |

Two camps in the same file. The TypeScript interface and the frontmatter table were the newer, more precise claims; the prose and the TUI parameter were the older, looser claims. They never converged.

The TUI split is the load-bearing one: `roles: string[]` is computed by the loader and passed to the TUI at construction. If the loader follows the frontmatter (and resolves to `name:` when present) but the TUI takes stems, the agents-panel displays identifiers that don't match the bodies running on the bus. The user sees `worker` in the tab and `worker_a-1` in the events. This is a real bug, not a stylistic disagreement.

A separate review consideration: `name:` adds a feature the user did not ask for. There is no user-visible reason to override — the override only matters when an author *wants* the displayed role to differ from the filename, which is a corner case for which the spec offers no compelling example.

## Decision

The role identifier is the `.md` filename stem, with no `name:` override. The agent's `.md` frontmatter contains only:

| Field | Required |
|---|---|
| `model` | no |
| `tools` | yes |
| `subscribe` | no |

`AgentSoul.role === filename_stem`. `agent_key = {filename_stem}-{N}`. The directory must not contain two `.md` files with the same stem; the loader treats that as a parse-time error (per `06-agent-model.md` Parse Errors table).

The TUI's `roles: string[]` parameter and the loader's role resolution both follow the same rule: the post-parse `AgentSoul.role` from each `.md` file in the directory, sorted alphabetically. No exception path.

The `team-blueprint loader` in `packages/jie-platform/team/loader.ts` is the single place that knows about frontmatter syntax. The role is always the filename stem. The loader does not read a `name:` field. If a `name:` field is present, the loader ignores it (per the "unrecognized fields are tolerated" policy that other frontmatter extras would also follow).

## Rationale

- **One source of truth, not two.** Filename → role → `agent_key` is a direct correspondence. The `name:` override added a second path that could disagree with the first, and the spec already showed signs of disagreement (four sites, two camps).
- **The user did not ask for the override.** There is no corner case the override solves that the spec calls out as a Day-1 need.
- **The TUI/loader split is the silent bug.** If `name:` were kept, the loader's `roles` output and the TUI's `roles` input would still have to be reconciled. Filename-stem-canonical collapses the question.
- **Reversal is cheap.** No on-disk content was ever published under the `name:`-override rule (jie-team and code-lens are Day 2+ per ADR 15). v1 has no shipped content that depends on `name:`. Removing the field is a one-time, contained edit.
- **Symmetry with the team id.** The team id is the directory name (`.jie/teams/<id>/`). The role id is the file stem (`.jie/teams/<id>/<stem>.md`). The two are structurally identical — "the path's last segment is the identifier". This is the pattern the platform uses for everything else; aligning the agent role with it removes the one place that didn't follow it.

## Consequences

- `06-agent-model.md` "AgentSoul" and "Frontmatter fields" reflect the canonical rule.
- `00-user-scenarios.md` frontmatter examples in scenarios 2, 3, and 7 drop the `name:` field.
- The team-blueprint loader in `packages/jie-platform/team/loader.ts` no longer reads a `name:` field. The role is `path.parse(file).name` (filename without extension). Duplicate-stem detection is added as a parse-time validation.
- `ui/tui.md` `roles: string[]` is already correct (says "filename stems"); no change.
- `00-overview.md` glossary entries for **Soul**, **Agent**, **Agent Key** remain accurate (they refer to "role" without specifying the source); no change.
- No new ADR-grade dep or runtime change.
- If a future Day 2+ team author needs to rename a role without renaming the file, the answer is "rename the file" (or the team can ship a build step that generates the `.md` files from a higher-level template). The platform does not own a rename primitive.
