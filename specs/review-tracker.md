# Spec Review — Tracking Document

This file tracks the review of `specs/` for problems and gaps. It is designed to be resumable: any agent or human picking this up can continue from the next `pending` item or group.

## Status Legend

- `pending` — not yet reviewed
- `in_progress` — currently being interviewed / discussed
- `resolved` — decision made, spec edits queued or completed
- `conditional` — decision recorded but depends on another (still-open) decision
- `deferred` — acknowledged, parked for a later chapter or phase
- `dropped` — judged non-issue after discussion

## How to Use

1. Pick a group. Each group is largely self-contained; you can address it in a fresh agent context.
2. Within the group, walk items top-to-bottom; for each: mark `in_progress`, discuss with user, capture decision, apply edits, mark `resolved`.
3. If an item is blocked by a cross-group decision, mark `conditional` and note the dependency.
4. When the whole group is closed, update **Group Status**.

## Groups

| Group | Theme | Status |
|---|---|---|
| A | Event protocol & emission | complete |
| B | Task & session lifecycle | complete |
| C | Boundary & external integrations | complete |
| D | Code & module discipline | complete |
| E | Roles & pipeline shape | complete |
| F | Observability & debugging | complete |
| G | Process & deployment topology | complete |
| H | Identifier & path conventions | complete |
| I | Glossary / TBD dependencies | complete |

---

## Group A — Event protocol & emission

**Status: complete.** All items resolved; rows removed to save context. Load-bearing decisions are summarized in `handoff.md` and persisted in the spec files (`02`, `03`, `07`, `08`, `09`, `00`, `11`, `12`).

---

## Group B — Task & session lifecycle

**Status: complete.** All items resolved; rows removed to save context. Decisions are persisted in the spec files (`00`, `02`, `03`, `04`, `07`, `08`, `09`, `12`).

---

## Group C — Boundary & external integrations

**Status: complete.** All items resolved; rows removed. Decisions are persisted in the spec files (`02`, `03`, `08`, `11-ui/tui.md`).

---

## Group D — Code & module discipline

**Status: complete.** All items resolved; rows removed. Decisions are persisted in `05-module-descriptor.md` (user-wins conflict detection via body-tracked read cache) and `00-overview.md` (expanded "Frozen" glossary entry covering both with-descriptor and without-descriptor cases).

---

## Group E — Roles & pipeline shape

**Status: complete.** All items resolved; rows removed. Decisions are persisted in the spec files: pipeline stays mandatory for v1 with trivial-task fast-path deferred to a new chapter (open item #13); budgets moved from `AgentSoul` to `AgentBody`; `run_tests` replaced by `bash` built-in on Implementer, removed from Reviewer.

---

## Group F — Observability & debugging

**Status: complete.** All items resolved; rows removed. Decisions: `agent_id` uses `{role}-{8-hex}` random format, minted fresh on every process start. Tool telemetry via new ephemeral event types `agent.tool.call` and `agent.tool.result` (metadata + middle-truncated I/O at 4 KiB, observer-only, on by default). Persisted in `03-event-system.md` (identifiers, event types, payloads, durability, subscriptions) and `07-agent-model.md` (Tool Telemetry section).

---

## Group G — Process & deployment topology

**Status: complete.** All items resolved; rows removed. Decisions are persisted in the spec files (`02`, `07`, `10`, `01`, `08`, `12`, new `13-deployment.md`).

---

## Group H — Identifier & path conventions

**Status: complete.** All items resolved; rows removed. Decisions are persisted in the spec files (`00`, `03`, `04`, `05`, `06`, `08`, `09`, `13`).

### Decision summary

- **#17 — `ArtifactId` is now a ULID string**, not SQLite auto-increment. Storage-agnostic, timestamp-sortable. The `id` column in the `artifacts` table is TEXT. Updated `04-artifact-store.md` (type + implementation) and `03-event-system.md` (type reference).
- **#23 — `descriptor_paths` are workspace-root-relative.** All file paths across Jie (tool arguments, event payloads, config references) resolve relative to `workspace_root`. Clarified in `03-event-system.md` payload comment.
- **#24 — Workspace root formally defined.** Added "Workspace Root" to glossary in `00-overview.md`. Path resolution convention stated: tool args, event payloads, and config-relative paths all anchor to workspace root.
- **Bonus — Renamed `read/write_module_descriptor` to `read/write_module_contract`.** "Module Descriptor" now means the whole `CONTEXT.md` file (frontmatter + prose); "Module Contract" is the YAML frontmatter portion. Updated glossary entries and all role tool lists across `05`, `06`, `08`, `09`.
- **Bonus — Artifact store is workspace-scoped**, not team-scoped. `13-deployment.md` updated: one SQLite file per workspace.



---

## Group I — Glossary / TBD dependencies

**Status: complete.** All items resolved; rows removed. Decisions are persisted in the new `12-memory.md` and updated cross-references.

### Decision summary

- **#27 — Memory chapter written as `12-memory.md`.** Covers: MemoryStore interface, compaction trigger (0.7x context-window threshold) and policy (summarize oldest turns, preserve originals on disk), context lifecycle (session start, turn loop, agent restart), persistence (SQLite `memory_turns` table, auto-flush every 10 turns), DM working memory (prompt queue, in-flight awareness), and LLM library integration point. All TBD references across `00`, `03`, `07`, `08`, `09` updated to point at the new chapter. Backlog item #6 closed.



---

## Closed Issues (resolved before grouping)

| # | Severity | Spec | Issue | Decision | Edits |
|---|---|---|---|---|---|
| 1 | critical | 03, 08, 09 | Iteration semantics: who initially sets `iteration=1`. | DM inits to 1; everyone copies inbound; planner is the only role allowed to increment, only on `task.review_failed`. | 09 (added "Iteration Ownership" section), 08 (clarified planner block) |
| 2 | critical | 08 | Researcher vs Architect role boundary. | Researcher = world + project docs (prose). Architect = sole authority on code structure & contracts; owns full `CONTEXT.md`. Planner = sole authority on implementation strategy. Split tools: `read_module_doc` (prose), `read_module_contract` (frontmatter), `write_module_doc` (architect-only). | 05, 08, 09 |

---

## Notes

- Groups are largely independent. A fresh agent context can pick up any pending group; reading this file is sufficient to resume.
- Items marked `conditional` carry an explicit dependency note in their **Decision** column. Resolve the dependency, then either confirm or revise the conditional decision.
- TBD chapters live in `backlog.md`; resolved items here may surface new TBD entries.
