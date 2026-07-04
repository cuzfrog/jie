# ADR 20: `MemoryManager` Session-Id Queries; `--resume` Resolution

## Status

Accepted. `MemoryManager` exposes only `hasSession(team_id, session_id)`; `--resume` is resolved by the platform via `createJiePlatform`'s `resumeSessionId` option. `--continue` no longer exists — the CLI was simplified to `jie -p` + `--resume <id>` only (no "most recent" lookup).

## Context

`ui/cli.md` originally defined two CLI flags that required the platform to look up `memory_turns` rows:

- `jie --continue` — find the most-recent `session_id` for the current `team_id` (`MAX(created_at)` over its rows, scoped to the team).
- `jie --resume <session_id>` — validate that the named `session_id` has at least one row for the current `team_id`. If not, exit 1 with `unknown session_id: <value>`.

During code review the team flagged that "most recent session" carries no useful definition: a session is an opaque token the user chose; "the last one used" is a derived notion that does not serve any clearer workflow than `--resume <id>`. The `--continue` flag and the `mostRecentSessionId` query were removed in favour of the explicit `--resume <id>` only.

## Decision

### 1. `MemoryManager` exposes only `hasSession`

```typescript
interface MemoryManager {
  persist(message: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  compact(range: [number, number], summary: AgentMessage, agent_key: string, session_id: string, team_id: string): void;
  restore(agent_key: string, session_id: string, team_id: string): Promise<AgentMessage[]>;
  hasSession(team_id: string, session_id: string): boolean;
}
```

`hasSession` is a pure read; no state change. The `(team_id, agent_key, session_id, seq)` primary key makes the validation an index seek.

### 2. `JiePlatformOptions.resumeSessionId`

```typescript
export interface JiePlatformOptions {
  cwd:           string;
  homeJieDir:    string;
  projectJieDir: string | null;
  resumeSessionId?: string;        // --resume <id>
}
```

The CLI passes intent; `createJiePlatform` does the validation. The CLI does not import `MemoryManager` or run session-id SQL itself.

### 3. Resolution algorithm

| Flag set            | Action                                                            | Failure mode                         |
|---------------------|-------------------------------------------------------------------|--------------------------------------|
| `resumeSessionId`   | Validate via `memory.hasSession(team_id, resumeSessionId)`.       | Hard fail: `unknown session_id: <id>`|
| (no flag)           | Mint fresh `session_id` (ULID).                                   | n/a                                  |

The resolved value (validated or minted) is recorded in the platform's `Map<team_id, session_id>` (per ADR 18) and threaded to every body in the startup team.

### 4. CLI changes

`ui/cli.md` simplifies to a single resume flag:

- `--resume <id>`: CLI sets `JiePlatformOptions.resumeSessionId = <id>`. The CLI does not validate; the platform does. On validation failure, the platform throws `UNKNOWN_SESSION`.
- The `--continue` flag is removed entirely from `cli-flags.ts`. The "single SQL statement" prose that described the deprecated path is replaced by "no most-recent-session lookup".

## Rationale

- **"Most recent session" was ambiguous.** A session is opaque. The user's worked example was always "I have a session id" — the implicit "find it for me" path saved the user from typing an id they already had cached elsewhere, but at the cost of an extra index and an extra code path. Dropping it simplifies both schema and CLI.
- **One owner of session-id state.** The handle's `Map<team_id, session_id>` (per ADR 18) is the canonical source. The CLI is a thin caller; the platform owns the lifecycle. Putting the queries on `MemoryManager` and the validation in `createJiePlatform` keeps schema knowledge inside the platform package.
- **Index stays.** `idx_memory_turns_team_session_created` (added in ADR 17) still supports `--resume` validation and future per-team queries, and is cheap. The SQLite index was not removed.

## Consequences

- `08-memory.md` "MemoryManager" interface contains only `hasSession`; `mostRecentSessionId` is gone. `SqliteMemoryManager` documents the remaining implementation.
- `08-memory.md` "Restore" notes clarify that `createJiePlatform` resolves the session, not the body.
- ADR 13 `JiePlatformOptions` does **not** include `continueLastSession`; the `createJiePlatform` step 2 is "construct a `MemoryManager` from `Storage`; resolve `--resume` per this ADR; record in the handle's session map".
- `09-deployment.md` "Startup Sequence" wording simplifies accordingly.
- `ui/cli.md` documents only `--resume <id>`; the `--continue` paragraph is removed. The error message `unknown session_id: <value>` is preserved.
- `06-agent-model.md` "AgentBody" class signature is unchanged — bodies still receive `session_id` from the handle, not from the CLI.
- Out of scope (deferred): cross-team `--resume` (resuming a session from a different team). `--resume` is team-scoped by the `hasSession` query; cross-team resume returns `false` and exits 1. This is consistent with ADR 17.
