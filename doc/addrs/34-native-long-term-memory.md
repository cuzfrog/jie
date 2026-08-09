# ADR 34: Native Long-Term Memory

## Status

Accepted. Renames `MemoryManager` → `TranscriptStore` (subsuming the naming half of ADR 17's domain; ADR 17's scoping decisions stand).

## Context

jie's memory is transcript-only: `memory_turns` persists conversation rows and compaction summarizes the context window, but nothing survives across sessions as knowledge. Decisions, facts, and working methods are re-established (or re-litigated) every session, in every team.

TencentDB-Agent-Memory (MIT) solves this space as an external service stack: an L0→L3 layered memory core (raw conversation → extracted atoms → scenario blocks → persona/doctrine), an async extraction pipeline, hybrid BM25+vector recall with budget caps, and a team/user/agent ACL model. Three integration options were evaluated:

1. **Run the service, integrate via SDK/HTTP proxy.** The SDK is a thin HTTP client — it requires the running stack (MemoryCore + optional panel/knowledge containers). jie would gain L2/L3 distillation, panels, and ACLs for free, at the cost of a docker dependency, a user-identity provisioning flow jie has no concept for (there is no user id — `team_id` is the only cross-cutting namespace), and degradation handling whenever the service is down.
2. **Vendor their core code.** The extraction pipeline is coupled to a Node HTTP gateway, a sqlite/tcvdb store-pool factory, and redis/local state backends — deploy-mode branching throughout. Lifting it into jie's bun/awilix/module-gate conventions means maintaining a diverging fork in a foreign style.
3. **Natively reimplement the valuable subset.** The genuinely valuable parts are the layering idea, the extraction prompt designs, and the budgeted recall — all portable as design and text; the plumbing is replaceable because jie is single-process and single-machine.

## Decision

### 1. Long-term memory is a native jie-platform module; no external service

A new `memory/` module stores **memory atoms** — distilled facts extracted from conversation — in the existing `Storage` (SQLite), with FTS5 search. Nothing in the memory path requires a process other than jie itself.

### 2. Design and prompts are borrowed from TencentDB-Agent-Memory

The extraction contract is adapted from their L1 work-memory pipeline (MIT-licensed): scene segmentation over a conversation window, per-atom `content`/`type`/`priority`, strict-JSON output, and accuracy-attribution rules (unconfirmed content must be phrased as under discussion, not as fact). The MIT license requires retaining the copyright notice; the derivation is recorded here. Not borrowed: L2 scene blocks (an LLM with file tools maintaining markdown — a second agent inside the memory system), L3 persona generation, LLM-based conflict dedup, vector search, timer/checkpoint pipeline scheduling. Each is a documented extension point, not a rejected idea.

### 3. L0 stays `memory_turns`; extraction rides compaction (v1)

The transcript remains the raw layer; atoms are extracted from the same prefix compaction summarizes, fire-and-forget after a successful compact. Sessions that never compact produce no atoms in v1 — acceptable because compaction fires on every context-window threshold and short sessions are low-yield; an idle/turn-count trigger is the documented extension. Extraction never touches `memory_turns`, so the compactor's storage sync check is unaffected.

### 4. Atoms belong to the team, not the agent

Their isolation triple is per-agent; jie inverts it. Extraction runs per agent stream, but atoms are stored team-scoped and every role recalls the same pool — scout's discovery is builder's context. Per-role visibility tagging is an extension; the schema omits it until needed.

### 6. One-shot LLM calls become a shared platform service

Compaction's private `summarizeConversation` (pi-ai `streamSimple` + `retryAssistantCall`) is generalized into an `LlmService` (`07-llm-service.md`): model in, text out, credentials resolved internally. Compaction and memory extraction are its first two consumers; future tasks (text summarization, translation) reuse it. The extraction model is configurable (`settings.memory.model`), defaulting to the agent's model, so a cheap model can serve extraction without touching the working model.

### 7. `MemoryManager` is renamed `TranscriptStore`

The new domain owns the word "memory". The transcript store's contract is unchanged (ADR 17 stands); only the name moves — type, class, file, DI key, and live specs.

### 8. Extraction language is configurable; content language is not

`settings.language` (`"en" | "zh"`, default `"en"`) selects the extraction prompt template. Atom content is always written in the language of the source conversation — memory is recalled, not translated.

## Rationale

- **In-process runtime (ADR 5) extends to memory.** A memory backend that can be down, needs provisioning, or requires docker contradicts a harness that boots with `bun` alone. Tests run with mocks; e2e never needs a service.
- **Context is precious.** Recall is budgeted (entry count + total chars) and bootstrap is static per body construction; nothing enters context without a cap.
- **The team is the memory boundary.** jie's only cross-session namespace is `team_id` (ADR 17); atoms inherit it. User-level memory would need a user identity jie does not have.
- **Extraction reuses paid work.** Compaction already selects, projects, and window-fits a prefix; extracting from the same prefix costs one extra call and zero new plumbing.

## Consequences

- A native memory module extracts atoms into SQLite (FTS5 search) using the existing storage; no external service is needed.
- The compactor's private LLM call is generalized into a shared `LlmService`.
- `TranscriptStore` replaces `MemoryManager`; the contract is otherwise unchanged.
- A TencentDB adapter remains possible behind the store/extractor interfaces.
