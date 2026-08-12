# ADR 17: Memory and Session Model

## Status

Accepted. Subsumes ADR 18 (session id per team) and ADR 20 (MemoryManager session queries, `--resume` resolution).

## Context

Two teams can both contain a role with the same name (both have a `general` → both get `agent_key = general-1`). Namespacing memory rows by `agent_key` alone conflates their histories. An early spec accepted this collision and told users to "avoid collisions by naming roles uniquely across teams" with a startup WARN — the wrong shape: the platform should namespace, not the user.

Separately, the session-id lifecycle was inconsistent: the spec disagreed on who mints the session id (body vs handle) and on its scope (per-process, per-team, per-agent), and a `--continue` "most-recent session" lookup existed alongside `--resume <id>`.

## Decision

### `team_id` column
First-class column (with index) namespacing memory by team; disjoint per-team rows.

### 2. `session_id` is per process × team; the platform mints, the body accepts

`createJiePlatform` mints a fresh session id (ULID) per loaded team and records it in a private `Map<team_id, session_id>` closure field (not part of the `JiePlatform` interface; lost on process exit). The body receives `session_id` as a required constructor parameter and uses it on every memory call. All agents in the same team in the same process share one session id — conversation is bound to the team, not the process or the agent.

### 3. `MemoryManager` is team-scoped on every method

```typescript
interface MemoryManager {
  persist(message: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  compact(range: [number, number], summary: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  restore(agent_key: string, session_id: string, team_id: string): Promise<AgentMessage[]>;
  hasSession(team_id: string, session_id: string): boolean;
}
```

`hasSession` is a pure read (an index seek on the primary key); it exists solely for `--resume` validation. There is no most-recent-session query.

### 4. `--resume` is the only cross-process-run entry point

The CLI passes intent via `JiePlatformOptions.resumeSessionId`; `createJiePlatform` validates via `memory.hasSession(team_id, id)` and throws `UNKNOWN_SESSION` on mismatch (CLI exits 1 with `unknown session_id: <id>`). Without the flag, a fresh ULID is minted. The CLI does not import `MemoryManager` or run session-id SQL itself. `--continue` does not exist: "the most-recent session" is a derived notion over an opaque token that serves no workflow `--resume <id>` doesn't.

## Rationale

- **The platform namespaces, not the user.** `team_id` already exists in the team resolution flow and identifies the user's intent; a user who installs a `general` role in two teams should not be told to rename one.
- **The platform is the lifecycle owner.** One `Map<team_id, session_id>` on the platform is the single source of truth for session ids; bodies consume the value, they don't own it.
- **Schema knowledge stays inside the platform.** Session queries live on `MemoryManager`; validation lives in `createJiePlatform`; the CLI is a thin caller.
- **The index is cheap and primary.** `idx_memory_turns_team_session_created` supports `--resume` validation and per-team queries as index-only scans; adding it now avoids a future implementer re-deriving it.

## Consequences

- `ExecutionContext` exposes `team_id`. Cross-team resume out of scope.
