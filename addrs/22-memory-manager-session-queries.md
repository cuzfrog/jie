# ADR 22: `MemoryManager` Session-Id Queries; `startJie` Resolves `--continue` / `--resume`

## Status
Accepted 2026-06-13. Closes Group 1 of fresh review pass 4.

## Context

`ui/cli.md` defines two CLI flags that require the platform to look up `memory_turns` rows:

- `jie --continue` — find the most-recent `session_id` for the current `team_id` (i.e. `MAX(created_at)` over its rows, scoped to the team).
- `jie --resume <session_id>` — validate that the named `session_id` has at least one row for the current `team_id`. If not, exit 1 with `unknown session_id: <value>`.

The `MemoryManager` interface (`08-memory.md`) has only `persist`, `compact`, `restore`. It does not expose these lookups. The existing spec for `--continue` was a vague "single SQL statement against the current CWD's `ArtifactStore`" — but `ArtifactStore` does not expose raw SQL, and the spec is silent on where the query lives.

The fresh review pass 4 surfaced four implementation seams:

1. **No query API.** `MemoryManager` lacks the two methods the CLI needs.
2. **No caller.** The CLI runs before `startJie` constructs the `MemoryManager`. The CLI does not import `MemoryManager` directly; the platform's `startJie` is the lifecycle owner.
3. **Validation owner.** Who exits 1 on `--resume` failure? The CLI or `startJie`?
4. **Idempotence.** The CLI flow today calls `jie --resume <id>` then `startJie`. If `startJie` re-validates, that's a second query — wasteful but harmless. If only the CLI validates, `startJie` must accept the validated id as authoritative.

## Decision

### 1. `MemoryManager` gains two query methods

```typescript
interface MemoryManager {
  // ... existing methods unchanged ...

  /** Return the most-recent `session_id` for `team_id` (by MAX(created_at)
   *  over its rows in `memory_turns`), or `null` if no prior session exists.
   *  Scoped to `team_id` alone (per ADR 19). Used by `jie --continue`. */
  mostRecentSessionId(team_id: string): string | null;

  /** Return `true` if at least one row in `memory_turns` matches
   *  (team_id, session_id). Used by `jie --resume <id>` validation. */
  hasSession(team_id: string, session_id: string): boolean;
}
```

Both are pure reads; no state change. Implementations are straight SQL against the `memory_turns` table. The `idx_memory_turns_team_session_created` index on `(team_id, session_id, created_at)` makes the `--continue` aggregate an index-only scan; the `(team_id, agent_key, session_id, seq)` primary key makes the `--resume` validation an index seek.

`SqliteMemoryManager` implements them:

```typescript
mostRecentSessionId(team_id: string): string | null {
  const rows = this.storage.query(
    `SELECT session_id FROM memory_turns
     WHERE team_id = ? GROUP BY session_id
     ORDER BY MAX(created_at) DESC LIMIT 1`,
    [team_id]
  );
  return rows.length === 0 ? null : (rows[0][0] as string);
}

hasSession(team_id: string, session_id: string): boolean {
  const rows = this.storage.query(
    `SELECT 1 FROM memory_turns
     WHERE team_id = ? AND session_id = ? LIMIT 1`,
    [team_id, session_id]
  );
  return rows.length > 0;
}
```

### 2. `StartJieOptions` gains `continueLastSession`

```typescript
export interface StartJieOptions {
  workspace:   string;
  settings:    MergedSettings;
  storage:     Storage;
  teamId:      string | "minimal";
  mcpServers:  McpServerConfig[];
  resumeSessionId?:     string;        // --resume <id>
  continueLastSession?: boolean;      // --continue
  onIdle?:     () => void;
}
```

The CLI passes intent; `startJie` does the work. The CLI does not import `MemoryManager` or run session-id SQL itself.

### 3. `startJie` resolution algorithm

`startJie` constructs a `MemoryManager` (per ADR 15 step 3) and runs the resolution before constructing bodies:

| Flag set | Action | Failure mode |
|---|---|---|
| `resumeSessionId` only | Validate via `memory.hasSession(team_id, resumeSessionId)`. If `false` → exit 1 with `unknown session_id: <value>`. If `true` → use it. | Hard fail. |
| `continueLastSession: true` | Query `memory.mostRecentSessionId(team_id)`. If `null` → WARN to stderr `no prior session in this directory; starting a new session` and mint fresh. If non-null → use it. | Non-fatal WARN. |
| Neither | Mint fresh `session_id` (ULID). | n/a |
| Both | The CLI rejects this combination up front (per `ui/cli.md`); `startJie` does not re-check. | n/a (CLI exits 1) |

