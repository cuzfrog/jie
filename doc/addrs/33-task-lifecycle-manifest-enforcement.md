# ADR 33: Task Lifecycle Is Manifest-Declared and Platform-Enforced

## Status

Accepted. Extends ADR 11 (platform agnostic of jie-team) and ADR 9 (file tools enforce workspace containment only).

## Context

Multi-agent teams like `default-coders` run a serial pipeline over `task` work units: phases (`recorded → researched → designed → planned → implemented → review_passed/review_failed → done/failed`), an iteration loop with a cap, and a rule that only the architect authors module contracts (`CONTEXT.md`). Before this decision all of that was prose in the manifests: the system prompts instructed the conventions, and nothing checked them. A model that skipped a phase, miscounted the iteration, or edited a contract file had no guardrail — the failure surfaced much later as a corrupted work product, if at all.

The enforcement had to satisfy the architecture's two standing constraints:

1. **The platform is generic** (ADR 11). It must not know `default-coders`, its phases, or its topics. Whatever a team declares, the platform enforces generically — or not at all.
2. **Business identifiers were kept out of the platform** ("the platform treats tool inputs as opaque"). Enforcement needs a task key, so this principle needed a deliberate, narrow exception.

## Decision

The lifecycle is **declared in `TEAM.md` frontmatter and enforced by the platform's built-in tools** (`06-agent-model.md` "Team Blueprint" for the schema):

- **`lifecycle.transitions`** — rows `{topic, role, from, phase, iteration?}` mapping a `notify` topic to the phase it moves the task to. `role: any` and `from: any` (no phase yet, or any non-permanent phase) are the wildcards; `permanent_phases` admit no outgoing transition; `iteration` is `reset`, `increment` (capped at `max_iterations`, default 5), or absent (preserve).
- **Enforcement rides on `notify`.** On a lifecycle topic, `task_id` is a required input; the guard authorizes the caller's role and the task's current phase, writes the new status row, and only then publishes. A denied transition throws `illegal_transition` — nothing reaches the bus. This is the one deliberate exception to "business identifiers are opaque": `task_id` becomes a first-class platform input exactly when a lifecycle is declared, and stays rejected everywhere else. The guard serializes status-row writes per `task_id` (an in-process per-task queue, `04-storage.md` "Lifecycle status rows"), so concurrent transitions on one task cannot race on the same seq: the second re-reads the first's row and re-authorizes against it — the platform is single-process.
- **Task state is artifact rows** under `{task_id}/status/{seq}` — content `{"phase","iteration","updated_at"}`; the newest row by `created_at` is canonical. No new table, no new store: the lifecycle reuses the artifact store's sequenced-key pattern (`04-storage.md`), and state survives restarts for free.
- **`lifecycle.write_gates`** — glob patterns with the roles allowed to write them, checked by `write_file` and `edit` against the workspace-relative path before any mutation. Every matching gate must admit the caller (`write_gate_denied` otherwise). This replaces the previously deferred "module-descriptor write gate": `default-coders` declares `**/CONTEXT.md` architect-only with a one-line manifest entry, no platform knowledge of descriptors.

## Rationale

- **Declaration, not derivation.** The transition table is written out rather than inferred from topic/role shape: permanence is declared (`permanent_phases`), iteration effects are per-row, and the manifest stays the single source a team author reads. Deriving any of it would make the manifest ambiguous and the enforcement surprising.
- **Enforcement at the publish boundary.** Every inter-agent coordination step already funnels through `notify` (ADR 6's prompt-in/publish-out), so checking there guards the whole pipeline with one seam. The status row is written before the publish, so a published event always has recorded state, and a denial publishes nothing.
- **Cooperative-agent threat model.** The gates stop a well-intentioned model from drifting off the declared workflow — the actual failure mode — not an adversarial one: `bash` is ungated (policing shell writes would need an OS-level sandbox, out of scope). Documented residual, not a design hole: enforcement raises the cost of drift from "silent" to "deliberately circumvented". (The `write_artifact` status-key spoofing vector named here originally is closed for lifecycle-declaring teams by the `artifact_key_reserved` guard; see `06-agent-model.md` "write_artifact and read_artifact".)
- **Strict gate composition.** When several gates match a path, every one must admit the caller. First-match-wins would make ordering a semantic knob and turn overlapping declarations into silent permission grants; fail-loud keeps the declaration authoritative.

## Consequences

- `notify` gains the optional `task_id` input; the platform errors gain `invalid_task_id`, `illegal_transition`, `write_gate_denied`, and `invalid_lifecycle`.
- `ExecutionContext` carries the parsed `TaskLifecycle | null`; teams without a lifecycle (including the built-in default-solo and all ad-hoc teams) are entirely unaffected — every check is skipped when the declaration is absent.
- The `default-coders` manifest declares its full lifecycle: the ten `task.*` rows, `max_iterations: 5`, `done` as the only permanent phase, and the `**/CONTEXT.md` architect gate.
- The spec updates live in `jie-team/00-overview.md` (task model, descriptor gate) and `jie-platform/06-agent-model.md` (lifecycle schema, notify, Boundary Enforcement).
- Known residuals: `bash` bypasses write gates; an invalid glob in a write-gate pattern matches nothing and silently disables that gate (patterns cannot be validated at parse time); per-task `max_iterations` overrides are deferred. (The `write_artifact` status-row spoofing residual was closed for lifecycle-declaring teams by the `artifact_key_reserved` guard; the concurrent-transition seq race was closed by per-task serialization inside the guard.)
