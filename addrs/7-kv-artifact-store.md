# ADR 7: KV Artifact Store

## Status

Accepted.

## Context

`04-artifact-store.md` defined a structured artifact model:

- `ArtifactType` (team-defined categories: `task`, `research`, `plan`, etc.)
- `work_id` (team-defined work-unit identifier, required on every write)
- ULID-based auto-generated `ArtifactId`
- Separate `append_status` / `read_status` methods for status tracking
- `write_artifact(type, content)` — the agent only provided type and content; `work_id` was injected from `ExecutionContext`

This created coupling between the store and the agent's execution context: `work_id` in `ExecutionContext` was mandatory, but its origin was unclear (set by whom? when?). The DM role needed to write artifacts before the `work_id` was established via `task.recorded`.

## Decision

The artifact store is a flat key-value store:

```
write(key: string, content: string): Promise<void>
read(key: string): Promise<{ key, content, created_at } | null>
list(prefix: string): Promise<{ key, created_at }[]>
```

Two tools: `write_artifact(key, content)` and `read_artifact(key)`. The agent builds the full key (e.g. `{task_id}/plan`, `{task_id}/research`).

## Rationale

- **Client owns the key scheme.** The team blueprint defines how keys are structured. The platform imposes no schema, no reserved types, no automatic ID generation.
- **Eliminates the `work_id` bootstrapping problem.** `write_artifact` no longer needs a pre-populated `work_id` from context — the agent provides the complete key.
- **Simpler interface.** Three methods instead of five. No type enum, no auto-generated IDs, no separate status tracking methods. Status is just another key (`{task_id}/status`).
- **`work_id` removed from `ExecutionContext`.** Execution context is now just agent identity and the store reference.

## Consequences

- `ArtifactStore` interface shrinks from 5 methods (`write`, `read`, `list`, `append_status`, `read_status`) to 3 (`write`, `read`, `list`).
- `ExecutionContext.work_id` removed entirely.
- Agent `.md` files may need tool list updates: no `read_status` or `read_task_status` tool.
- `INSERT OR REPLACE` semantics — writing to an existing key overwrites. No append-only status chain. If append-only is needed, the agent includes a sequence number in the key.
