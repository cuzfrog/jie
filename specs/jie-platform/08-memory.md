# Memory

## Purpose

The Memory subsystem manages agent context lifecycle: the LLM conversation history, compaction of stale turns, and persistence across restarts. It is owned by `MemoryStore`, a private component of `AgentBody`. Memory operations are internal to the agent — they are **not** published on the event bus.

## MemoryStore

```typescript
interface MemoryStore {
  // Append a conversation turn to the current session's history.
  append(turn: Turn): void;

  // Return the current context-window view: the prefix (system prompt +
  // pinned turns) followed by the N most recent uncompacted turns up to a
  // token budget. Older turns exist on disk but are not passed to the LLM.
  context(token_budget: number): Turn[];

  // Compact the oldest uncompacted turns into a summary turn, reducing the
  // live token count. The summary replaces the compacted turns in the
  // logical history; the original turns are preserved on disk for audit.
  compact(target_tokens: number): void;

  // Persist the full history to durable storage (snapshot).
  // Called periodically and on agent shutdown.
  flush(): Promise<void>;

  // Reload state from a previous snapshot, if one exists.
  // Returns false if no snapshot is found (fresh start).
  reload(agent_id: string, session_id: string): Promise<boolean>;
}

interface Turn {
  role:     'system' | 'user' | 'assistant';
  content:  string;
  summary?: string;   // non-null when this turn is the result of compaction
}
```

`MemoryStore` is initialized by `AgentBody` at startup. It holds the full conversation history (append-only on disk) and a sliding window view that is passed to the LLM on each turn.

## Compaction

Compaction is the process of summarizing old turns to free token budget. It is triggered when the estimated token count of the in-window history exceeds a configured threshold.

### Trigger

Compaction fires when `context(token_budget).estimated_tokens > threshold`, where `threshold` is a fraction of the model's context window (default 0.7). The body checks after every `assistant` turn before constructing the context for the next LLM call.

### Policy

1. The oldest uncompacted turn is selected as the boundary. All turns up to and including it are candidates for compaction.
2. A system-level summary prompt is injected: "Summarize the following conversation segment, preserving all task-relevant decisions, errors encountered, file paths touched, and unresolved questions."
3. The compacted turns are replaced in the sliding window by a single `assistant` turn with `summary` set to the compaction result.
4. Original turns are **never deleted** — they remain on disk for full-replay audit and debugging.
5. Compaction does not decrement `error_turn_budget` or `total_turn_budget`. It is a memory operation, not a tool call.

### Non-publication

Compaction is an internal agent operation. The body performs it silently — no event is published, no tool call is recorded, and the TUI sees nothing. The LLM is not informed of compaction; from its perspective, the conversation history simply has an injected summary turn.

## Context Lifecycle

### Session Start

On receiving an inbound event, the body:

1. Constructs the **prefix**: system prompt fragments (`identity`, `tools_guide`, `constraints`, `prose` from `AgentSoul`) plus the inbound event content.
2. If a prior snapshot exists for this `(agent_id, session_id)`, `MemoryStore.reload()` restores the full history from disk. The body resumes the conversation where the prior session left off.
3. Appends the inbound event as a `user` turn.

### Turn Loop

Each LLM turn:

1. Body calls `memory.context(token_budget)` to get the current window.
2. Window is sent to the LLM.
3. LLM response is appended as `assistant` turn. If the LLM called tools, each `tool_call` / `tool_result` pair is appended as synthetic turns (not exposed as `agent.tool.*` events on the bus — those are separate telemetry).
4. Compaction check runs. If the window exceeds threshold, compaction fires and the window is replaced.

### Agent Restart

When an agent restarts (supervisor restart or crash recovery):

1. `AgentBody.start()` calls `memory.reload(agent_id, session_id)`.
2. If a snapshot exists, the full conversation history is restored. The body re-subscribes to NATS and resumes its event loop from the last unacknowledged JetStream event.
3. If no snapshot exists (fresh start, or the snapshot was intentionally cleared), the agent starts with an empty history. The system prompt prefix is still loaded.
4. Compaction summaries are preserved in the snapshot — an agent restarting mid-compaction sees the summary, not the raw original turns (though the originals remain on disk).

### Shutdown

On clean exit, `memory.flush()` persists the full history. On crash, the most recent auto-flushed snapshot is the recovery point.

## Persistence

```typescript
interface TurnRecord {
  session_id: string;
  agent_id:   string;
  seq:        number;       // monotonically increasing within the session
  role:       string;
  content:    string;
  summary:    string | null;
  created_at: string;       // ISO 8601
}
```

Turns are stored in the workspace's artifact store (SQLite, same database as artifacts) in a `memory_turns` table. The table is keyed by `(agent_id, session_id, seq)`. This keeps conversation history colocated with work artifacts and avoids a second storage surface.

Auto-flush writes a snapshot every **10 turns** (configurable). On `flush()`, the full history is checkpointed to disk. On `reload()`, the entire `(agent_id, session_id)` history is read back into memory.

v1 keeps all turns indefinitely (same retention policy as the artifact store — see `04-artifact-store.md`). GC and pruning are deferred to the Storage Maintenance chapter (TBD).

## Leader Agent Working Memory

The leader agent (as designated by the team blueprint) may maintain in-memory state beyond conversation history:

- **Prompt queue**: FIFO queue of user prompts received while a work unit is in flight. On completion of the current work unit, the leader dequeues the next prompt. This queue is lost on restart; in v1, queued prompts are not persisted.
- **In-flight awareness**: the leader tracks whether any work unit is currently in flight using status reads plus its own working memory. On reload, the leader reads the artifact store to discover any work unit that was in a non-terminal status at the time of crash and resumes monitoring it.

## Integration with LLM Library

`MemoryStore` produces a `Turn[]` suitable for the LLM library. The body is responsible for converting the turn list into the library's expected message format. `MemoryStore` does not depend on the LLM library — it produces a plain structured turn list.

Compaction summaries are generated by a dedicated compaction call: the body invokes the LLM with a short system prompt asking it to summarize. This is a separate LLM call that consumes one turn (decrements `total_turn_budget`) but does not trigger the normal tool-call loop.
