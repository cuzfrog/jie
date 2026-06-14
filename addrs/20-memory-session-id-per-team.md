# ADR 20: Memory Session ID Is Per Process × Team, Supplied by the Handle

## Status

Accepted 2026-06-13. Refines the session-id lifecycle captured in `08-memory.md` "Restore" and the `JieHandle` map shape captured in ADR 19.

## Context

The fresh review pass 2 (2026-06-13) surfaced three intertwined gaps in the v1 session-id lifecycle:

1. **Body mints vs handle mints.** `08-memory.md` "Restore" was internally inconsistent. The first paragraph said "the body mints a new one"; the last paragraph said "Each new `(team_id, agent_key)` pair seen by the handle mints a fresh `session_id` and records the mapping". The `AgentBody` class signature in `06-agent-model.md` did not expose `session_id`, leaving no API for the handle to learn the body-minted value.

2. **Session id scope.** The spec was ambiguous on whether the session id is per-process, per-team, or per-agent. ADR 19's `JieHandle` map keyed on `(team_id, agent_key)` implied per-(team, agent). `--continue` found one session id per team (implying per-team). `memory_turns` rows were disjoint by `agent_key` (per-agent at the row level).

3. **Team swap semantics.** The user clarified on 2026-06-13: on team swap, the new team gets a fresh session id, because the conversation is bound to the team, not the process. Switching back to a previously-active team restores that team's session; the previously-active team's session id remains on the map for the lifetime of the process. (Per ADR 21, team swap is a view change, not a body-lifecycle change; the session id persists because the team keeps running in `loadedTeams`.)

## Decision

### 1. Handle mints; body accepts

`startJie` (per ADR 15) is the lifecycle owner. The handle owns a `Map<team_id, session_id>` and mints a fresh session id (ULID via `ulid@2.3.0`, 26 chars) for any team not yet seen by the map. The session id is passed to the body constructor as a required parameter. The body stores it as a private readonly field and uses it on every `memory.persist` / `memory.compact` / `memory.restore` call.

```typescript
class AgentBody {
  readonly agent_key:  string;
  readonly soul:       AgentSoul;
  readonly is_leader:  boolean;
  // NEW:
  private readonly session_id: string;  // per-team session id; see 08-memory.md "Restore"
  // ...
}
```

### 2. Session id is per process × team

All agents in the same team in the same process share one session id. On team swap, the new team's session id is independent of the old team's — conversation is bound to the team, not the process. Switching back to a previously-active team reuses that team's recorded session id (the map's value); the previously-active team's bodies are **not** stopped (per ADR 21 multi-team coexistence — the team keeps running in the background), but its session id is preserved on the map for the lifetime of the process.

`memory_turns` rows are still per-agent at the row level (`agent_key` and `seq` are in the primary key), so the leader's seq 1 and the worker's seq 1 are independent rows within the team's session.

### 3. JieHandle map keys on `team_id`

The map is `Map<team_id, session_id>`. The per-`agent_key` half of the key in ADR 19's original design was redundant: the session id is shared across agents in a team, so per-agent disambiguation adds no information. Two teams that share an `agent_key` (e.g., both have a `general` role) are still disambiguated — they have different `team_id`s, so they get different `session_id`s and live in disjoint row sets in `memory_turns`.

## Rationale

- **The handle is the lifecycle owner.** `startJie` constructs bodies, swaps teams, and shuts down. Session-id-as-lifecycle-state belongs on the handle, not duplicated on each body.
- **One source of truth.** The handle's `Map<team_id, session_id>` is the only place that knows the session id for a given team in the current process. Bodies consume the value; they don't own it.
- **Team-bound conversation is the user's mental model.** The user said: "all conversation related to the team should be switched". The per-team session id makes that literal: switching teams switches session ids. The session id is the team's "current conversation" pointer.
- **Per-agent key in the map is redundant for v1.** v1 runs one team per process. The map's per-`agent_key` half only mattered if multiple agents in the same team could have different session ids — they cannot (per decision §2). Removing the redundancy simplifies the map and the type signature without losing any functionality.
- **`--continue` was already per-team.** The existing `--continue` algorithm finds the most-recent session id for the current `team_id`, not per-agent. The new shape aligns the map with the lookup: one entry per team.

## Consequences

- `08-memory.md` "Restore" — rewritten: handle mints; body accepts; per-team model; map keys on `team_id`. Internal contradiction resolved.
- `08-memory.md` "Persistence" `TurnRecord` comment — `session_id` is now "per-process × team identifier".
- `08-memory.md` "Team scoping" paragraph — map key updated from `(team_id, agent_key)` to `team_id`.
- `08-memory.md` "Integration with pi-agent" "Restore" bullet — updated to "uses the `session_id` supplied by the `JieHandle`".
- `06-agent-model.md` "AgentBody" class signature — `private readonly session_id: string` added.
- `06-agent-model.md` "ExecutionContext" — `session_id` comment updated to "per-process × team identifier".
- `06-agent-model.md` pi-agent Integration Contract — `sessionId` row's comment updated from "per-process-run ULID" to "per-team ULID".
- `09-deployment.md` step 7–8 — body construction now lists `session_id` (resolved by the handle per `08-memory.md` "Restore") in the parameters.
- `10-configuration.md` "Team Swap" — `Map<agent_key, session_id>` → `Map<team_id, session_id>`; "body mints" → "handle mints"; consult is per-team, not per-body.
- `ui/tui.md` "Model and Team Hot-Swap" — same updates as `10-configuration.md`; primary key reference updated to `(team_id, agent_key, session_id, seq)` per ADR 19.
- ADR 15 — "per body" → "per team"; map key updated to `Map<team_id, session_id>`.
- ADR 19 — `JieHandle map` section updated from `Map<(team_id, agent_key), session_id>` to `Map<team_id, session_id>` with a refinement note (the per-`agent_key` half of the key was redundant).
- `--resume` and `--continue` semantics unchanged at the user surface (per-team, scoped to the current `team_id`). The `--resume <id>` validation continues to check that the named `session_id` has rows for the current `team_id`; mismatches exit 1.
- `ExecutionContext.session_id` unchanged at the type level — its value is the body's `session_id`, which is now per-team in v1 (rather than the prior "per-process-run" framing, which happened to coincide with per-team under v1's single-team-per-process model).
- Cross-team `--resume` is not in scope for v1; the lookup returns no rows and the user sees the standard "unknown session_id" exit-1.

## Out of scope (deferred)

- **Multi-team per process**: in v1, per ADR 21. The `Map<team_id, session_id>` is already keyed correctly for this; the per-team model carries over without change. The `--continue` lookup, `--resume` validation, and team-swap flow are all `team_id`-aware.
- **Per-team session-id rotation policy** (Day 2+): the current model mints on first start and reuses thereafter. A future "rotate session id on demand" hook (for privacy, for size caps) is a future revision; not in v1.
- **Cross-team `--resume`** (deferred; see ADR 19 "Out of scope").
