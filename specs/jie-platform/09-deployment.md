# Deployment and Process Model

## Runtime Model

Jie runs as a **single OS process** — the `jie` binary. All agents, the EventBus, the ArtifactStore, and the TUI share this process. MCP servers (configured in `mcp.yaml` with `transport: stdio`) run as child subprocesses.

```
┌────────────── jie process ──────────────┐
│                                          │
│  EventBus (in-process)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ leader-1 │ │ worker-1 │ │ worker-2 │ │
│  │(AgentBody)│ │(AgentBody)│ │(AgentBody)│ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│  ┌──────────┐  ┌──────────────────┐     │
│  │   TUI    │  │  ArtifactStore   │     │
│  │(jie-tui) │  │  (SQLite)        │     │
│  └──────────┘  └──────────────────┘     │
│                                          │
└──────────────────────────────────────────┘
         │
    ┌────┴────┐
    │   MCP   │  (subprocess, stdio transport)
    │ servers │
    └─────────┘
```

| Component | Count | Nature |
|---|---|---|
| `jie` process | 1 | Binary entry. Runs supervisor, agents, TUI in-process. |
| AgentBody | N (per blueprint) | In-process instance. Each has its own EventBus subscriptions, MemoryManager, and async event loop. |
| TUI | 1 | In-process component (imported from `jie-tui`). Passes `EventBus` and `ArtifactStore` refs at construction. |
| ArtifactStore | 1 | SQLite file. Single-writer by design (one process). |
| MCP servers (stdio) | N (per `mcp.yaml`) | Child subprocess managed by `jie`. |

No process-per-agent. No NATS server. No PID file for individual agents. No network ports.

## Startup Sequence

### `jie` (interactive TUI mode)

1. Walk up from CWD to find `.jie/config.yaml`. If absent, run interactive init flow.
2. Load team blueprint from `team_path` in config (or built-in fallback from `jie-team`).
3. Instantiate `InProcessEventBus`.
4. Open `ArtifactStore` (SQLite at `{workspace_root}/.jie/artifacts.db`).
5. Connect to MCP servers configured in `.jie/mcp.yaml`; register tools into `ToolRegistry`.
6. For each role in the blueprint, instantiate `AgentBody`:
   - Pass `AgentSoul` (parsed from agent `.md` files), `EventBus`, `ArtifactStore`, `MemoryManager`.
   - Each `AgentBody` subscribes to its auto-subscriptions (`{agent_key}`, plus `leader.prompt` for the leader) and domain topics from its `subscribe:` frontmatter.
7. Call `body.start()` on each AgentBody — they enter event loop, waiting for prompts.
8. Import and start `jie-tui` component, passing `EventBus` + `ArtifactStore` references.
9. TUI renders. Agents process work. SIGINT/SIGTERM triggers graceful shutdown.

### `jie -p "instruction"` (print mode)

Same as steps 1–7 above, then:

8. Subscribe to `agent.stream.chunk` (filter: `agent_role === leader`) → print to stdout. Also subscribe to domain topics to track work-unit lifecycle.
9. Publish `{ prompt: "instruction" }` to `leader.prompt`.
10. Wait for leader `agent.idle` event.
11. Print final newline, stop all agents, close DB, exit.

### Graceful Shutdown

On SIGINT/SIGTERM:
1. Stop each `AgentBody` (finish current turn, publish terminal event).
2. Unsubscribe all EventBus listeners.
3. Close `ArtifactStore` (SQLite).
4. Terminate MCP subprocesses.
5. Exit 0.

## Workspace Layout

```
./
  .jie/                  # Team-local state
    config.yaml          # Platform config (workspace_root, team_id, team_path)
    mcp.yaml             # MCP server definitions
    artifacts.db         # SQLite artifact store
    teams/               # Team blueprints
      default/           # One directory per team
        TEAM.md          # Team wiring (leader)
        leader.md        # Agent definitions
        worker_a.md
  src/                   # User's codebase (the workspace root)
```

## Health and Restarts

Agents do not crash — they handle tool failures gracefully and transition to `idle`. See `05-agent-model.md` Failure Handling.

If the `jie` process itself crashes (SIGSEGV, OOM), all agents die with it. No automatic restart in v1 — the user re-runs `jie`. Process-level resilience is a Day 2 concern.

## Logging

v1 uses `console.log` / `console.error` to stdout/stderr. No external logging library.

**Format**: `[ISO8601] [LEVEL] [agent_key] message`

| Level | Usage |
|---|---|
| `INFO` | Lifecycle events: agent started, work unit created, MCP server connected. |
| `WARN` | Non-fatal anomalies: tool execution approaching timeout, compaction threshold reached. |
| `ERROR` | Fatal conditions before exit: config parse failure, SQLite open failure. |

Tool-result errors are surfaced through the LLM conversation, not via the log. Agent-to-agent diagnostics are on the EventBus — logging is for operator visibility only.

Agents log to the shared stdout of the `jie` process. The `agent_key` prefix disambiguates output.

## MCP Server Management

MCP servers with `transport: stdio` are spawned as child subprocesses at startup. The parent `jie` process monitors them:
- If an MCP server exits unexpectedly, the in-flight tool call (if any) times out or returns `mcp_server_unreachable`. All subsequent invocations to that server also return errors until the server is reconnected. Agents handle these as tool-result errors and may retry or fail gracefully.
- The supervisor reconnects and re-registers tools on restart; the agent whose tool failed continues processing and learns from the error message.
