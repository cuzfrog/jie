# ADR 37: Capability-Based Tool Limits Replace the Lifecycle State Machine

## Status

Accepted. Supersedes ADR 33 (removed). Restores ADR 11 (platform agnostic of jie-team) and the "business identifiers are opaque" principle that ADR 33 had carved an exception into.

## Context

ADR 33 declared a task lifecycle state machine in `TEAM.md` frontmatter and platform-enforced it: `transitions`, `permanent_phases`, `max_iterations`, `write_gates`, status rows under `{task_id}/status/{seq}`, and a `task_id` input on `notify`. It coupled four concerns behind one mechanism: workflow ordering, iteration capping, file-write gating, and a first-class `task_id` platform input.

The coupling was costly:

1. **Broke opacity.** `task_id` became a platform input exactly when a lifecycle was declared - a deliberate exception to "the platform treats tool inputs as opaque".
2. **Broke ADR 11.** The platform gained knowledge of `default-team`-specific concepts (phases, `task.*` topics, iteration semantics) despite ADR 11.
3. **Heavy for the need.** The actual workflow is "each role does its step, then notifies the next." Ordering already falls out of the subscription graph; a transition table re-encoded what subscriptions express. Task progress is already tracked per-card on the kanban board and via artifacts.
4. **Iteration capping was net-negative.** A hard cap at iteration 5 either aborts recoverable work or is never reached. Whether objections are unresolvable is a judgment an LLM can make and the planner role already owns.

## Decision

Remove the lifecycle state machine entirely. Replace it with a generic, capability-based tool-spec grammar in each role's `tools:` list.

A tool spec is `name` (bare, unrestricted) or `name(args...)` (restricted). Two built-in tools consume args from `ExecutionContext.toolArgs`:

- **`notify(topics...)`** limits the topics a role may publish (`TOPIC_NOT_ALLOWED` on violation).
- **`write_file(globs...)` / `edit_file(globs...)`** limit the paths a role may touch (`WRITE_PATH_DENIED`), replacing `write_gates`.

The grammar is generic: the platform parses `name(args)` once at body construction into a `toolArgs: ReadonlyMap<string, ReadonlyArray<string>>` keyed by tool name; any tool may read its own args and constrain itself. No team-specific concepts enter the platform.

Ordering emerges from subscriptions, not a state machine. Task progress is tracked by kanban (per-card status) and by artifacts (`{task_id}/research|design|plan|review`). `task_id` remains a team-level concept carried in notification prompt text - never a platform input. Iteration capping is dropped; the planner emits `task.failed` when objections are genuinely unresolvable (soft escalation in the role prompt).

## Rationale

- **One mechanism, one seam.** The spec is parsed once; each tool reads its own args. No separate guard, no status store, no transition table, no reserved artifact namespace.
- **Restores opacity and ADR 11.** No business identifier is a platform input; the platform has zero knowledge of any team's phases or topics. Task identity travels in prompt text, which subscribers already read.
- **Cooperative-agent threat model unchanged.** The limits stop drift, not adversarial circumvention (`bash` remains ungated by design). But the platform no longer carries team-specific state machinery that can itself drift or misfire.
- **Soft over hard escalation.** An LLM judging unresolvability is more honest than a blind counter; the manager surfaces failures to the user either way.

## Consequences

- `notify` loses `task_id`; parameters are `{ topic, prompt }` only. Returns `Notification published on '<topic>'`, `details: { topic }`.
- `write_file` / `edit_file` check per-role globs from `toolArgs` (when present) against the workspace-relative path; a bare spec means unrestricted (as before). `WRITE_PATH_DENIED` and `TOPIC_NOT_ALLOWED` error codes added; `illegal_transition`, `invalid_task_id`, `invalid_lifecycle`, `write_gate_denied`, and `artifact_key_reserved` removed. (`missing_required_field` remains - the parser still uses it for a missing `tools` field.) `INVALID_TOOL_SPEC` added for malformed `name(args)` specs.
- `ExecutionContext` carries `toolArgs: ReadonlyMap<string, ReadonlyArray<string>>` (replaces `lifecycle: TaskLifecycle | null`).
- `write_artifact` no longer reserves the `*/status/*` key namespace - it existed only for lifecycle status rows, now gone.
- `TEAM.md` frontmatter is `leader:` only; no `lifecycle:` block. Role manifests express limits inline: `notify(task.recorded, task.done)`, `write_file(**/CONTEXT.md)`.
- Tool specs stay raw strings on `AgentSoul.tools` (parsed at body construction, no TUI ripple). The parser stays tool-agnostic per OCP: `parseToolSpec` lives in the tools layer.
- Residuals: `bash` bypasses write limits (ungated by design); a role with a bare `write_file` is unrestricted, so "only the architect authors `CONTEXT.md`" is prompt-enforced for roles that keep bare file tools (e.g. the implementer) rather than platform-enforced.
