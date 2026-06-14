# Protocol Stack

| Concern | Technology | Notes |
|---|---|---|
| Agent loop (LLM thinking + tool use) | **`@earendil-works/pi-agent-core`** | Agent loop, streaming, tool execution, turn management. Model resolution via `@earendil-works/pi-ai`'s `getModel()`. |
| Inter-agent messaging | **In-process EventBus** (v1) / NATS (future) | Pub/sub within a single OS process. Same interface, NATS as pluggable transport for Day 2. See `03-event-system.md`. |
| Status tracking | **Artifact store** (SQLite-backed) | Append-only status records per work unit. Latest row is canonical state. See `05-artifact-store.md`. |
| Agent → Tool | Direct function call | Tools are plain typed functions. `notify` is the LLM's only way to publish an event; the body mediates the publish. See `06-agent-model.md`. |
| Tool backing | **MCP** (transparent) | MCP-backed tools registered into `ToolRegistry` at startup — the LLM sees real schemas; MCP-ness is invisible. |
| External integrations | **MCP** (any configured server) | Configured in `.jie/mcp.json`. Platform is agnostic of specific servers. |

## Prompt Ingress

User prompts originate from two surfaces. **The wire format is the `AgentEvent` envelope** (per `03-event-system.md` "Event Envelope") — there is no shorthand or partial-publish path. Publishers (TUI, CLI, body) fill every envelope field; subscribers receive the full envelope as the bus's `payload` parameter.

| Source | Mechanism | Destination |
|---|---|---|
| TUI input | Publishes the `AgentEvent` envelope to `{active_team_id}.leader.prompt`. Envelope: `event_type: 'leader.prompt'`; `payload: { prompt }` per `PlatformEventPayload`; `team_id` = active team's id; `agent_role` and `agent_key` = the **leader's** role and `agent_key` (so the envelope matches the leader's own envelope on receipt); `version: 1`; `timestamp` = current ISO 8601. | Leader agent of the active team |
| `jie -p "..."` | Publishes the `AgentEvent` envelope to `{startup_team_id}.leader.prompt`. Same envelope shape as the TUI input row; `team_id` = startup team's id. | Leader agent of the startup team |
| TUI direct addressing (per `ui/tui.md` "Prompt Sending") | Publishes the `AgentEvent` envelope to `{active_team_id}.{agent_key}`. Envelope: `event_type: 'user.prompt'` (a logical name distinct from `notify`-sourced `event_type`s); `payload: { prompt }`; `team_id` = active team's id; `agent_role` and `agent_key` = the **targeted agent's** role and `agent_key`. | Targeted agent of the active team |

**Convention for `agent_role` / `agent_key` in user-sourced envelopes.** The TUI/CLI is not an agent, but the envelope's `agent_role` / `agent_key` are agent-specific fields. The convention is: the TUI/CLI fill these with the **target agent's** role and `agent_key` (the leader for `leader.prompt`; the targeted agent for direct addressing). The receiving body sees its own `agent_key` in the envelope and can use it to confirm the target. Subscribers that filter by `agent_key` (e.g., the TUI's per-agent display) get the same value the target would have published, which keeps the wire format uniform across publishers.

The leader agent auto-subscribes to `{team_id}.leader.prompt` at startup. Every agent auto-subscribes to its own `{team_id}.{agent_key}` for direct addressing. Agents also subscribe to domain topics declared in their `.md` frontmatter `subscribe:` field. The team-scoping rule (team's view is unscoped, the platform prefixes `{team_id}.` at body construction) is in `03-event-system.md` "Subject Schema" (ADR 21). Agents communicate via the `notify` tool, which publishes to topics on the EventBus.

**Body's subscription callback receives the envelope.** When a body receives a message on a subscribed subject, the bus invokes the callback with `(subject, envelope)`. The body reads `envelope.payload.prompt` (for `leader.prompt` and `user.prompt`), `envelope.payload.source` (for `notify`-sourced events, used in self-receipt filtering and synthetic-message formatting), and `envelope.team_id` (when it needs to confirm the event is for its team — usually the subject prefix is sufficient, but the envelope is the authoritative source). The synthetic `user`-message formats are documented in `06-agent-model.md` "Prompt Ingress & Queuing".
