# Memory

## Purpose

Team-scoped long-term memory: distilled memories of what the team's sessions established, recalled at session start and searchable mid-run. Complements the transcript store (`08-transcript.md`) — transcripts replay one session; memory survives sessions. The design is derived from TencentDB-Agent-Memory's L1 work-memory pipeline (MIT; ADR 34): scene-segmented distillation with typed, prioritized memories and budgeted recall. Not built (documented extensions): L2 scenario blocks, L3 persona/doctrine, per-role visibility, vector recall, an external-hub adapter.

## Model

```typescript
type MemoryType = "fact" | "decision" | "method" | "instruction";

interface RawMemory {
  readonly content: string;
  readonly type: MemoryType;
  readonly priority: number;
  readonly scene: string;
}

interface Memory extends RawMemory {
  readonly id: string;                 // ULID
  readonly teamId: string;             // memories belong to the team, not the agent (ADR 34)
  readonly sourceSessionId: string;
  readonly createdAt: string;          // ISO 8601
  readonly updatedAt: string;
}
```

| Type | Holds |
|---|---|
| `fact` | Established project/domain knowledge ("the auth module is still used by mobile"). |
| `decision` | A choice and its rationale. |
| `method` | A working approach that proved out. |
| `instruction` | A standing rule given by the user; always priority 100. |

Task and artifact tracking are deliberately not memory types — kanban and the artifact store own work products.

## Manager

`MemoryManager` is the module's only public service. It lives in `src/platform/memory/` and exposes four operations:

```typescript
interface MemoryManager {
  add(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number;
  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory>;
  bootstrap(teamId: string): string;
  distill(input: DistillationInput): Promise<void>;
}
```

`add` is the explicit write path. It runs through the same validation and dedup/reinforcement pipeline as distillation, and returns the number of newly stored memories.

All methods are synchronous except `distill` — SQLite access is in-process and blocking calls are microseconds; callers never await `search`, `add`, or `bootstrap`. `MemoryManagerImpl` is a thin facade over internal collaborators: `MemoryWriter` (write), `MemoryStore` (search), `MemoryBootstrap` (render), and `MemoryDistiller` (distill).

The internal `MemoryStore` is SQLite on the shared `Storage` instance:

```typescript
interface MemoryStore {
  add(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number;
  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory>;
  top(teamId: string, limit: number): ReadonlyArray<Memory>;
}
```

- **Schema**: `memory_atoms` (`id` PK, `team_id`, `content`, `type`, `priority`, `scene`, `source_session_id`, `created_at`, `updated_at`; index `(team_id, priority DESC, updated_at DESC)`, unique index `(team_id, type, content)`) plus an FTS5 virtual table over `content` (`trigram` tokenizer, `atom_id` UNINDEXED; team scoping happens on the join, not in the index). Created by `initializeSchema` (`04-storage.md`).
- **Search**: FTS5 `MATCH` ranked by `bm25()`, joined to `memory_atoms` and filtered by `team_id`. The store sanitizes the raw query into quoted, 3-or-more-character word phrases to avoid FTS5 syntax errors and to support CJK text. No vector component in v1.
- **Dedup on add**: a memory whose `content` and `type` exactly match an existing memory of the same team is reinforced rather than duplicated; `add` updates the existing memory's `priority` to the higher of the old and new values, refreshes `updated_at`, and takes the latest `scene`. New memories are inserted and `add` returns the count of newly stored memories. This replaces the borrowed design's LLM conflict pass — cheap, and sufficient while memory volume is small.
- **Priority invariant**: `add` is the single choke point — it clamps priority to 0–100 and forces `instruction` to 100. Producers (the distiller) pass parsed priorities through unmodified.

## Distillation

- **Trigger**: after a successful compaction commit, the body hands the summarized prefix — the exact messages the compactor summarized, already window-fitted — to the `MemoryManager.distill`, fire-and-forget. Sessions that never compact produce no memories in v1 (Extensions). Single-flight per body; aborted with the body; failures are WARN-logged — never a bus event, never a failed run. Distillation reads nothing but the handed prefix and writes nothing but memories, so the compactor's transcript sync check is unaffected.
- **Input rendering**: `serializeConversation(convertToLlm(prefix))` — the same text the summarizer sees.
- **LLM contract**: one `LlmService.complete` call. System prompt comes in two language templates selected by `settings.language` (`en` / `zh`); both demand a strict-JSON array of scenes, `[{ "scene": "...", "memories": [{ "content", "type", "priority" }] }]`, with the borrowed distillation rules: content must be self-contained (no pronouns needing the conversation), unconfirmed matters phrased as under discussion rather than fact, nothing that kanban/artifacts already track. Memory content is written in the conversation's language regardless of the template language — memory is recalled, not translated.
- **Parsing**: strip code fences, `JSON.parse`; a memory with an invalid `type` is dropped; `priority` parses as a number (numeric strings accepted, default 50) and passes through unmodified — the store enforces the invariant. A parse failure drops the batch (WARN), never a partial write.
- **Model**: `settings.memory.model` resolved like a soul model (unresolvable → WARN + the agent's model); absent → the agent's model.

## Bootstrap

In the body's restore phase (before `start`), the body asks `MemoryManager.bootstrap` for the formatted block and `composeSystemPrompt` places it after the role prose and available skills:

```
<memory team="<team_id>">
- [instruction] <content>
- [decision] <content> (scene: <scene>)
...
</memory>
```

`top` selects instructions first, then priority desc, `updated_at` desc, up to `bootstrapMaxEntries`. The budget keeps whole entries only — lowest-value entries are dropped until the block fits `bootstrapMaxChars`; an entry is never mid-truncated. Load failure degrades to an empty block; a body never fails to start over memory. Fresh and resumed sessions load the same team pool.

## Tools

`memory_add` and `memory_search` are opt-in per role via `tools:` frontmatter. The built-in setup-assistant team includes both.

`memory_add` parameters:

| Parameter | Meaning |
|---|---|
| `content` | Self-contained memory text. |
| `type` | `fact`, `decision`, `method`, or `instruction`. |
| `priority` | Optional 0-100 (default 50); `instruction` is always stored at 100. |
| `scene` | Optional one-line context (default `manual`). |

`memory_add` is scoped by `ExecutionContext.teamId` and `ExecutionContext.sessionId`. It stores a new memory or reinforces an existing one with the same `content` and `type`, and returns a summary line.

`memory_search` parameters:

| Parameter | Meaning |
|---|---|
| `query` | FTS query text. |
| `limit` | Default 5, capped 20. |

Scoped by `ExecutionContext.teamId` (every role searches the team pool). Result lines: `- [type] content (scene: <scene>, session: <source_session_id>, <created date>)`; no matches → `no matching memories`; memory disabled → says so.

## Configuration

`settings.language` and `settings.memory` — shapes, defaults, and validation in `10-configuration.md`. Defaults: enabled; `bootstrapMaxEntries` 12; `bootstrapMaxChars` 2000.

## Boundaries

- No event-bus events; diagnostics through the logger only.
- Never touches `memory_turns`; transcripts and memories live in disjoint tables.
- Team-scoped pool: distillation runs per agent stream, storage and recall are shared across the team's roles.

## Extensions (not v1)

Idle/turn-count trigger for sessions that never compact · per-role visibility tags · L2 scenario blocks and L3 team doctrine · hybrid vector recall · a TencentDB hub adapter behind the same interfaces (must not leak hub concepts like L0–L3 into the platform).
