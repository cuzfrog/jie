# Review Tracker — jie-platform Specs

## Group A: Missing Core Interfaces (Blockers)

Interfaces referenced throughout the specs but never defined. These must exist before implementation can start.

| # | Issue | Evidence | Status |
|---|---|---|---|
| A1 | **EventBus interface undefined.** `AgentBody`, TUI, CLI, and Supervisor all depend on it. What methods: `publish(subject, data)`, `subscribe(subject, callback)`, `request(subject, data, timeout)`? How does it wrap NATS vs JetStream? What is the error model? | `05-agent-model.md:140`, `03-event-system.md`, `ui/tui.md`, `ui/messaging-protocol.md` | open |
| A2 | **ToolRegistry interface undefined.** Glossary defines "Tool Registry" as the resolver for `ToolSpec` strings into `Tool` instances. No interface or implementation spec exists. What does `resolve(spec: string): Tool` look like? How are MCP-backed tools registered into it? | `00-overview.md:20`, `05-agent-model.md:46` | open |
| A3 | **LLM Provider abstraction undefined.** Agents declare `model: 'anthropic/claude-sonnet-4'`. How is the provider string parsed and dispatched? Where are API keys configured? What is the retry/rate-limit model? The LLM call site in the event loop is a black box. | `05-agent-model.md:10,75-82`, `08-memory.md:125` | open |
| A4 | **Team Blueprint loading/discovery unspecified.** This is THE boundary between platform and team. The platform "runs the blueprint" but how? Does the supervisor load a TypeScript module from `packages/jie-team/`? Does config point to a blueprint path? What is the TypeScript interface a blueprint must export? | `09-deployment.md:41`, `jie-team/00-overview.md:14` | open |
| A5 | **MCP Client connection management unspecified.** `mcp:<server>:<method>` syntax is described, but how does the platform connect to MCP servers? stdio subprocess? HTTP/SSE? Where are server addresses configured? Only Code-Lens has a URL; GitHub, JIRA, and other servers have no connection config. | `05-agent-model.md:48`, `02-protocol-stack.md:8-10`, `10-configuration.md` | open |

---

## Group B: Configuration and Environment Gaps

| # | Issue | Evidence | Status |
|---|---|---|---|
| B1 | **LLM API keys / secret management not specified.** Models need API keys. Where do they come from? Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)? A `.env` file? A secrets section in config? No spec addresses this. | Entire model spec | open |
| B2 | **Non-Code-Lens MCP servers not configurable.** `jie-team/01-role-definitions.md` declares `mcp:github:*` and `mcp:jira:*` tools. The platform config only has `code_lens_url`. Where are GitHub and JIRA MCP server addresses and credentials configured? | `10-configuration.md`, `jie-team/01-role-definitions.md:23-24` | open |
| B3 | **Memory auto-flush interval not in config schema.** `08-memory.md:108` says "every 10 turns (configurable)." `10-configuration.md` has no such field. | `08-memory.md:108`, `10-configuration.md` | open |
| B4 | **Team blueprint selection mechanism missing.** If multiple blueprints exist (built-in dev team, custom teams), how does the platform know which to load? Is there a `team_blueprint` field in config? Or does `team_id` map to a blueprint? | `09-deployment.md`, `10-configuration.md` | open |
| B5 | **Process environment and shell inheritance unspecified.** Agent bodies exec `bash` with "the workspace's environment." What environment variables are set on agent processes? Are they inherited from the supervisor? What about `PATH` for finding tools? | `05-agent-model.md:104`, `09-deployment.md` | open |

---

## Group C: Cross-Reference and Structure Issues

