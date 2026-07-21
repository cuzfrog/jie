# Protocol Stack

| Concern | Technology | Notes |
|---|---|---|
| Agent loop | **`@earendil-works/pi-agent-core`** | LLM thinking, streaming, tool execution, turn management. Model objects via `@earendil-works/pi-ai`. |
| Inter-agent messaging | **In-process EventBus** | `InProcessEventBus` — pub/sub within a single OS process. A NATS transport plugs in behind the same `EventBus` interface if single-machine deployment is ever outgrown (ADR 5). See `03-event-system.md`. |
| Work products | **Artifact store** (SQLite) | KV semantics (`INSERT OR REPLACE`) — no append-only history; sequenced keys are how a team records progression. See `04-storage.md`. |
| Agent → Tool | Direct function call | Tools are plain typed functions. `notify` is the LLM's only way to publish an event; the body mediates the publish. See `06-agent-model.md`. |
| Tool provisioning | Built-ins; MCP as the extension point | Built-in tools are always registered. MCP-backed tools are the planned extension point — **not implemented today** (ADR 4); `mcp:*` tool specs currently resolve to zero tools. |

## Prompt Ingress

Both user surfaces go through the platform handle: `handle.prompt(teamId, agentKey, text)` publishes `Events.userPrompt({ kind: "user" }, teamId, prompt, agentKey)` on the `user.prompt` topic — the wire format is the full `EventEnvelope` (`03-event-system.md`); there is no shorthand publish path. Each body subscribes to `user.prompt` filtered on `payload.agentKey`, so a prompt reaches exactly the addressed agent. The TUI addresses the focused agent (the leader by default); `jie -p` addresses the leader (`team.leaderKey` from `system.team.loaded`).

The `sender` is always `{ kind: "user" }` — the originating surface does not identify itself on the envelope, and the addressee travels in the payload, not the topic: there are no per-agent subjects and no leader-only ingress topic. Inter-agent messaging goes through the `notify` tool, which publishes via `Events.custom` to `custom.${teamId}.${topic}`.
