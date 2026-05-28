# Protocol Stack

| Concern | Technology | Notes |
|---|---|---|
| Inter-agent messaging | **NATS** (with JetStream) | Events: tasks, streaming chunks, observability. JetStream is OSS-included. |
| Task status & idempotency gate | **Artifact store** (`task_status` artifact type, SQLite-backed) | Append-only per-task_id status records. Latest row per task_id is canonical state. Body's `notify` CAS uses optimistic concurrency in SQLite. See `04-artifact-store.md` and `07-agent-model.md`. |
| Agent → Tool | Direct function call | Tools are plain typed functions. Most tools have no awareness of the bus. The sole exception is the built-in `notify` tool, which is the LLM's only way to publish an event; the body mediates the actual publish. See `07-agent-model.md`. |
| Tool backing | **MCP** (transparent) | MCP-backed tools are auto-promoted to first-class entries in the soul's tool list at startup. The LLM sees real schemas; MCP-ness is invisible to the soul author and the LLM. |
| Code-Lens | **MCP server** (`packages/code-lens/`) | Standalone, reusable process. Architect connects as a regular MCP client. |
| External integrations | **MCP** (GitHub / JIRA / etc.) | Same machinery as Code-Lens; soul declares `mcp:<server>:<glob>` to import the relevant tools. |

### Prompt Ingress

User prompts arrive on NATS subjects under `team.{team_id}.`:

| Subject | Listener | Purpose |
|---|---|---|
| `team.{team_id}.prompt` | DM | Default ingress — any prompt without an explicit agent target |
| `team.{team_id}.{agent_id}.prompt` | That agent | Targeted ingress — a specific agent receives the prompt directly |

The TUI publishes to these subjects when the user enters a prompt. A headless CLI (`jie prompt`) may also publish to them. For v1, only the DM listens to `team.{team_id}.prompt`; per-agent prompt handling for other roles is deferred. Cron, webhooks, and backlog polling are deferred (see Open Items).

No agent exposes a direct call surface. Multiple teams may share the same NATS bus, separated by topic namespace. Per-team artifact storage is local (one SQLite file per team).
