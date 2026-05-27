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
| C | Boundary & external integrations | pending |
| D | Code & module discipline | pending |
| E | Roles & pipeline shape | pending |
| F | Observability & debugging | pending |
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

**Theme.** How the system meets the world.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 6 | significant | 02, 08 | How does the user prompt actually reach the DM? CLI? Input MCP server? Unspecified. | pending | | |
| 28 | minor | 08 | DM behavior on terminal events for JIRA-origin tasks (post back? close?). | pending | | |

---

## Group D — Code & module discipline

**Theme.** Architect mechanics and descriptor edge cases.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 13 | significant | 05, 08 | `write_module_descriptor` "user wins" on conflict — how is mid-session user edit detected? | pending | | |
| 26 | minor | 00, 06 | Glossary "Frozen" definition contradicts deferred Module Boundary chapter on no-descriptor case. | pending | | |

---

## Group E — Roles & pipeline shape

**Theme.** Pipeline structure and per-role tunables.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 12 | significant | 08, 09 | Researcher is not optional. Skip path for trivial tasks? | pending | | |
| 21 | minor | 07, 12 | Reviewer-specific `error_turn_budget` default? | pending | | |
| 25 | minor | 08, 12 | `run_tests` tool contract — open item #1 — blocks reviewer & implementer behavior. | pending | | |

---

## Group F — Observability & debugging

**Theme.** Tool telemetry, agent identity, logs.

| # | Severity | Spec | Issue | Status | Decision | Edits |
|---|---|---|---|---|---|---|
| 7 | significant | 03, 07 | `agent_id` format / generation / uniqueness across restarts. | pending | | |
| 9 | significant | 07 | Tool observability: no logging/telemetry hook; tool runs opaque. | pending | | |

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
