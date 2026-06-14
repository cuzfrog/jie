# Review Tracker — jie-platform

> Working list of open implementation-grade gaps. ADRs in `./addrs/` are the source of truth for consequential decisions. Detail (full edit trail, recommendations, sub-questions) is in `addrs/` and the file's git history.

## Current focus

Pass 9 (2026-06-14) complete. 13 implementation-grade precision gaps surfaced; all 13 resolved. No open items.

## Open

(none)

## Past passes

9 passes completed. Latest: **Pass 9 (2026-06-14)** — 13 spec-precision fixes across 3 batches.

- **Batch 1 — wire-format contract, body construction/start lifecycle, empty-team guard** (items 1–5). Edits to `02-protocol-stack.md` "Prompt Ingress"; `03-event-system.md` "Event Envelope"; `06-agent-model.md` `notify` step 2, "Parse Errors", "Platform Auto-Wiring", "AgentBody" class signature + `start()`, "Prompt Ingress & Queuing"; `08-memory.md` "Integration with pi-agent" "Restore"; `09-deployment.md` "Startup Sequence" steps 9–12; `ui/cli.md` `jie` step 9, `jie -p` steps 3/5/6; `ui/tui.md` "Prompt Sending"; `addrs/15-platform-entry-function.md` (startJie async signature, body.start() await, amendment history). Net effect: the wire format is uniformly the `AgentEvent` envelope on every publish; the body's constructor takes `is_leader`; `body.start()` is `async` and runs the four-step restore-and-start sequence; empty-team `-p` mode exits 1 with a clear error instead of hanging on the idle gate.
- **Batch 2 — tool descriptions, type definitions, TUI subscription lifecycle, artifact team-scoping** (items 6–9). Edits to `06-agent-model.md` (canonical LLM-facing `Description` blocks for `bash`, `web_search`/`web_fetch`, `write_artifact`/`read_artifact`, `notify`); `10-configuration.md` (TypeScript `McpServerConfig` and `MergedSettings` definitions in the relevant sections); `addrs/16-builtin-minimal-team-as-manifest-files.md` (`TeamBlueprint` definition with `roles: AgentSoul[]` and `leaderRole: string | null`); `ui/tui.md` "Model and Team Hot-Swap" step 3 (explicit subscription-lifecycle paragraph: per-team subscriptions come and go with the active team; per-process subscriptions stay); `05-artifact-store.md` "Interface" (one-paragraph note: artifact keys are NOT team-scoped; team is responsible for namespacing; ADR 7 reference).
- **Batch 3 — operational polish** (items 11–13). `08-memory.md` "Restore": `seq` counter cached in a per-body private field `nextSeq`, initialized once during `restore()` from `max(restored.seq) + 1` (or `1` if empty), incremented on each `persist()`; no per-`persist` `MAX(seq)` query. `06-agent-model.md` `web_fetch` content conversion: curated list of text-like types (HTML parsed; other `text/*` verbatim; `application/json` + structured-suffix variants; `application/xml` + XML-suffix variants; `application/javascript` family; form and structured-data encodings including `application/yaml` / `application/toml` / `application/sql` / `application/graphql`); binary types enumerated as the open-ended complement. `10-configuration.md` new "Platform Limits" section: consolidated table of 20 platform-wide hard caps and charsets (artifact key charset, 5 MiB content caps, 32 KiB bash output, 50 KiB / 2000 lines read_file, 4 KiB tool telemetry, 120 s tool default / 300 s bash, 26-char session_id ULID, `team_id` charset, `auth.json` / `artifacts.db` / `.jie/` modes, etc.) with each row pointing at the doc that applies the limit.

See `addrs/15-platform-entry-function.md` amendment history (2026-06-14 Pass 9 entry) and `git log` for the full trail.

Pass 8 — `JieHandle.waitForIdle` removed (CLI owns the idle gate); body no longer publishes `agent.idle` at startup (reverses ADR 13 §3 J6); new `{team_id}.team.loaded` event published by the handle; Event-Order Contract (body-side alternation + bus-side in-order delivery) recorded normatively. ADR 24.
