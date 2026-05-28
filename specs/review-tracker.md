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
| G | Process & deployment topology | pending |
| H | Identifier & path conventions | pending |
| I | Glossary / TBD dependencies | pending |

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

**Theme.** How the system is packaged and run.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 8 | significant | 02, 07 | MCP server mid-session crash: reconnect policy. | pending | | |
| 14 | significant | 02, 10 | Code-Lens lifecycle: per-team or singleton, discovery, startup, crash recovery. | pending | | |
| 16 | significant | 02, 03 | Multi-team isolation on NATS: `session.*.task.*` is global; auth/namespace policy. | pending | | |
| 29 | minor | 01, 07, 08 | `packages/agents/` is misleading — built-in role meat lives in `core`. | pending | | |
| 30 | minor | (cross-cutting) | Deployment / process model: how many processes, who orchestrates. | pending | | |

---

## Group H — Identifier & path conventions

**Theme.** Cross-cutting naming hygiene.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 17 | minor | 04 | `ArtifactId = number` (SQLite autoincrement). Why not opaque string (ULID)? | pending | | |
| 23 | minor | 03, 08 | `task.designed` payload `descriptor_paths` — relative to what root? | pending | | |
| 24 | minor | (cross-cutting) | Project / workspace / repo root concept missing. | pending | | |

---

## Group I — Glossary / TBD dependencies

**Theme.** Forward references and glossary mismatches.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 27 | minor | 00, 07, 09 | Glossary "Compaction" assumes a non-existent Memory chapter. | pending | | |

---

## Closed Issues (resolved before grouping)

| # | Severity | Spec | Issue | Decision | Edits |
|---|---|---|---|---|---|
| 1 | critical | 03, 08, 09 | Iteration semantics: who initially sets `iteration=1`. | DM inits to 1; everyone copies inbound; planner is the only role allowed to increment, only on `task.review_failed`. | 09 (added "Iteration Ownership" section), 08 (clarified planner block) |
| 2 | critical | 08 | Researcher vs Architect role boundary. | Researcher = world + project docs (prose). Architect = sole authority on code structure & contracts; owns full `CONTEXT.md`. Planner = sole authority on implementation strategy. Split tools: `read_module_doc` (prose), `read_module_descriptor` (frontmatter), `write_module_doc` (architect-only). | 05, 08, 09 |

---

## Notes

- Groups are largely independent. A fresh agent context can pick up any pending group; reading this file is sufficient to resume.
- Items marked `conditional` carry an explicit dependency note in their **Decision** column. Resolve the dependency, then either confirm or revise the conditional decision.
- TBD chapters live in `12-open-items.md`; resolved items here may surface new TBD entries.
