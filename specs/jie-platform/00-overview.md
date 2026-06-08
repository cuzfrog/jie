# Jie (界) Platform — Overview

> "Constraints liberate, liberties constrain."

The Jie Platform is an orchestration framework for building multi-agent systems. It provides the runtime infrastructure — event bus, agent model, tool system, persistence, and deployment — without prescribing what agents do or how they coordinate. Teams define agents, event types, and workflows on top of the platform.

**IMPORTANT**: jie-platform knows nothing about jie-team or code-lens! The doc should not contain any information related to them.

---

## Glossary

| Term | Definition |
|---|---|
| **Agent Key** | Persistent agent identity: `{role}-{N}`. `N` is the spawn-slot ordinal (1-indexed) defined by `TEAM.md` `instances`. In v1 every role has exactly 1 instance, so keys are always `{role}-1` (e.g. `leader-1`, `worker_a-1`). Multi-instance roles deferred to Day 2. Also serves as a direct-addressing topic on the event bus. |
| **Agent** | An in-process instance that holds a `Soul`, connects to the Event Bus, and executes tool calls on behalf of its soul. Agents communicate exclusively through events — they have no direct knowledge of each other. |
| **Soul** | Declares an agent's behavioral profile: its model, system prompt, tool list, and topic subscriptions. Immutable at runtime. Carries no mutable state. |
| **Body** | The concrete `AgentBody` instance. Holds a soul, an EventBus reference, an ArtifactStore reference, and a MemoryManager. Executes the event loop and publishes events on behalf of the soul. Identified by `agent_key = {role}-{N}`. |
| **Event Bus** | In-process pub/sub bus (v1). Agents publish and subscribe to events on a subject namespace. NATS is a pluggable transport for Day 2 — same interface, different constructor. |
| **Event Type** | A dotted string identifying a kind of event on the bus (e.g. `agent.stream.chunk`, `agent.tool.call`). Teams define their domain event types (topics); the platform defines infrastructure events (streaming, tool telemetry, idle). |
| **Leader Agent** | A team designates one agent role as its leader — the sole external-facing entry point. The leader auto-subscribes to `leader.prompt` and handles user prompt ingress. Has no special tools — uses `notify` like any other agent. |
| **Topic** | A string subject on the event bus. Platforms topics: `leader.prompt`, `agent.stream.chunk`, etc. Team-defined domain topics: `task.recorded`, `task.researched`, etc. Agent keys are also topics for direct addressing. |
| **Tool** | A typed function with a JSON schema, available to an agent's LLM. Tools are pluggable: built-in tools (notify, bash, read_file, write_file, web_search, web_fetch, write_artifact, read_artifact), MCP-backed tools, and team-defined tools. |
| **Tool Registry** | Resolves tool spec strings (e.g. `bash`, `mcp:code-lens:read_file`, `mcp:server:*`) into `Tool` instances at soul-load time. Bare names are built-ins; `mcp:<server>:<tool>` is MCP-provided; `mcp:<server>:*` imports all tools from a server. |
| **MCP Server** | An external process exposing tools over the Model Context Protocol. Configured in `.jie/mcp.yaml`. The platform connects at startup and registers their tools into ToolRegistry. |
| **`notify` Tool** | A built-in tool that is the sole means of inter-agent communication. Publishes `{ topic, prompt, source }` to a topic on the event bus. Does not end the LLM's turn. |
| **Artifact** | A persisted work product in the Artifact Store. Indexed by an opaque ID (ULID). Referenced on the event bus only by artifact ID. |
| **Artifact Store** | A persistent, content-addressed store for agent work products. Default implementation is SQLite. Exposes `write`, `read`, `list`, and `append_status`/`read_status`. |
| **Compaction** | The clearing or summarizing of an agent's LLM context window. An internal operation of the Memory subsystem. Not visible on the event bus. |
| **Memory Store** | Manages agent context lifecycle: conversation history persistence, compaction marking, and restore across restarts. Private component of `AgentBody`. Conversation history is stored in a `memory_turns` table distinct from the artifact store's content-addressed work products; the two share SQLite for storage convenience but have separate semantics. |
| **Session** | A `session_id` partitions the agent's conversation history. By default, an `AgentBody` mints a new `session_id` on its first construction; subsequent body restarts within the same process run (e.g. on TUI team swap) reuse the recorded `session_id` so conversation history persists. The supervisor maintains an in-memory `Map<agent_key, session_id>` for the process run. `session_id` is also overridable via `jie --resume <session_id>` / `jie --continue`, which load a session_id from a previous process run (rows in `memory_turns` are preserved indefinitely in v1, so prior sessions are still queryable). |
| **Workspace Root** | The directory where `jie` was invoked (`process.cwd()`). All file paths in tool calls (`bash`, `read_file`, `write_file`) resolve relative to this directory. Not configurable — `settings.json` and team manifests walk up from CWD to find `.jie/`, but path resolution in tools does not. |
| **Supervisor** | The lifecycle logic within the `jie` process. Instantiates AgentBody instances, connects MCP servers, starts/stops the team. Not an agent — has no soul, no LLM. |
| **Agent Idle** | An `agent.idle` event published when an agent transitions to idle state. Used by TUI and `-p` mode to detect when an agent is ready for new work. Replaces the heartbeat model. |
| **Streaming** | LLM output batched into `agent.stream.chunk` events (64 chars / 200 ms threshold) for live observation by the TUI. |
| **Team Blueprint** | A team-level definition that maps agent roles to souls, defines event types, and specifies the workflow. The platform runs the blueprint; the team layer provides it. |