The resolved value (or the minted value) is recorded in the handle's `Map<team_id, session_id>` (per ADR 20) and passed to every body in the startup team. The handle's map is `team_id → session_id`; the `--continue` lookup is team-scoped (per ADR 19).

### 4. CLI changes

`ui/cli.md` simplifies the `--continue` / `--resume` flow:

- `--resume <id>`: CLI sets `StartJieOptions.resumeSessionId = <id>`. The CLI does not validate; `startJie` does. On validation failure, `startJie` exits 1 with the spec'd error message. The CLI's only role is to pass the value through.
- `--continue`: CLI sets `StartJieOptions.continueLastSession = true`. CLI does not run a pre-query. `startJie` does the resolution and may emit the WARN to stderr.
- `--resume and --continue together`: CLI exits 1 with `cannot use --resume and --continue together` (existing rule, unchanged).

## Rationale

- **One owner of session-id state.** The handle's `Map<team_id, session_id>` is the canonical source (per ADR 20). The CLI is a thin caller; the platform owns the lifecycle. Putting the queries on `MemoryManager` (a platform type) and the resolution in `startJie` (the platform's lifecycle entry) keeps the schema knowledge inside the platform package.
- **CLI is interface-stable.** The CLI's `jie --continue` / `jie --resume <id>` user-facing flags are unchanged. The implementation shifts from "CLI opens a separate `Storage` and runs SQL inline" (fragile, leaks schema) to "CLI passes intent to `startJie`, which owns the work" (clean).
- **`startJie` is already the failure-exit point.** Per `09-deployment.md` "Startup Sequence" and ADR 15, `startJie` runs the full startup sequence and exits 1 on hard failures (model pre-check, team not found, agent load failure). Adding `--resume` validation to that list is consistent; the user-visible error message is unchanged.
- **Index supports both queries.** `idx_memory_turns_team_session_created` (added in ADR 19) already exists for the `--continue` aggregate; the primary key already supports the `--resume` validation seek. No new index is needed.
- **Methods are pure reads.** Neither `mostRecentSessionId` nor `hasSession` mutates state. They are safe to call from any caller; no transaction or ordering constraints.

## Consequences

- `08-memory.md` "MemoryManager" interface gains the two methods; `SqliteMemoryManager` documents the implementations.
- `08-memory.md` "Restore" notes (and `06-agent-model.md` "Integration with pi-agent" "Restore" note) clarify that `startJie` does the resolution, not the body.
- `addrs/15-platform-entry-function.md` `StartJieOptions` interface gains `continueLastSession?: boolean`; the `startJie` step 2 is expanded to "construct a `MemoryManager` from `Storage`; resolve `--continue` / `--resume` per ADR 22; record in the handle's session map".
- `09-deployment.md` "Startup Sequence" step 7 (`Instantiate InProcessEventBus and the MemoryManager per body`) becomes: "Construct a `MemoryManager` from the open `Storage`. If `continueLastSession` is set, run `mostRecentSessionId(team_id)`; if `resumeSessionId` is set, validate via `hasSession(team_id, resumeSessionId)`; record the resolved value in the handle's `Map<team_id, session_id>` (per ADR 20). Construct per-body `MemoryManager` instances sharing the same `Storage`; each body closes over its `session_id` from the handle."
- `ui/cli.md` `jie --continue` / `jie --resume` flows are rewritten to pass intent via `StartJieOptions`; the "single SQL statement" prose is replaced with the `startJie` delegation. The user-visible behavior (including error messages) is unchanged.
- `06-agent-model.md` "AgentBody" class signature is unchanged — bodies still receive `session_id` from the handle, not from the CLI.
- Out of scope (deferred): cross-team `--resume` (resuming a session from a different team). `--resume` is team-scoped by the `hasSession` query; cross-team resume silently returns `false` and exits 1. This is consistent with the existing spec and ADR 19.
- Out of scope (deferred): `--continue` resolution at team-swap time (i.e., resuming a different session for a swap-loaded team). The handle's session map is the runtime source; `--continue` is a startup-time override only. Day 2+ may add a slash command.

## References

- Closes Group 1 of fresh review pass 4 (`review-tracker.md`).
- Modifies: `08-memory.md` (interface, restore), `06-agent-model.md` (pi-agent integration), `09-deployment.md` (startup sequence), `ui/cli.md` (CLI flows), `addrs/15-platform-entry-function.md` (StartJieOptions).
- Depends on: ADR 19 (memory turns team-scoped — the index that supports `--continue`), ADR 20 (per-team session id, handle's map).
