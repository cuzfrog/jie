# Jie (界) Platform — Overview

> "Constraints liberate, liberties constrain."

The Jie Platform is an orchestration framework for building multi-agent systems. It provides the runtime infrastructure — event bus, agent model, tool system, persistence, and deployment — without prescribing what agents do or how they coordinate. Teams define agents, event types, and workflows on top of the platform.

**IMPORTANT**: jie-platform knows nothing about jie-team or code-lens — this doc set stays within the platform boundary.

## Glossary (cross-reference index)

| Term | One-line definition | See |
|---|---|---|
| **Agent Key** | Persistent identity `{role}-{N}` (today always `{role}-1`), carried in `system.team.loaded` and prompts. | `06-agent-model.md` |
| **AgentId** | TUI's composite runtime id `` `${teamId}:${agentKey}` ``; `TuiState.agents` is keyed by it. | `06-agent-model.md`, `ui/tui-state.md` |
| **Agent** | In-process instance holding a soul, connected to the bus, executing tool calls on the soul's behalf; communicates only via events. | `06-agent-model.md` |
| **Soul** | Immutable behavioral profile: model, system prompt, tools, subscriptions, skills. | `06-agent-model.md` |
| **Body** | Concrete `AgentBody`: soul + event-manager + artifact-store + transcript-store + `sessionId`; runs the event loop and is the only bus publisher. | `06-agent-model.md` |
| **Event Bus** | In-process pub/sub (`InProcessEventBus`); NATS plugs in behind the same interface if single-machine is outgrown (ADR 5). | `03-event-system.md` |
| **Event Type / Topic** | Dotted event id (`agent.stream.chunk`, `user.prompt`); platform topics use `topic === type`, client topics use `custom.${teamId}.${topic}`. Identity is in the envelope, not the subject. | `03-event-system.md` |
| **TeamInfo** | Boot roster published in `system.team.loaded`: `{ id, leaderKey, agents: AgentInfo[] }`. The TUI's agent-discovery primitive. | `types.ts` |
| **Leader Agent** | The team's default addressee (TUI focus, `jie -p` target), reached through `user.prompt` filtered on its `agentKey` — no leader-only ingress topic, no special tools. | `06-agent-model.md` |
| **Tool** | Typed function with a JSON schema. Built-ins: `bash`, `read_file`, `write_file`, `edit_file`, `ls`, `find_file`, `grep_file`, `read_artifact`, `write_artifact`, `find_artifact`, `write_kanban`, `memory_add`, `memory_search`, `notify`, `web_search`, `web_fetch`, plus unimplemented MCP tools (ADR 4). | `06-agent-model.md` |
| **Tool Registry** | Resolves a soul's tool-spec strings to `Tool` instances at load time; bare names are built-ins, `mcp:<server>:<tool>`/`mcp:<server>:*` currently resolve to zero tools. | `06-agent-model.md` |
| **`notify` Tool** | The sole inter-agent communication. Publishes `custom.${teamId}.${topic}` via `Events.custom`; the publisher's identity travels in the envelope `sender`, not the turn. Does not end the LLM's turn. | `06-agent-model.md` |
| **Storage** | Persistence abstraction (`exec`, `query`, `transaction`); `SqliteStorage` is the only impl. One instance per process. | `04-storage.md` |
| **Artifact** | A work product; the agent supplies the full key — the platform generates none and reserves no prefixes. | `04-storage.md` |
| **Artifact Store** | KV store over `Storage` (`write`/`read`/`list`), `INSERT OR REPLACE` semantics. | `04-storage.md` |
| **TranscriptStore** | Per-agent conversation persistence (`persist`/`compact`/`restore`/`hasSession`/`listSessions`/`sessionName`/`renameSession`). | `08-transcript.md` |
| **Compaction** | Summarizing the LLM context window; driven by the body's `Compactor` between runs, built on pi-agent-core's toolkit. The summary is flagged `compacted=1` in `memory_turns`; not visible on the bus (the rewrite is). | `06-agent-model.md` |
| **Memory** | Team-scoped long-term memory: atoms (`fact`/`decision`/`method`/`instruction`) from compacted prefixes, FTS5-searched, recalled as a budgeted system-prompt block. Derived from TencentDB-Agent-Memory L1 (MIT; ADR 34). | `11-memory.md` |
| **LlmService** | One-shot model call (model in, text out, credentials resolved internally). Consumers: compaction, memory extraction. | `07-llm-service.md` |
| **Session** | A ULID `session_id` partitioning history per process x team (shared by the team). `TeamManager` validates `--resume` via `hasSession`, else mints a fresh id; the map is in-memory only, history rows persist. ADR 17. | `08-transcript.md` |
| **Workspace Root** | `process.cwd()`; tool file paths resolve relative to it; not configurable. `.jie/` discovery walks up from CWD, tool paths do not (`10-configuration.md`). | `10-configuration.md` |
| **JieHandle** | At `bootPlatform(options).cradle.platform` (ADR 31). Surface: `settings`, `prompt`, `interrupt`, `dequeuePrompt`, `requeuePrompt`, `subscribe`, `execute`, `shutdown`. Teams load on demand via the `team` command — no `start()`/`stop()`/`bus`/`waitForIdle` on the handle (the CLI `-p` mode owns its idle gate). Holds no active-team state (ADR 26). | `jie-platform.ts` |
| **Agent Idle** | A body publishes `agent.idle` on every pi-agent `agent_end`; a body that has never started a turn is idle by default — no startup event. The boot "this agent exists" signal is `system.team.loaded`. | `03-event-system.md` |
| **Streaming** | LLM output batched into `agent.stream.chunk` at 64 chars / 200 ms; `agent.stream.end` carries per-thinking-segment durations. | `03-event-system.md` |
| **Team Blueprint** | A team's `TEAM.md` (leader) + one `<role>.md` per role. The platform parses and runs it; the team layer provides it. | `06-agent-model.md` |
| **Built-in Default-Solo Team** | Last-resort single `general` agent shipped as embedded `.md` files; user copies at the standard paths override it. | `default-solo-team.md` |

## Process Topology (quick reference)

Single OS process — the `jie` binary — holds the platform handle, all bodies, the in-process EventBus, the SQLite store, and the TUI. See `09-deployment.md` for startup/shutdown and `02-protocol-stack.md` for the technology map.
