# Protocol Stack

| Concern | Technology | Notes |
|---|---|---|
| Inter-agent messaging | **NATS** (with JetStream) | Events, streaming chunks, observability. JetStream is OSS-included. |
| Status tracking | **Artifact store** (SQLite-backed) | Append-only status records per work unit. Latest row is canonical state. Body validates transitions internally before appending. See `04-artifact-store.md`. |
| Agent → Tool | Direct function call | Tools are plain typed functions. Most tools have no awareness of the bus. The sole exception is the built-in `notify` tool, which is the LLM's only way to publish an event; the body mediates the actual publish. See `05-agent-model.md`. |
| Tool backing | **MCP** (transparent) | MCP-backed tools are auto-promoted to first-class entries in the soul's tool list at startup. The LLM sees real schemas; MCP-ness is invisible to the soul author and the LLM. |
| Code-Lens | **MCP server** (`packages/code-lens/`) | Per-team instance, started by supervisor alongside team processes. See `06-code-lens/service.md`. |
| External integrations | **MCP** (GitHub / JIRA / etc.) | Same machinery as Code-Lens; soul declares `mcp:<server>:<glob>` to import the relevant tools. |

## Prompt Ingress

User prompts arrive on NATS subjects under `team.{team_id}.`:

| Subject | Listener | Purpose |
|---|---|---|
| `team.{team_id}.prompt` | Leader agent | Default ingress — any prompt without an explicit agent target. The team blueprint designates which role is the leader. |
| `team.{team_id}.{agent_id}.prompt` | That agent | Targeted ingress — a specific agent receives the prompt directly. |
| `team.{team_id}.response.{reply_id}` | CLI | Leader response channel for `jie prompt` request-response (see `07-ui/messaging-protocol.md`). |

The TUI publishes to these subjects when the user enters a prompt. A headless CLI (`jie prompt`) may also publish to them. The team blueprint defines which role subscribes to `team.{team_id}.prompt` as the leader.

No agent exposes a direct call surface. Multiple teams may share the same NATS bus. v1 uses **soft isolation**: agent subscription discipline (agents subscribe to their team's specific inbound subject patterns) plus `team_id` embedded in `session_id` hash. Hard NATS-level isolation (accounts, JWTs) is deferred to a Security chapter (Day 3). Per-team artifact storage is local (one SQLite file per team).
