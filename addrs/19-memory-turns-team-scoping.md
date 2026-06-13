# ADR 19: Memory Turns Are Team-Scoped

## Status

Accepted 2026-06-13. Captures the schema, API, and semantic shift introduced by adding `team_id` as the namespace for `memory_turns`.

## Context

The fresh review pass on 2026-06-13 surfaced two issues that resolved together:

1. **`--continue` "most recent" was ambiguous** — the spec said "highest `created_at`" but each `memory_turns` row has its own timestamp; "most recent session" is a derived notion.
2. **`--continue` needed to be team-scoped** — a user who ran `jie --team A` yesterday and `jie --team B` today should resume B's last session, not A's.

The natural-looking filter for team scoping was `agent_key IN (current team's agent_keys)`. This breaks when two teams both contain a role with the same name (e.g., both have a `general` → both have `agent_key = general-1`). The two `general-1` agents live in different teams but share an `agent_key`; filtering by `agent_key` alone conflates their conversation histories.

The v1 spec explicitly accepted this collision risk: it told users to "avoid collisions by naming roles uniquely across teams" and added a startup WARN. That was the wrong shape — the platform should namespace, not the user. The user can reuse role names freely across teams; `team_id` does the disambiguation.

## Decision

`team_id` becomes a first-class column in `memory_turns` and the namespace for the table.

### Schema

```sql
CREATE TABLE IF NOT EXISTS memory_turns (
  team_id    TEXT    NOT NULL,
  session_id TEXT    NOT NULL,
  agent_key  TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  role       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  compacted  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (team_id, agent_key, session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_memory_turns_team_session_created
  ON memory_turns (team_id, session_id, created_at);
```

- Primary key includes `team_id` and `agent_key` because **memory belongs to an individual agent**: each agent has its own `seq` counter within a session. The leader's seq 1 and the worker's seq 1 are independent rows. `seq` is per-(team, agent, session), not per-session.
- The new index `(team_id, session_id, created_at)` supports the `--continue` aggregate lookup as an index-only scan. It is added in v1, not deferred — the lookup pattern is the platform's primary cross-process-run entry point, and v1 DBs may grow.
- The old `idx_memory_turns_session` on `(agent_key, session_id, seq)` is dropped — its column list is a prefix of the new primary key, so the primary key covers the same access path.

### API

`MemoryManager` methods all take a `team_id: string` parameter:

```typescript
interface MemoryManager {
  persist(message: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  compact(range: [number, number], summary: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  restore(agent_key: string, session_id: string, team_id: string): Promise<AgentMessage[]>;
}
```

The body knows its `team_id` at construction (the team resolution flow at `09-deployment.md:30-40` resolves the team id and constructs bodies from it). The body closes over `team_id` and passes it to every memory call. `ExecutionContext` also exposes `team_id` (per `06-agent-model.md`) so tools can build team-scoped keys if they need to.

### `--continue` algorithm

```sql
SELECT session_id
FROM memory_turns
WHERE team_id = ?
GROUP BY session_id
ORDER BY MAX(created_at) DESC
LIMIT 1;
```

The `idx_memory_turns_team_session_created` index makes this an index-only scan. No `agent_key` filter — `team_id` alone is the namespace. A session with one row and a session with thousands are both valid candidates; the most recent by `MAX(created_at)` wins. Empty result: WARN to stderr (`no prior session in this directory; starting a new session`) and proceed as if `--continue` were not given.

### `JieHandle` map

The handle's in-memory session map keys on `(team_id, agent_key)`:

```typescript
type JieHandle = {
  // ...
  private sessionMap: Map<string /* composite "team_id|agent_key" */, string /* session_id */>;
  // ...
};
```

On team swap, the handle is consulted per `(team_id, agent_key)` tuple; switching to a different team yields fresh `session_id`s for the new team's `agent_key`s — memory is per-agent-per-team.

### Removed

- The `08-memory.md` "Cross-team agent_key collisions" section is removed. With `team_id` as a first-class column, two teams with the same `agent_key` live in disjoint row sets. There's no collision to warn about.
- The startup WARN that fired "if a freshly-loaded team would create `agent_key` rows that already exist for the current `session_id`" is removed (no longer possible).
- The "users avoid collisions by naming roles uniquely across teams" guidance is removed. Users can name roles freely, including reusing names across teams.

## Rationale

- **The platform namespaces, not the user.** A user who installs a `general` role in two teams should not be told to rename one. `team_id` is the platform's natural disambiguation point — it already exists in the team resolution flow and identifies the user's intent.
- **Memory is per-agent.** The leader's conversation and the worker's conversation are independent. The leader doesn't see the worker's history; the worker doesn't see the leader's. This is a fundamental property of agent design. Putting `agent_key` in the primary key makes the per-agent memory stream the row's identity, not a column among many.
- **Indexes are v1, not deferred.** The `--continue` lookup is the platform's primary cross-process-run entry point. A user resuming a session should not see a slow startup because we deferred a one-line index. Per the design principle "we always need to consider performance" — adding the index at v1 is one CREATE INDEX line; deferring it means the spec looks cleaner but a future implementer has to add it anyway, and the implementation may not do it correctly.
- **The collision WARN was a workaround.** It told the user "you have a problem; resolve it." That's the wrong direction — the platform should have a namespace that makes the problem impossible. Removing the WARN and the workarounds around it is a simplification, not a regression.

## Consequences

- Schema change: `memory_turns` gains a `team_id` column; primary key changes; one new index added; one redundant index dropped.
- API change: `persist`, `compact`, `restore` all take `team_id`.
- Semantic shift: `session_id` is no longer the only namespace. Two teams with the same `agent_key` no longer share rows. The `JieHandle`'s map is keyed by `(team_id, agent_key)`.
- The cross-team collision section and startup WARN are removed. The `agent_key` self-test in `06-agent-model.md`'s startup pre-check (if it referenced collision detection) is also removed.
- `ExecutionContext` exposes `team_id`. Tools that need it (e.g., for team-scoped artifact keys) can use it; most tools don't.
- `--resume <session_id>` is team-scoped implicitly: it looks up rows matching the resolved `team_id` plus the named `session_id`. Resuming a session from a different team requires explicit handling (currently: the lookup just returns empty; a future revision may add a clear error message).
- The v1 DB hasn't shipped, so the schema change is free — no migration needed. The CREATE TABLE IF NOT EXISTS picks up the new shape on first run.

## Out of scope (deferred)

- **Cross-team `--resume`**: explicit resume of a session owned by a different team. The current spec says "must exist in `memory_turns` (i.e. some prior `persist()` call wrote rows under it for the current `team_id`)" — cross-team resume silently returns no rows and proceeds with a fresh session. A future revision may add an error message; not blocking v1.
- **Multi-level compaction hierarchy**: the schema change to `memory_turns` doesn't preclude adding a `parent_summary_id` column to a future `memory_summaries` table. Out of scope for v1.
- **Per-team retention policy**: all rows in `memory_turns` are kept indefinitely in v1 (per `04-storage.md` "Retention"). Per-team retention is a Day 2+ concern (backlog #7).
