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

User prompts originate from two surfaces:

| Source | Mechanism | Destination |
|---|---|---|
| TUI input | Publishes `{ prompt }` to `leader.prompt` on the in-process EventBus | Leader agent |
| `jie -p "..."` | Publishes `{ prompt }` to `leader.prompt` on the in-process EventBus | Leader agent |

The leader agent auto-subscribes to `leader.prompt` at startup. Every agent auto-subscribes to its own `{agent_key}` for direct addressing. Agents also subscribe to domain topics declared in their `.md` frontmatter `subscribe:` field. Agents communicate via the `notify` tool, which publishes to topics on the EventBus.
