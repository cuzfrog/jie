# ADR 18: Role Identifier Is the Filename Stem (Reverses Group N's `name:` Override)

## Status

Accepted 2026-06-12. Reverses the Group N decision that introduced a `name:` frontmatter field for role-name override.

## Context

Group N added a `name:` frontmatter field to agent `.md` files. The intent was to let team authors override the role identifier (and thus the `agent_key = {role}-{N}` slot) without renaming the file. The field was optional: if present, it won; if absent, the filename stem was used.

The fresh review pass on 2026-06-12 (post-Group-N) surfaced four spec sites that contradicted each other on this point:

| Source | Said |
|---|---|
| `06-agent-model.md:9` (AgentSoul interface) | `name:` wins, stem fallback |
| `06-agent-model.md:113` (Frontmatter fields table) | `name:` wins, stem fallback |
| `06-agent-model.md:63,84` (Blueprint Loading prose) | stem only |
| `ui/tui.md:16` (`roles: string[]` parameter) | stem only |

Two camps in the same file. The TypeScript interface and the frontmatter table were the newer, more precise claims; the prose and the TUI parameter were the older, looser claims. They never converged.

The TUI split is the load-bearing one: `roles: string[]` is computed by the loader and passed to the TUI at construction. If the loader follows the frontmatter (and resolves to `name:` when present) but the TUI takes stems, the agents-panel displays identifiers that don't match the bodies running on the bus. The user sees `worker` in the tab and `worker_a-1` in the events. This is a real bug, not a stylistic disagreement.

A separate review consideration: `name:` adds a feature the user did not ask for. The dev team's role names already match their filenames (`implementer.md` → `implementer`, `architect.md` → `architect`). The built-in minimal team ships `general.md`. There is no user-visible reason to override — the override only matters when an author *wants* the displayed role to differ from the filename, which is a corner case for which the spec offers no compelling example.

## Decision

The role identifier is the `.md` filename stem, with no `name:` override. The agent's `.md` frontmatter contains only:

| Field | Required |
|---|---|
| `model` | no |
| `tools` | yes |
| `subscribe` | no |

`AgentSoul.role === filename_stem`. `agent_key = {filename_stem}-{N}`. The directory must not contain two `.md` files with the same stem; the loader treats that as a parse-time error.

Concretely:

- `06-agent-model.md:9` — `role` comment now says "agent identifier — the agent's .md filename stem (canonical, see ADR 18)".
- `06-agent-model.md:113` — the `name` row is removed from the frontmatter fields table; a new sentence below the table says "The role identifier is the `.md` filename stem — there is no `name:` frontmatter override (see ADR 18). The directory must not contain two `.md` files with the same stem (the loader treats duplicate stems as a parse-time error)."
- `00-user-scenarios.md` — `name:` lines dropped from the five agent frontmatter examples (`agent-1.md`, `agent-2.md`, `my-agent.md`, `manager.md`, `worker.md`). The `name: my-team` line in scenario 3's `TEAM.md` is *not* an agent field; it is the team directory's `<id>` echoed as a comment. TEAM.md's actual spec'd fields are `leader:` (and the commented `instances:`) — see `06-agent-model.md` § TEAM.md. The team id is the directory name, not a TEAM.md frontmatter field. (This is a separate spec gap if we want to formalize TEAM.md; not addressed here.)

The TUI's `roles: string[]` parameter (per `ui/tui.md:16`) and the loader's role resolution both now follow the same rule: the post-parse `AgentSoul.role` from each `.md` file in the directory, sorted alphabetically. No exception path.

The `team-blueprint loader` in `packages/jie-platform/team/loader.ts` is the single place that knows about frontmatter syntax. The role is always the filename stem. The loader does not read a `name:` field. If a `name:` field is present, the loader ignores it (per the "unrecognized fields are tolerated" policy that other frontmatter extras would also follow).

## Rationale

- **One source of truth, not two.** Filename → role → `agent_key` is a direct correspondence. The `name:` override added a second path that could disagree with the first, and the spec already showed signs of disagreement (four sites, two camps).
- **The user did not ask for the override.** Group N added `name:` proactively; no user scenario requires it. The dev team's filenames match its role names; the built-in team's filename matches its role name. There is no corner case the override solves that the spec calls out as a Day-1 need.
- **The TUI/loader split is the silent bug.** If `name:` were kept, the loader's `roles` output and the TUI's `roles` input would still have to be reconciled. Filename-stem-canonical collapses the question.
- **Reversal is cheap.** No on-disk content was ever published under the `name:`-override rule (jie-team and code-lens are Day 2+ per ADR 17). v1 has no shipped content that depends on `name:`. Removing the field is a one-time, contained edit.
- **Symmetry with the team id.** The team id is the directory name (`.jie/teams/<id>/`). The role id is the file stem (`.jie/teams/<id>/<stem>.md`). The two are structurally identical — "the path's last segment is the identifier". This is the pattern the platform uses for everything else; aligning the agent role with it removes the one place that didn't follow it.

## Consequences

- `06-agent-model.md` § "AgentSoul" and § "Frontmatter fields" updated (see Decision).
- `00-user-scenarios.md` frontmatter examples in scenarios 2, 3, and 7 updated to drop the `name:` field.
- The team-blueprint loader in `packages/jie-platform/team/loader.ts` no longer reads a `name:` field. The role is `path.parse(file).name` (filename without extension). Duplicate-stem detection is added as a parse-time validation.
- `ui/tui.md:16` is already correct (says "filename stems"); no change.
- `00-overview.md` glossary entries for **Soul**, **Agent**, **Agent Key** remain accurate (they refer to "role" without specifying the source); no change.
- Group N's "Frontmatter table: added `name:` field as the canonical role identifier" note in `review-tracker.md` is amended in the next tracker update.
- No new ADR-grade dep or runtime change.
- If a future Day 2+ team author needs to rename a role without renaming the file, the answer is "rename the file" (or the team can ship a build step that generates the `.md` files from a higher-level template). The platform does not own a rename primitive.
