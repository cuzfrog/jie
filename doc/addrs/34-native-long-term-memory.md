# ADR 34: Native Long-Term Memory

## Status

Accepted. Renames `MemoryManager` → `TranscriptStore` (subsuming the naming half of ADR 17's domain; ADR 17's scoping decisions stand).

## Context

Memory was transcript-only; external service options rejected for deploy complexity.

## Decision

### Native module
Memory atoms in SQLite (FTS5); no external service.

### Borrowed from TencentDB-Agent-Memory (MIT)
L1 pipeline design/prompts only; L2/L3 not borrowed.

### Compaction-triggered extraction
Fire-and-forget after compact; no atoms without compaction (v1).

### Team-scoped atoms
Stored per team; all roles recall same pool.

### Shared `LlmService`
Generalized from compaction; configurable `settings.memory.model`.

### Renamed to `TranscriptStore`

### Configurable extraction language

## Rationale
In-process; budgeted recall; team-scoped; extraction reuses compaction work.

## Consequences

- A native memory module extracts atoms into SQLite (FTS5 search) using the existing storage; no external service is needed.
- The compactor's private LLM call is generalized into a shared `LlmService`.
- `TranscriptStore` replaces `MemoryManager`; the contract is otherwise unchanged.
- A TencentDB adapter remains possible behind the store/extractor interfaces.
