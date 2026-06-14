# ADR 23: Identifier Charset Constraints — Hard Fail at Load

## Status

Accepted. The team-blueprint loader enforces the identifier charsets documented in `10-configuration.md` "Platform Limits".

## Context

The platform's identifier charsets were documented in `10-configuration.md` "Platform Limits" but not enforced at the point of use:

| Identifier | Documented charset | Enforced at use? |
|---|---|---|
| `team_id` (the team directory name) | `[A-Za-z0-9_-]{1,32}` | No — `defaultTeam` and `--team <id>` are validated; the team-blueprint loader was not. |
| Agent role (filename stem) | "(no constraint)" | No — the loader used `path.parse(file).name` verbatim. |

The platform already validates `defaultTeam` and the `--team` flag against the team_id charset. The `jie team` CLI flow catches non-conforming values at flag parse time and the team lookup at `--team <id>` validation time. But the loader itself never checked the directory name on its own.

The role stem has been explicitly unconstrained since ADR 16 (filename-stem-canonical). The "no constraint" note in the limits table acknowledged the gap but did not resolve it.

Three real consequences of the un-enforced state:

1. **`team_id` could bypass the documented charset.** A user installs `.jie/teams/My Team/` (with a space). The `defaultTeam` value `"My Team"` fails the `settings.json` validator (space not in `[A-Za-z0-9_-]`). But `jie --team "My Team"` from the command line could load the team — the directory-existence check is independent of the charset. The CLI's `team '<id>' is not installed; checked .jie/teams/<id>/` error fires only on a missing directory, not on a non-conforming name. The platform has a documented constraint that some paths enforce and others don't.

2. **Role stems with spaces produced unusable `agent_key` and bus subjects.** The `agent_key = {role}-{N}` is a bus subject prefix. A role `my agent` (filename `my agent.md`) produces `agent_key = "my agent-1"`, subject `{team_id}.my agent-1`. The in-process `Map` lookup handles any string, but the LLM's reasoning about agent_keys with spaces, the `agent.tool.call` / `agent.tool.result` payloads' `name` field (which is the tool name, not agent_key, but adjacent), and the `team.loaded` event's `agents: [{ role, agent_key }]` payload all degrade.

3. **Spec drift.** The limits table documented the constraint; the loader did not enforce it. An implementer reading one and not the other gets a misleading model of the platform's contract.

## Decision

### 1. `team_id` charset is enforced at directory load

The team-blueprint loader in `packages/jie-platform/team/loader.ts` validates the directory name against `[A-Za-z0-9_-]{1,32}` on load. **Hard fail** with `invalid team_id: <value>` (the error format matches the `invalid team id: <value>` wording in `10-configuration.md` "Config Validation" for the `--team` flag — keep the messages consistent). The directory is not loaded. The CLI prints the error on stderr and exits 1.

This aligns the loader-level check with the existing `defaultTeam` and `--team` flag validators. All three entry points now reject the same set of strings.

### 2. Role (filename stem) charset is added: `[A-Za-z0-9_-]{1,64}`

The team-blueprint loader validates `path.parse(file).name` against `[A-Za-z0-9_-]{1,64}` for every `.md` agent file in the team directory. **Hard fail** with `invalid role: <stem>` (cites the offending stem, including the directory it would have lived in). The team fails to load; the CLI exits 1.

Length 64 (vs 32 for `team_id`) reflects that role names appear in many places (tab labels, agent_keys, log lines, `team.loaded` event payload) where a longer identifier is reasonable. Both charsets share `[A-Za-z0-9_-]` — the "no spaces, no special chars, dash and underscore OK" rule.

### 3. Hard-fail, not WARN-and-ignore

A user with a non-conforming team directory or role stem sees the error and renames. The platform does **not** auto-rename, escape, or normalize. The charset is the contract; WARN-and-ignore would leave the platform's downstream surfaces (bus subjects, agent_keys, log lines) with the unconstrained values, perpetuating the original problem.

### 4. Migration story for existing non-conforming teams

v1 has no shipped user content (jie-team is Day 2+ per ADR 15). A user who hand-installed a team with spaces in the role or team_id before this ADR sees a startup error on next run. The remediation is a one-time rename of the directory / file. The error message names the offending value; the CLI exit 1 is unambiguous.

## Rationale

- **Constraint documented → constraint enforced.** The platform's `10-configuration.md` "Platform Limits" table is the contract for the platform's identifier shape. A constraint in the limits table should be enforced at the point of use; otherwise the table is advisory, not contractual. ADR 17 (memory team-scoping) introduced the `team_id` charset with the implicit promise that the value would be usable across the platform. The loader is the entry point that creates the value; it should be the entry point that validates it.
- **Hard-fail is the conservative choice.** A WARN-and-ignore would leave a class of "this team loaded but the values are weird" bugs in the platform — agent_keys with spaces, subjects that the LLM has to reason about, log lines with control characters. Failing fast at the entry point is the cheap fix; failing later (LLM confusion, downstream tool errors) is expensive. The error message is specific and the rename is trivial; the cost of failure is low.
- **Consistent error format with existing validators.** The `invalid team_id: <value>` format matches the `invalid team id: <value>` wording used by the `--team` flag validator in `10-configuration.md` "Config Validation" (and the `invalid defaultTeam: <value>` wording for `settings.json`). The three entry points (settings, flag, directory) emit the same shape, with the same name, on the same condition.
- **64 chars for role, 32 chars for team_id.** The two identifiers have different visibility: `team_id` appears in settings and the CLI prompt (and in `~/.jie/teams/<id>/` paths, which are filesystem-constrained on most OSes to 255 bytes anyway). 32 chars is comfortable for a team name and short enough to be useful in compact displays. `role` appears in agent_keys (`{role}-1`), the `team.loaded` event payload, log lines, and tab labels — places where 32 chars is tight. 64 chars is the right ceiling for the role identifier.
- **No auto-rename / no normalization.** Auto-renaming a team directory or a file would mutate the user's filesystem, which is out of scope for the platform. The error is a hard fail; the user fixes the manifest.

## Consequences

- `packages/jie-platform/team/loader.ts` validates the directory name and every `.md` file's stem. Hard fail on either violation.
- `06-agent-model.md` "Parse Errors" table gains two rows: `invalid team_id: <value>` and `invalid role: <stem>`. Both cite the offending value and the directory the loader was scanning.
- `10-configuration.md` "Platform Limits" table updates the `team_id` row to mention the loader-level check, and replaces the "Agent role (filename stem) charset" "(no constraint)" row with the new `[A-Za-z0-9_-]{1,64}` constraint and a description of the loader-level check.
- A user with pre-existing non-conforming teams sees a startup error on next run with the offending value named. The rename is a one-time fix at the filesystem level.
- The platform's downstream surfaces (bus subjects, agent_keys, `team.loaded` payload) are now guaranteed to use the constrained charset. The LLM's reasoning about agent_keys and the bus's subject matching are both improved.
- The `McpServerConfig` server name (which the user supplies in `mcp.json`) is **not** covered by this ADR. MCP server names are an independent config dimension and out of scope for the team's identifier constraints. If a future ADR adds a constraint, it would be a separate decision.
