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

User prompts originate from two surfaces. **The wire format is the `EventEnvelope`** (per `03-event-system.md` "Event Envelope") — there is no shorthand or partial-publish path. Publishers (TUI, CLI, body) construct envelopes via the `Events` factory and fill every field; subscribers receive the full envelope as the bus's `payload` parameter.

| Source | Mechanism | Destination |
|---|---|---|
| TUI input | Publishes `Events.userPrompt({ kind: "tui" }, active_team_id, prompt, leader_agent_key)` — the TUI resolves the active team's leader's `agent_key` (from the `team.loaded` event) and passes it as the fourth arg. The factory interpolates `team.{teamId}.agent.{agentKey}.prompt` to `team.{active_team_id}.agent.{leader_agent_key}.prompt`; `payload` is `{ teamId, agentKey, prompt }`; `sender` is `{ kind: "tui" }`; `version: 1`; `timestamp` = current ISO 8601. | Leader agent of the active team |
| `jie -p "..."` | Publishes `Events.userPrompt({ kind: "cli" }, startup_team_id, "<instruction>", leader_agent_key)` — the CLI captures the leader's `agent_key` from the `team.loaded` event and passes it. The CLI runs the local idle gate (subscribes to `agent.turn.start` and `agent.idle`, opens when all bodies are idle) per `ui/cli.md` `jie -p` step 7. | Leader agent of the startup team |
| TUI direct addressing (per `ui/tui.md` "Prompt Sending") | Publishes `Events.userPrompt({ kind: "tui" }, active_team_id, prompt, target_agent_key)`. The factory interpolates to `team.{active_team_id}.agent.{target_agent_key}.prompt`; `payload` is `{ teamId, agentKey, prompt }`; `sender` is `{ kind: "tui" }`. The target agent's body auto-subscribes to its own subject, so the prompt reaches only the targeted agent. | Targeted agent of the active team |

**Sender is the publisher, not the target.** The TUI and CLI publish with `sender.kind: "tui"` and `sender.kind: "cli"` respectively — the publisher is the surface that originated the prompt, not the agent that will receive it. No impersonation of the target agent is performed. The body's subscription is scoped by the subject `team.{teamId}.agent.{agentKey}.prompt`; only the body whose `agent_key` matches the `agentKey` placeholder receives the event.

The leader and every other agent auto-subscribes to its own `team.{team_id}.agent.{agent_key}.prompt` at startup. The targeted subject is the same uniform pattern for both the leader path (the leader's `agent_key`) and direct addressing (any other agent's `agent_key`). Agents also subscribe to client-defined domain topics declared in their `.md` frontmatter `subscribe:` field, which the platform subscribes to as `custom.{team_id}.{topic}`. The team-scoping rule (team's view is unscoped, the platform prefixes `custom.{team_id}.` for client-defined topics and `team.{team_id}.` for the two platform-managed subjects) is in `03-event-system.md` "Subject Schema" (ADR 19). Agents communicate via the `notify` tool, which publishes via `Events.custom` to topics on the EventBus.

**Body's subscription callback receives the envelope.** When a body receives a message on a subscribed subject, the bus invokes the callback with `(subject, envelope)`. The body reads `envelope.payload.prompt` for user prompts (the `team.{teamId}.agent.{agentKey}.prompt` envelope payload is `{ teamId, agentKey, prompt }`), and `envelope.payload.payload.source` for `notify`-sourced events (the inner `payload` field of the `Events.custom` envelope carries `{ prompt, source }`). The synthetic `user`-message formats are documented in `06-agent-model.md` "Prompt Ingress & Queuing".
