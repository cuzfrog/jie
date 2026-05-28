# Spec Review Tracker

Each group is a self-contained discussion context. Open each group, hammer out decisions, then move to the next.

---

## Group A — Missing Chapters (TBD stubs)

Chapters declared as TBD with no content yet. Each is referenced from live specs and gating implementation.

| # | Chapter | Referenced From | Backlog | Notes |
|---|---------|----------------|---------|-------|
| A7 | Language Adapter Docs | `05-module-descriptor.md:57` | — | Dangling — no backlog entry. How adapters canonicalize signatures; only TS in v1. |
| A8 | CLI formalisation | `11-ui/cli.md` | — | Dangling — referenced backlog #15 (never existed). `jie start/prompt/status/stop`. |
| A9 | Configuration | `14-configuration.md` | — | Dangling — no backlog entry. Full config surface beyond the 4-field minimal v1 `config.yaml`. |

**Discussion points:**
- Priority ordering of A1–A9 for Day 2 implementation.
- Which of these block v1 MVP vs can be deferred.
- A4 (multi-task) and A5 (trivial-task) both read as post-MVP; confirm.

---

## Group B — Open Backlog Items (not covered by missing chapters)

Loose backlog entries that aren't TBD chapters but still need resolution.

| # | Backlog Item | Priority | Where Referenced |
|---|-------------|----------|-----------------|
| B1 | #2 — JetStream stream limits, retention, replication, TTL/size cap | Day 2 | `backlog.md:7` |
| B2 | #4 — Code-Lens scope confirmation (exports + import graph sufficient?) | Day 2 | `backlog.md:8` |
| B3 | #5 — External integration: cron, webhooks, backlog polling (v1: only direct user prompt) | Day 2 | `backlog.md:9` |
| B4 | #11 — `max_iterations` default and per-task override mechanism | Day 2 | `00-overview.md:31`, `09-agent-lifecycle.md:80`, `14-configuration.md:11` |
| B5 | #12 — Per-role budget tuning (confirm `error_turn_budget=30`, `total_turn_budget=200` defaults) | Day 2 | `14-configuration.md:31`, `07-agent-model.md:133-134` |

**Discussion points:**
- B4: how does a per-task `max_iterations` override get specified? Task artifact field? Team config? User prompt field?
- B3: is "external integration" one chapter or does it split into cron/webhook (infra) vs JIRA/GitHub (MCP tools already present)?
- B1: JetStream stuff — is this operational config or spec design?

---

## Group C — Design Gaps & Ambiguities

Things that are underspecified or leave open questions in the current text.

| # | Issue | Source | Severity |
|---|-------|--------|----------|
| C1 | **DM prompt queue is lost on restart.** `12-memory.md:118`: "This queue is lost on restart; in v1, queued prompts are not persisted." DM crashes with 5 queued prompts → data loss, user must resend all. | `12-memory.md` | Medium |
| C2 | **Per-agent prompt handling for non-DM roles** is "reserved but deferred." Subject pattern `team.{team_id}.{agent_id}.prompt` exists but no agent other than DM handles it. Will this ever be used? | `03-event-system.md:14`, `02-protocol-stack.md:21` | Low |
| C3 | **Session ID collision is "should not happen."** A collision logs, retries once, then emits `task.rejected` with `reason: session_collision`. No real mitigation. Is collision probability acceptable at 64-bit hash? | `03-event-system.md:11` | Low |
| C4 | **Agent restart → new `agent_id`.** What happens to in-flight task tied to the old id? The old `agent_id` still appears in JetStream history. DM monitoring state says "re-subscribes via JetStream and is ready for next task." Needs clarity on crash mid-task. | `03-event-system.md:23`, `13-deployment.md:44` | Medium |
| C5 | **`task.rejected` mints a `session_id` but writes no artifact.** The event envelope has both `session_id` and `task_id`, but there's no `task` artifact. How does the TUI render this? It can't `read_artifact` because none was written. | `08-role-definitions.md:73-79`, `03-event-system.md:11` | Medium |
| C6 | **`task.rejected` carries `iteration` in the envelope — what value?** The envelope has `iteration: number` for all events, but rejection has no iteration. Is it always 0? 1? Absent? | `03-event-system.md:36` | Low |
| C7 | **Ephemeral prompts lost if DM is offline.** Rationale: "the user can resend." TUI/CLI need retry logic. Is this documented for client implementers? | `messaging-protocol.md:41-42` | Low |
| C8 | **Re-entry of `prompt-*` (free-form) tasks not supported in v1.** User must repeat the prompt. Is this acceptable UX? | `04-artifact-store.md:75` | Medium |
| C9 | **TUI agent discovery undefined.** `11-ui/tui.md:29` says "a reserved `team.{team_id}.agent.online` event TBD" — no agent lifecycle events exist in the event system. TUI can't populate agent tabs. | `11-ui/tui.md:29`, `03-event-system.md:68-86` | High |
| C10 | **Code-Lens URL config vs supervisor-launched process.** Supervisor starts Code-Lens, so why does config have `code_lens_url: "http://localhost:9001"`? Either supervisor assigns a port and writes to config, or Code-Lens is an external service. Spec says both. | `13-deployment.md:38`, `14-configuration.md:23` | Medium |
| C11 | **`bash` tool workdir sandboxing.** "cannot escape via `..` traversal" — how? Path resolution + chroot? OS-level? Just string-checking? | `07-agent-model.md:107` | Medium |
| C12 | **`max_iterations` configurable per task but override mechanism is TBD.** `09-agent-lifecycle.md:80` says "configurable per task" but `14-configuration.md:11` marks the override mechanism as B4. | `09-agent-lifecycle.md:80`, `14-configuration.md` | Medium |

