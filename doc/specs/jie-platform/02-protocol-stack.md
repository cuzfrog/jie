# Protocol Stack

| Concern | Technology | Notes |
|---|---|---|
| Agent loop | `@earendil-works/pi-agent-core` | LLM thinking, streaming, tool execution, turn management. Model objects via `@earendil-works/pi-ai`. |
| Inter-agent messaging | In-process EventBus | `InProcessEventBus` — pub/sub in one OS process. A NATS transport can plug in behind the same interface if single-machine is outgrown (ADR 5). See `03-event-system.md`. |
| Work products | Artifact store (SQLite) | KV semantics (`INSERT OR REPLACE`). See `04-storage.md`. |
| Agent → Tool | Direct function call | Tools are typed functions. `notify` is the LLM's only way to publish an event (`06-agent-model.md`). |
| Tool provisioning | Built-ins; MCP as the extension point | Built-ins are always registered; MCP-backed tools are the planned extension point — not implemented today (ADR 4). See `06-agent-model.md` "ToolRegistry". |

## Prompt Ingress

Both user surfaces go through the platform handle: `handle.prompt(teamId, agentKey, text)` publishes `Events.userPrompt({ kind: "user" }, teamId, prompt, agentKey)` on the `user.prompt` topic — the envelope's `sender` is always `{ kind: "user" }`, the addressee rides in the payload (`agentKey`), not the topic, so there are no per-agent subjects and no leader-only ingress topic. Each body subscribes to `user.prompt` filtered on its `agentKey`, so a prompt reaches exactly the addressed agent. Inter-agent messaging goes through the `notify` tool, which publishes via `Events.custom` to `custom.${teamId}.${topic}`. Subscription filtering, dequeue/requeue, and the ingress-as-synthetic-user-message pipeline are in `03-event-system.md` ("Subscription model") and `06-agent-model.md` ("notify and the Subscription Model").
