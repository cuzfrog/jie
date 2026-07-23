# Jie (界) Platform — Overview

> "Constraints liberate, liberties constrain."

The Jie Platform is an orchestration framework for building multi-agent systems. It provides the runtime infrastructure — event bus, agent model, tool system, persistence, and deployment — without prescribing what agents do or how they coordinate. Teams define agents, event types, and workflows on top of the platform.

**IMPORTANT**: jie-platform knows nothing about jie-team or code-lens! The doc should not contain any information related to them.

---

## Glossary

| Term | Definition |
|---|---|
| **Agent Key** | Persistent agent identity: `{role}-{N}`. `N` is the spawn-slot ordinal (1-indexed) defined by `TEAM.md` `instances`; today every role has exactly one instance, so keys are always `{role}-1` (e.g. `general-1`). Carried as `agentKey` in `system.team.loaded` payloads and in `user.prompt` / `agent.interrupt` payloads. |
| **AgentId** | The TUI's composite runtime identifier: `` `${teamId}:${agentKey}` `` — disambiguates agents across coexisting teams in one process. The reducer state (`TuiState.agents`) is keyed by `AgentId` (`ui/tui-state.md`). |
| **Agent** | An in-process instance that holds a soul, connects to the event bus, and executes tool calls on behalf of its soul. Agents communicate exclusively through events — they have no direct knowledge of each other. |
| **Soul** | Declares an agent's behavioral profile: its model, system prompt, tool list, and topic subscriptions. Immutable at runtime; carries no mutable state. |
| **Body** | The concrete `AgentBody` instance. Holds a soul plus its event-manager, artifact-store, and memory references and its `session_id`; runs the event loop and publishes events on behalf of the soul. Identified by `agent_key = {role}-{N}`. |
| **Event Bus** | In-process pub/sub (`InProcessEventBus`). A NATS transport plugs in behind the same `EventBus` interface if single-machine deployment is ever outgrown (ADR 5). |
| **Event Type / Topic** | A dotted string identifying a kind of event (`agent.stream.chunk`, `user.prompt`). For every platform event, `topic === type`; client-defined topics get the subject `custom.${teamId}.${topic}`. Identity travels in the envelope (`sender` + payload), never in the subject — multiple teams' bodies coexist on one bus, disambiguated by the envelope's `teamId`. Teams define domain topics; the platform defines infrastructure topics. Full contract: `03-event-system.md`. |
| **TeamInfo** | The roster published in `system.team.loaded` and returned by the `team` command: `{ id, leaderKey, agents: AgentInfo[] }` with `AgentInfo = { teamId, role, agentKey, isLeader, model }`. The boot "this agent exists" signal; the TUI's agent-discovery primitive. |
| **Leader Agent** | The team's designated default addressee: the TUI focuses it, and `jie -p` addresses `team.leaderKey`. Reached through the regular `user.prompt` topic filtered on its `agentKey` — there is no leader-only ingress topic. Has no special tools. |
| **Tool** | A typed function with a JSON schema, available to an agent's LLM. Built-ins: `notify`, `bash`, `read_file`, `write_file`, `edit`, `todo_write`, `web_search`, `web_fetch`, `write_artifact`, `read_artifact`. MCP-backed tools are the planned extension (not implemented today, ADR 4). |
| **Tool Registry** | Resolves tool spec strings in a soul's `tools:` list into `Tool` instances at soul-load time. Bare names are built-ins; `mcp:<server>:<tool>` / `mcp:<server>:*` are MCP-provided and currently resolve to zero tools. |
| **MCP Server** | An external process exposing tools over the Model Context Protocol. Would be configured in `.jie/mcp.json`; not connected today (ADR 4). |
| **`notify` Tool** | The sole means of inter-agent communication. Publishes the message on `custom.${teamId}.${topic}` via `Events.custom(sender, clientTopic, message)`; the publishing agent's identity travels in the envelope's `sender`. Does not end the LLM's turn. |
| **Storage** | The persistence abstraction: `exec`, `query`, `transaction`, `close`. `SqliteStorage` (bun:sqlite) is the only implementation; domain code never imports `bun:sqlite`. One instance per process backs both domain stores. See `04-storage.md`. |
| **Artifact** | A work product produced or consumed by agents (a plan, a research note, a change summary). The agent supplies the full key; the platform does not generate artifact IDs and reserves no key prefixes — teams that need isolation own their key scheme. |
| **Artifact Store** | The domain interface for artifacts (`write`, `read`, `list`) on top of `Storage`; KV semantics (`INSERT OR REPLACE`). |
| **MemoryManager** | The domain interface for an agent's conversation history (`persist`, `compact`, `restore`, `hasSession`) on top of `Storage`. `memory_turns` is conversation history, not work products; shares the one DB file. See `08-memory.md`. |
| **Compaction** | Clearing or summarizing an agent's LLM context window. Owned by pi-agent (`transformContext`); internal to the memory subsystem; not visible on the event bus. |
| **Session** | A `session_id` (ULID) partitions conversation history per process × team. The platform's `TeamManager` validates `JiePlatformOptions.resumeSessionId` (`--resume`, registered on the cradle by `bootPlatform`) via `hasSession` at team load, else mints a fresh id, and records it in a private `Map<team_id, session_id>` — in-memory only, lost on process exit; `memory_turns` rows persist indefinitely, so prior sessions remain resumable. ADR 17. |
| **Workspace Root** | `process.cwd()` — where `jie` was invoked. All tool-call file paths resolve relative to it; not configurable. `.jie/` discovery walks up from CWD, tool paths do not (`10-configuration.md` "Workspace Inference"). |
| **JieHandle** | The handle at `bootPlatform(options).cradle.platform` (ADR 31; ADR 13's entry-function decision survives, container-shaped). Public surface: `settings`, `prompt(teamId, agentKey, text)`, `interrupt(teamId, agentKey)`, `subscribe(topic, cb)`, `execute(command)`, `teams()` (visibleForTesting). Teams load on demand through the `team` command — there is no `start()`/`stop()`/`bus` on the handle, and no `waitForIdle` (the CLI's `-p` mode owns its idle gate). The platform holds no active-team state (ADR 26). |
| **Agent Idle** | A body publishes `agent.idle` on every pi-agent `agent_end`; a body that has not started any turn is idle by default — no startup event. Observers derive busy/idle from the `agent.turn.start` / `agent.idle` alternation (Event-Order Contract, `03-event-system.md`). Replaces the heartbeat model. |
| **Streaming** | LLM output batched into `agent.stream.chunk` events (64 chars / 200 ms thresholds) for live observation. |
| **Team Blueprint** | A team-level definition — `TEAM.md` + one `<role>.md` per role — mapping roles to souls and naming the leader. The platform parses and runs it; the team layer provides it. |
| **Built-in Minimal Team** | The platform's last-resort fallback: a single `general` agent. Shipped as `team/minimal/TEAM.md` + `general.md` (the same `.md` format as user teams), embedded via `import` attributes. See `minimal-team.md`. |
