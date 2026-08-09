# ADR 37: Capability-Based Tool Limits Replace the Lifecycle State Machine

## Status

Accepted. Supersedes ADR 33 (removed). Restores ADR 11 (platform agnostic of jie-team) and the "business identifiers are opaque" principle that ADR 33 had carved an exception into.

## Context

ADR 33 declared a task lifecycle state machine in `TEAM.md` frontmatter and platform-enforced it: `transitions`, `permanent_phases`, `max_iterations`, `write_gates`, status rows under `{task_id}/status/{seq}`, and a `task_id` input on `notify`. It coupled four concerns behind one mechanism: workflow ordering, iteration capping, file-write gating, and a first-class `task_id` platform input.

Coupling broke opacity and ADR 11; state machine was heavy.

## Decision

Remove the lifecycle state machine entirely. Replace it with a generic, capability-based tool-spec grammar in each role's `tools:` list.

A tool spec is `name` (bare, unrestricted) or `name(args...)` (restricted). Two built-in tools consume args from `ExecutionContext.toolArgs`:

- **`notify(topics...)`** limits the topics a role may publish (`TOPIC_NOT_ALLOWED` on violation).
- **`write_file(globs...)` / `edit_file(globs...)`** limit the paths a role may touch (`WRITE_PATH_DENIED`), replacing `write_gates`.

The grammar is generic: the platform parses `name(args)` once at body construction into a `toolArgs: ReadonlyMap<string, ReadonlyArray<string>>` keyed by tool name; any tool may read its own args and constrain itself. No team-specific concepts enter the platform.

Ordering from subscriptions; `task_id` in prompt text only.

## Rationale
Generic mechanism; restores opacity; soft escalation.

## Consequences

- `notify` no `task_id`; limits inline in `tools:` specs; `bash` ungated.