| # | Issue | Evidence | Status |
|---|---|---|---|
| C1 | **Broken ref: `06-code-lens/service.md`.** Actual path is `../code-lens/service.md`. Code-Lens specs live outside jie-platform. | `02-protocol-stack.md:9` | open |
| C2 | **Broken ref: `07-ui/messaging-protocol.md`.** Actual path is `ui/messaging-protocol.md` (no `07-` prefix). | `02-protocol-stack.md:20`, `03-event-system.md:18` | open |
| C3 | **Broken ref: `07-ui/cli.md`.** Actual path is `ui/cli.md`. | `09-deployment.md:75` | open |
| C4 | **Broken ref: `14-configuration.md`.** Actual path is `10-configuration.md`. | `12-installation.md:111` | open |
| C5 | **Broken ref: `15-monitoring.md`.** Actual path is `11-monitoring.md`. | `12-installation.md:142` | open |
| C6 | **Gaps in file numbering.** No `01`, `06`, `07`, `13`–`17` prefixed files. `ui/` has no numeric prefix. Intentional or accidental? Confusing for navigation. | Directory listing | open |

---

## Group D: Protocol and Message Inconsistencies

| # | Issue | Evidence | Status |
|---|---|---|---|
| D1 | **TUI prompt payload vs PromptMessage envelope mismatch.** `tui.md:27` says the TUI publishes `{ prompt: string, work_id?: string }`. `messaging-protocol.md:22-29` defines `PromptMessage` with `prompt_id`, `content`, `source`, `reply_id`, `timestamp`. `jie-team/01-role-definitions.md:42` says DM receives `{ prompt: string, task_id?: string }`. Three different payloads for the same subject. | `ui/tui.md:27`, `ui/messaging-protocol.md:22-29`, `jie-team/01-role-definitions.md:42` | open |
| D2 | **`code_lens_url` defaults contradict.** `10-configuration.md:50` says "auto-assigned" (supervisor probes upward from 9001). `12-installation.md:98` says "defaults to `http://localhost:9001`" and is written as-is. `09-deployment.md:40` says "probes ports starting at 9001 upward." Clarify: is the default static 9001, or always probed? | `10-configuration.md:50`, `12-installation.md:98`, `09-deployment.md:40` | open |
| D3 | **NATS JetStream "enabled by default" statement is incorrect.** `12-installation.md:133` says "v2.10+ enables JetStream by default with an in-memory store." This is false — JetStream requires `-js` flag or `jetstream {}` config block. | `12-installation.md:133` | open |
| D4 | **`code_lens_url` presence in default config inconsistent.** `10-configuration.md:28` shows it as commented-out (optional). `12-installation.md:107` shows it as present in the resulting config with value `"http://localhost:9001"`. Which is the v1 truth? | `10-configuration.md:28`, `12-installation.md:104-108` | open |

---

## Group E: Fault Tolerance and Concurrency

