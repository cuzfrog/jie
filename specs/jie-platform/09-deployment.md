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

The startup sequence is the same for both `jie` (TUI) and `jie -p` (print mode), except for the final UI step.

1. **Discover config.** Walk up from CWD to find `.jie/config.yaml`. If absent, the platform runs with all defaults — no interactive init flow.
2. **Validate config.** If a config file is present, validate it strictly. Any error (YAML parse, unknown key, invalid value) → exit 1. See `10-configuration.md` Config Validation.
3. **Resolve team.** Apply the team resolution rules from `10-configuration.md`:
   - If `team_id` is set in config → look up `.jie/teams/<team_id>/TEAM.md`, then `~/.jie/teams/<team_id>/TEAM.md`. If neither exists → startup fails.
   - If `team_id` is absent → use the team at `.jie/teams/minimal/TEAM.md` (or the global equivalent). If neither exists → startup fails.
4. **Open `ArtifactStore`** (SQLite at `{workspace_root}/.jie/artifacts.db`). Failure → exit 1.
5. **Connect MCP servers** configured in `.jie/mcp.yaml` (project + global merge). Per-server connect failures log a `WARN` and skip that server; the team continues with the rest. See `10-configuration.md` MCP Server Configuration.
6. **Construct `AgentSoul`s** from the resolved team's `.md` files. For each `AgentSoul`, resolve its `tools:` list against the `ToolRegistry`. If any tool fails to resolve (e.g. the MCP server for that tool failed to connect), the team's startup fails with a clear error citing the missing tool.
7. **Instantiate `InProcessEventBus`** and the `MemoryManager` per body.
8. **Instantiate `AgentBody`** for each role:
   - Pass `AgentSoul`, `EventBus`, `ArtifactStore`, `MemoryManager`.
   - Each body subscribes to its auto-subscriptions (`{agent_key}`, plus `leader.prompt` for the leader) and domain topics from its `subscribe:` frontmatter.
9. **Call `body.start()`** on each `AgentBody` — they enter their event loops, waiting for prompts.
10. **Branch by mode:**
    - **`jie` (TUI):** Import and start the `jie-tui` component, passing `EventBus` + `ArtifactStore` references. TUI renders, user interacts.
    - **`jie -p <instruction>`:** Subscribe to `agent.stream.chunk` (filter `agent_role === leader`) → print to stdout. Publish `{ prompt: "<instruction>" }` to `leader.prompt`. Wait for leader `agent.idle` event. Print final newline, exit.

### Graceful Shutdown

On SIGINT/SIGTERM:

1. **Send abort** to all in-flight operations: agent loops, tool calls, and MCP requests. The combined `AbortSignal` (per ADR 9 §1) propagates the abort; tools see it and throw `AbortError`.
2. **Bounded wait**: wait up to **10 seconds** for agents to finish their abort handling and exit their loops.
3. **On timeout**: force-exit the process. No further cleanup. Agents may have left a partial state in the artifact store; the next run starts with a clean session.
4. **On graceful exit (within 10s)**: close `ArtifactStore` (SQLite), terminate MCP subprocesses, unsubscribe event listeners, exit 0.

The 10s window balances responsiveness against letting a slow tool complete cleanly. Configurable later if needed.

## Workspace Layout

```
./
  .jie/                  # Team-local state
    config.yaml          # Optional platform config (workspace_root, team_id, stream tunables)
    mcp.yaml             # MCP server definitions
    artifacts.db         # SQLite artifact store
    teams/               # User-installed team directories (project-local)
      <team_id>/         # One directory per team; looked up by team_id from config
        TEAM.md          # Team wiring (leader)
        <role>.md        # Agent definitions (one per role)
  src/                   # User's codebase (the workspace root)
```

User teams can also live globally at `~/.jie/teams/<team_id>/` for sharing across projects. The minimal team lives at one of the standard paths and is loaded when `team_id` is absent from config.

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
- **Startup connect failure** (server not reachable, catalog fetch failed): log a `WARN`, do not register that server's tools. Startup continues with the rest of the team. If the team's blueprint depends on tools from the failed server, the team fails to start (see `10-configuration.md` Cascade: Agent Load Failure).
- **Mid-session server exit**: the in-flight tool call (if any) times out or returns `mcp_server_unreachable`. All subsequent invocations to that server also return errors until the server is reconnected. Agents handle these as tool-result errors and may retry or fail gracefully. The supervisor does **not** auto-reconnect mid-session; restart the process to recover.

**Code-Lens is generic MCP.** The platform has no code-lens-specific code. Code-Lens is one MCP server among many, configured in `mcp.yaml` like any other, and follows the cascade policy above. A team's code-lens dependency (e.g. an Architect role's `mcp:code-lens:get_module_exports`, `mcp:code-lens:get_import_graph`) is declared in that team's `.md` manifest. If code-lens is unreachable at startup, the dependent team fails to start (cascade); a team with no code-lens dependency is unaffected. This is consistent with ADR 4 (MCP-agnostic platform).
