# Jie (界) Platform — Overview

> "Constraints liberate, liberties constrain."

The Jie Platform is an orchestration framework for building multi-agent systems. It provides the runtime infrastructure — event bus, agent model, tool system, persistence, and deployment — without prescribing what agents do or how they coordinate. Teams define agents, event types, and workflows on top of the platform.

---

## Glossary

| Term | Definition |
|---|---|
| **Agent** | A runtime process that holds a `Soul` (behavioral definition), connects to the Event Bus, and executes tool calls on behalf of its soul. Agents communicate exclusively through events — they have no direct knowledge of each other. |
| **Soul** | Declares an agent's behavioral profile: its model, system prompt, tool list, and event subscriptions/publishes. Immutable at runtime. Carries no mutable state. |
| **Body** | The concrete runtime process. Holds a soul, an EventBus client, an ArtifactStore client, and a MemoryStore. Executes the event loop and validates + publishes events on behalf of the soul. |
| **Event Bus** | The shared message transport (NATS + JetStream). Agents publish and subscribe to events on a subject namespace. No direct agent-to-agent communication. |
| **Event Type** | A dotted string identifying a kind of event on the bus (e.g. `task.recorded`, `agent.stream.chunk`). Teams define their domain event types. |
| **Leader Agent** | A team designates one agent role as its leader — the sole external-facing entry point. The leader subscribes to `team.{team_id}.prompt` and handles prompt ingress. |
| **Tool** | A typed function with a JSON schema, available to an agent's LLM. Tools are pluggable: built-in tools ship with the platform, MCP-backed tools are discovered at startup, and teams may define additional tools. |
| **Tool Registry** | Resolves tool spec strings (e.g. `read_file`, `mcp:server:method`, `mcp:server:*`) into `Tool` instances at soul-load time. MCP-backed tools are auto-promoted to first-class entries. |
| **MCP Server** | An external process exposing tools over the Model Context Protocol. The platform connects to configured MCP servers at soul-load time and registers their tools. |
| **`notify` Tool** | A built-in tool that is the LLM's sole means of publishing an event. The body validates, enriches, and publishes. Not available to custom team-defined tools. |
| **Artifact** | A persisted work product in the Artifact Store. Indexed by an opaque ID (ULID). Referenced on the event bus only by artifact ID. |
| **Artifact Store** | A persistent, content-addressed store for agent work products. Default implementation is SQLite. Exposes `write`, `read`, `list` operations. |
| **Compaction** | The clearing or summarizing of an agent's LLM context window. An internal operation of the Memory subsystem. Not visible on the event bus. |
| **Memory Store** | Manages agent context lifecycle: conversation history, compaction of stale turns, and persistence across restarts. Private component of `AgentBody`. |
| **Workspace Root** | The root directory of the user's codebase under Jie management. All file paths throughout the platform — tool arguments, event payloads, config-relative paths — resolve relative to the workspace root. |
| **Supervisor** | The team's lifecycle manager. Orchestrates process launch, health monitoring, restarts, and shutdown. Not an agent — has no soul, no LLM, no event subscriptions. |
| **Heartbeat** | Periodic liveness signal published by the supervisor and each agent body. Used by observers (TUI, CLI `doctor`) for discovery and health monitoring. Ephemeral on JetStream. |
| **Turn Budget** | Two per-agent, per-event-loop caps: `error_turn_budget` (decrements on tool-error turns, default 30) and `total_turn_budget` (decrements unconditionally, default 200). Exhaustion force-publishes a terminal event. |
| **Streaming** | LLM output is batched into `agent.stream.chunk` events (64 chars / 200 ms threshold) for live observation by the TUI. Ephemeral on JetStream. |
| **Team Blueprint** | A team-level definition that maps agent roles to souls, defines event types, and specifies the workflow (who subscribes to what). The platform runs the blueprint; the team layer provides it. |