| # | Issue | Evidence | Status |
|---|---|---|---|
| E1 | **NATS disconnect → cannot publish terminal event (circular).** `05-agent-model.md:197` says on NATS disconnect, the body force-publishes a terminal event with `error = "nats_disconnect"` and exits. But if NATS is disconnected, the publish will fail. What actually happens? | `05-agent-model.md:196-197` | open |
| E2 | **MCP unreachable → terminal event publish may fail.** `05-agent-model.md:194` says the body force-publishes a terminal event on MCP server unreachable. If the failure was caused by a systemic issue (e.g. network partition), the publish may also fail. No fallback described. | `05-agent-model.md:194` | open |
| E3 | **SQLite concurrency not addressed.** Multiple agent body processes (N per team) access a single `artifacts.db` file. SQLite supports concurrent reads but single-writer. What locking mode (WAL?)? What is the busy timeout? What happens on write conflict? | `04-artifact-store.md:37`, `09-deployment.md:30` | open |
| E4 | **Stream ID starting value and wraparound unspecified.** `stream_id` is a per-agent uint32 monotonic counter. Starting at 0? After wraparound at 2^32, do consumers detect the reset? Consumers demux on `(agent_id, stream_id)` but `agent_id` changes on restart — is restart the only valid reset? | `03-event-system.md:31` | open |
| E5 | **Event loop overflow: "asserts and exits" is ambiguous.** Does the body call `process.exit(1)`? Publish a terminal event first? Log something? The supervisor restarts it, but the spec doesn't say whether a terminal event is emitted. | `05-agent-model.md:159` | open |
| E6 | **Agent restart — agent_id changes, session continuity broken for observers.** When an agent restarts mid-session, it gets a new `agent_id`. Session events before restart carry the old `agent_id`. The TUI drops old tabs. But if stream chunks or tool telemetry from the new agent need to be correlated with prior events from the old agent_id, there's no linking key. The same role but different agent_id creates ambiguity for diagnostic tooling. | `03-event-system.md:30`, `11-monitoring.md:80` | open |
| E7 | **Multiple agents of same role — TUI tab label collision.** `11-monitoring.md:78` says tab label is the role name, not `agent_id`. If a blueprint defines 2+ agents of the same role (e.g. 2 researchers), the labels collide. | `11-monitoring.md:78` | open |
| E8 | **Supervisor-to-child communication unspecified.** How does the supervisor pass config to agent child processes? CLI args? Environment variables? A shared file handle? How does the supervisor detect child death — `waitpid`? The spec says "monitors each child process" but never defines the monitoring mechanism. | `09-deployment.md:43-47` | open |

---

## Group F: Operational Readiness (Deployable Application)

| # | Issue | Evidence | Status |
|---|---|---|---|
| F1 | **No build/package system spec.** `monorepo-structure.md` shows packages but no `package.json`, build scripts, or bundling strategy. How does `@cuzfrog/jie` get assembled from the monorepo packages? How is it published? | Entire repo, `12-installation.md:79` | open |
| F2 | **No testing strategy.** No test framework, no test directory structure, no CI pipeline, no E2E test approach. | Absent from all specs | open |
| F3 | **No logging strategy.** What logging library? Structured logs? Levels? Output destination (stdout, file)? Is there correlation via `session_id`? | Absent from all specs; only "warning log" mentioned in `05-agent-model.md:83` | open |
| F4 | **No SQLite schema migration strategy.** `memory_turns` table, `artifacts` table, status rows — what happens when the schema evolves across versions? No migration framework specified. | `04-artifact-store.md`, `08-memory.md:108` | open |
| F5 | **No API versioning for event envelopes or subjects.** Event envelopes have no version field. Subjects have no version prefix. When the platform evolves, old clients and new agents could silently break. | `03-event-system.md:38-48` | open |
| F6 | **No metrics or tracing beyond heartbeat.** Heartbeats cover liveness. What about: LLM token usage per agent, tool call latency distributions, event throughput, compaction frequency, error rates? | `11-monitoring.md` | open |
| F7 | **No graceful degradation when Code-Lens is optional.** If Code-Lens is unreachable at startup, `05-agent-model.md:49` says "the agent fails to start." But if no role declares Code-Lens tools, should startup require Code-Lens? The supervisor always starts Code-Lens. | `05-agent-model.md:49`, `09-deployment.md:40` | open |
| F8 | **No spec for `jie --version` / `jie --help`.** Referenced implicitly in CLI behavior and installation, but never formally defined. | `12-installation.md:123,138`, `cli.md` | open |
| F9 | **`jie prompt` has no `--agent` flag.** The messaging protocol defines `team.{team_id}.{agent_id}.prompt` for targeted prompts, but `jie prompt` always sends to the leader. No CLI path to target a specific agent from the command line. | `cli.md:138-175`, `02-protocol-stack.md:19` | open |

---

## Group G: Agent Model Detail Gaps

