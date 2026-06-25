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
| TUI input | Publishes `Events.leaderPrompt({ kind: "agent", identity: { teamId: active_team_id, agentRole: leader.role, agentKey: leader.agent_key } }, prompt)` to `{active_team_id}.leader.prompt`. The envelope's `type` is the full subject; `sender` impersonates the leader so observers see a consistent sender across CLI-relayed and body-published prompts; `version: 1`; `timestamp` = current ISO 8601. | Leader agent of the active team |
| `jie -p "..."` | Same shape as TUI input, published via `Events.leaderPrompt` to `{startup_team_id}.leader.prompt`. The CLI runs the local idle gate (subscribes to `agent.turn.start` and `agent.idle`, opens when all bodies are idle) per `ui/cli.md` `jie -p` step 7. | Leader agent of the startup team |
| TUI direct addressing (per `ui/tui.md` "Prompt Sending") | Publishes `Events.userPrompt({ kind: "agent", identity: { teamId: active_team_id, agentRole: target.role, agentKey: target.agent_key } }, prompt)` to `{active_team_id}.{agent_key}`. `user.prompt` is a logical name distinct from `notify`-sourced `type`s. | Targeted agent of the active team |

**Convention for `agent_role` / `agent_key` in user-sourced envelopes.** The TUI/CLI is not an agent, but the envelope's `agent_role` / `agent_key` are agent-specific fields. The convention is: the TUI/CLI fill these with the **target agent's** role and `agent_key` (the leader for `leader.prompt`; the targeted agent for direct addressing). The receiving body sees its own `agent_key` in the envelope and can use it to confirm the target. Subscribers that filter by `agent_key` (e.g., the TUI's per-agent display) get the same value the target would have published, which keeps the wire format uniform across publishers.

The leader agent auto-subscribes to `{team_id}.leader.prompt` at startup. Every agent auto-subscribes to its own `{team_id}.{agent_key}` for direct addressing. Agents also subscribe to domain topics declared in their `.md` frontmatter `subscribe:` field. The team-scoping rule (team's view is unscoped, the platform prefixes `{team_id}.` at body construction) is in `03-event-system.md` "Subject Schema" (ADR 19). Agents communicate via the `notify` tool, which publishes to topics on the EventBus.

**Body's subscription callback receives the envelope.** When a body receives a message on a subscribed subject, the bus invokes the callback with `(subject, envelope)`. The body reads `envelope.payload.prompt` (for `leader.prompt` and `user.prompt`), `envelope.payload.source` (for `notify`-sourced events, used in self-receipt filtering and synthetic-message formatting), and `envelope.sender.identity.teamId` (when it needs to confirm the event is for its team — usually the subject prefix is sufficient, but the envelope is the authoritative source). The synthetic `user`-message formats are documented in `06-agent-model.md` "Prompt Ingress & Queuing".