**Discussion points:**
- C9 is highest severity — the TUI literally cannot function without agent discovery.
- C1/C8 are UX concerns that may shape the DM's restart behavior.
- C10 needs a single answer: supervisor-managed port or external service?

---

## Group D — Cross-Reference Inconsistencies

References that don't line up or are self-referential.

| # | Issue | Detail |
|---|-------|--------|
| D1 | **Backlog #14 references "configuration chapter"** from `14-configuration.md` itself. The configuration chapter is its own backlog item. Circular. | `14-configuration.md:27` references itself via backlog |
| D2 | **Backlog #15 references "formal CLI surface"** from `11-ui/cli.md` itself. Same circularity as D1. | `11-ui/cli.md:28` references itself via backlog |
| D3 | **Backlog numbering has gaps.** Items 1, 3, 6, 14, 15 are missing from `backlog.md`. Items 14 and 15 are referenced from other files but don't exist in the backlog. | `backlog.md` — only 2,4,5,7,8,9,10,11,12,13,16 exist |
| D4 | **Messaging example payload extra field.** `messaging-protocol.md:106` shows `task.recorded` payload with `task_id: "PROJ-123"` and `iteration: 1`, but the discriminated union in `03-event-system.md:49` only has `task_artifact_id`. Iteration is in the envelope, not payload; `task_id` is in the envelope, not payload. | `messaging-protocol.md:106-107` vs `03-event-system.md:35-41` |
| D5 | **Soft isolation language inconsistency.** `02-protocol-stack.md:23` says "v1 uses soft isolation", `03-event-system.md:110` agrees, but `messaging-protocol.md:86` says "v1 assumes a trusted network." These should mean the same thing — consolidate wording. | Three files |
| D6 | **`body.id` vs `agent_id` naming.** `AgentBody.readonly id` is the same as the `agent_id` field in event envelopes. Both use `{role}-{8-hex}`. Should they use the same name across code and docs? | `07-agent-model.md:131`, `03-event-system.md:23` |

**Discussion points:**
- D1–D3: should the backlog get a cleanup pass? Add missing items or remove dead references?
- D4: fix the example in messaging-protocol.md to match the actual envelope schema.

---

## Group E — Potential Redundancies

Information duplicated across multiple files. Risk of divergence.

| # | Topic | Files |
|---|-------|-------|
| E1 | Task status transition rules / CAS behavior | `04-artifact-store.md:40-50`, `07-agent-model.md:164-198`, `08-role-definitions.md:12-34` |
| E2 | Full session flow / pipeline | `09-agent-lifecycle.md:15-63`, `08-role-definitions.md:66-98`, `messaging-protocol.md:90-114` |
| E3 | DM in-flight gate enforcement | `08-role-definitions.md:51-62`, `07-agent-model.md:194`, `09-agent-lifecycle.md:8-9` |
| E4 | Artifact type definitions | `04-artifact-store.md:10`, `07-agent-model.md:169-171` (TaskPhase), `03-event-system.md:48-63` (payload unions) |
| E5 | `agent_id` format and generation | `03-event-system.md:23`, `07-agent-model.md:131` |

**Discussion points:**
- Single source of truth strategy: which file owns what definition?
- E1: the transition table in `08-role-definitions.md` should be canonical; others should reference it.
- E4: `TaskPhase` is defined in both `04-artifact-store.md` and `07-agent-model.md` with identical values.

---

## Group F — Terminology & Naming Consistency

| # | Issue | Detail |
|---|-------|--------|
| F1 | `Artifact` vs `artifact` — inconsistent capitalization across spec files. Glossary uses capitalized but bodies of text vary. | Minor |
| F2 | `workspace_root` (snake_case in YAML config) vs "Workspace Root" (Title Case in glossary) vs "workspace root" (lowercase in prose). Pick one style for prose. | Minor |
| F3 | `descriptor_paths` (plural) in `task.designed` payload — always plural even for a single path? | `03-event-system.md:52` |
| F4 | "Module Descriptor" and `CONTEXT.md` are used interchangeably. The glossary defines "Module Descriptor" as a `CONTEXT.md` file but then the Architect tools use `path` as the locator. Should spec consistently say "descriptor file" or "CONTEXT.md"? | `05-module-descriptor.md`, glossary |

---

## Group G — Architecture-Level Questions (big-picture)

Open-ended design questions worth discussing before writing code.

| # | Question |
|---|----------|
| G1 | **Is NATS a hidden complexity tax?** Every client (TUI, CLI, agents, external integrations) must speak NATS. No REST/gRPC fallback. Is the team comfortable with this? |
| G2 | **Six agent processes + supervisor + Code-Lens + NATS + TUI = 9+ processes for one team.** Is this process model acceptable for local dev? Resource footprint? |
| G3 | **Code-Lens is per-team but described as "reusable" and "standalone."** If it's truly outside Jie, should it be its own package/repo with independent versioning? |
| G4 | **The `write_file` boundary gate is the lynchpin of the frozen rule.** This is the hardest technical problem in the system (parse→extract exports→canonicalize→compare→allow/deny). Is a Day 2 implementation realistic? |
| G5 | **All tools are plain functions. The `notify` tool is the sole bridge to the bus.** This constraint prevents custom user agents from publishing events. Is this intentional and permanent, or will custom agents get a publish surface later? |
| G6 | **The Memory subsystem does compaction silently — the LLM doesn't know its history was summarized.** In practice, LLMs often notice dropped context. Has this been tested? |
| G7 | **Artifact store is SQLite, colocated with workspace.** What about teams with distributed workspaces? Multi-machine teams? Future migration path? |
| G8 | **The DM is a bottleneck by design** (single-task-in-flight, single queue). Is this acceptable indefinitely or is A4 (multi-task coordination) actually a v1 concern? |