| # | Issue | Evidence | Status |
|---|---|---|---|
| G1 | **Compaction consumes `total_turn_budget` — could prematurely terminate an agent.** `08-memory.md:125` says compaction is "a separate LLM call that consumes one turn (decrements `total_turn_budget`)." In a session with many compaction events + normal tool-use turns, the agent could hit `total_turn_budget=200` earlier than expected. Should compaction turns be excluded from the budget? | `08-memory.md:125`, `05-agent-model.md:190` | open |
| G2 | **Post-notify tool calls "dropped with a warning log" — side effects?** If the LLM calls `notify(...)` + `bash(...)` + `write_artifact(...)` in a single response, and `notify` succeeds first, the bash and write_artifact calls are dropped. But the LLM already reasoned they should happen. This can produce inconsistent state silently. Should the body return tool errors for the dropped calls instead of silently dropping? | `05-agent-model.md:83` | open |
| G3 | **Grace turn budget interaction is redundantly stated.** `05-agent-model.md:164` says the grace turn "does not decrement `error_turn_budget` but does decrement `total_turn_budget` by one." Since `total_turn_budget` already decrements on every turn (line 190), this is normal behavior restated. Remove the redundant clause or clarify if it means something different. | `05-agent-model.md:164` | open |
| G4 | **Leader prompt queue lost on restart — no user feedback mechanism.** `08-memory.md:118` says queued prompts are lost on restart. `tui.md:54` says the TUI "should surface this." But there's no event or signal from the leader to the TUI when the queue is cleared. How does the TUI detect queue loss? | `08-memory.md:118`, `ui/tui.md:54` | open |
| G5 | **Agent queue cap of 8 — is this sufficient for non-linear pipelines?** The FIFO queue at cap 8 with overflow=assert is described as safe for serial pipelines. But the team blueprint could define non-linear workflows (e.g. fan-out, parallel roles). The cap should be configurable or the constraint should be documented as a v1 limitation. | `05-agent-model.md:159` | open |
| G6 | **`read_status` exposed as tool but status write is body-only.** `04-artifact-store.md:47` says `read_status` is available as a tool. `05-agent-model.md:54` says status writes are body-only via `notify`. The LLM can read but not write status. Is `read_task_status` the same tool? `jie-team/01-role-definitions.md:10` mentions `read_task_status` as auto-registered. These should be the same tool, consistently named. | `04-artifact-store.md:47`, `jie-team/01-role-definitions.md:10` | open |
| G7 | **`write_artifact` takes `(type, content)` but no `work_id` — where does `work_id` come from?** `04-artifact-store.md:46` says "reads the current work-unit identifier from `ExecutionContext`." But `ExecutionContext` is per-tool-call and does contain `work_id`. However, `work_id` is set by the leader when it calls `notify('task.recorded')`. How does the body know which `work_id` to put in `ExecutionContext` before the leader emits `task.recorded`? Before that event, there is no `work_id`. | `04-artifact-store.md:46`, `05-agent-model.md:203-209` | open |

---

## Group H: Dependency and Runtime Assumptions

| # | Issue | Evidence | Status |
|---|---|---|---|
| H1 | **`bun` ≥ 1.3.14 pinned as runtime — is this realistic for production?** Bun is fast-moving, occasionally breaking. No Node.js fallback specified. All packages are distributed as TypeScript source? Or compiled? If compiled, to what target? | `12-installation.md:9` | open |
| H2 | **NATS server must be started manually by the user.** The supervisor does not manage NATS lifecycle (per `09-deployment.md:39` it "starts/verifies NATS connectivity" — does it start nats-server or just check?). If it only checks, the user must manually run `nats-server -js &`. Should the supervisor auto-start NATS as a child process? | `09-deployment.md:39`, `12-installation.md:129-131` | open |
| H3 | **Bash tool has no sandbox beyond path check.** `05-agent-model.md:104` says "No isolation sandbox beyond the workspace-root constraint in v1." An LLM-executed `bash` command can read/write anywhere within the workspace, access network, spawn processes. This is a significant security consideration documented only as a path constraint. | `05-agent-model.md:104` | open |
