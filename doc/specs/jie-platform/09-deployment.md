# Deployment and Process Model

## Runtime Model

Jie runs as a **single OS process** — the `jie` binary. All agents, the EventBus, the ArtifactStore, and the TUI share this process. MCP servers (configured in `mcp.json` with `transport: stdio`) run as child subprocesses.

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
| `jie` process | 1 | Binary entry. Runs the platform's `createJiePlatform` (which spins up the bus, bodies, and the `JiePlatform` handle), agents, and the TUI in-process. |
| AgentBody | N (per blueprint) | In-process instance. Each has its own EventBus subscriptions, MemoryManager, and async event loop. |
| TUI | 1 | In-process component (imported from `jie-tui`). Passes `EventBus` and `ArtifactStore` refs at construction. |
| ArtifactStore | 1 | SQLite file. Single-writer by design (one process). |
| MCP servers (stdio) | N (per `mcp.json`) | Child subprocess managed by `jie`. |

No process-per-agent. No NATS server. No PID file for individual agents. No network ports.

## Startup Sequence

The startup sequence is the same for both `jie` (TUI) and `jie -p` (print mode), except for the final UI step.

1. **Discover settings.** Walk up from CWD to find `.jie/`. Load `.jie/settings.json` if present; deep-merge with `~/.jie/settings.json`. If neither exists, run with empty settings. See `10-configuration.md`.
2. **Validate settings.** Validate `settings.json` strictly. Any error (JSON parse, invalid value) → exit 1. See `10-configuration.md` Config Validation.
3. **Resolve team.** Apply the team resolution rules from `10-configuration.md`:
   - If `--team <id>` flag is given → use `<id>`; hard fail if not installed.
   - Else read `defaultTeam` from merged settings → use it; if stale (not installed), WARN and reset to first-available user team (or clear and use built-in minimal if no user teams exist).
   - Else pick first-available user team alphabetically across `.jie/teams/*` and `~/.jie/teams/*`.
   - Else use the platform's built-in minimal team (`packages/jie-platform/team/built-in/minimal-team.ts`, see `minimal-team.md`). The platform always has a runnable team.
4. **Open `ArtifactStore`** (SQLite at the `.jie/storage.db` discovered by walking up from CWD to find `.jie/` — same walk as settings and team lookup per `10-configuration.md` "Discovery"). If no `.jie/` exists at any parent level, the platform creates one at the **process CWD** (i.e. where the user invoked `jie`) so a fresh `cd /project && jie -p …` works without manual `mkdir .jie`. The created `.jie/` directory has mode `0755`; the created `storage.db` file has mode `0600` (it holds conversation history in `memory_turns` and is sensitive). Failure to open (e.g. permission denied, file corrupted, lock contention exhausted after `busy_timeout=5000`) → exit 1 with a clear error message. Multiple `jie` processes targeting the same `storage.db` are not supported in v1 (single-writer by design per `04-storage.md`); the second process will hit `busy_timeout` and exit 1.
5. **Model pre-check.** Walk every agent in the blueprint and resolve a concrete `(provider, modelId)` (per `06-agent-model.md` "Startup Pre-Check"). If any agent fails (no `model:` in its `.md`, and the merged `settings.json` does not provide a resolvable default), startup exits 1 with `No model has been selected, please login and select a default model.` (matches user scenario 6). This is a hard fail — no MCP work, no bodies constructed, no partial startup.
6. **(Day 2) Connect MCP servers** configured in `.jie/mcp.json` (project + global merge). Per-server connect failures log a `WARN` and skip that server; the team continues with the rest. See `10-configuration.md` MCP Server Configuration. **In v1 (per ADR 15) this step is skipped** — the platform does not load `mcp.json`, and the `ToolRegistry` only has built-in tools. Agent `.md` files listing `mcp:*` tools fail the cascade check at step 7.
7. **Construct `AgentSoul`s** from the resolved team's `.md` files. For each `AgentSoul`, resolve its `tools:` list against the `ToolRegistry`. If any tool fails to resolve (e.g. the MCP server for that tool failed to connect), the team's startup fails with a clear error citing the missing tool.
8. **Resolve the startup team's `session_id` and instantiate `InProcessEventBus` + `MemoryManager` per body.** Construct one `MemoryManager` (per ADR 12's `SqliteMemoryManager`) from the open `Storage`. Resolve the startup team's `session_id` per ADR 20: if `StartJieOptions.resumeSessionId` is set, validate via `memory.hasSession(team_id, session_id)` (exit 1 on failure); if `StartJieOptions.continueLastSession` is true, query `memory.mostRecentSessionId(team_id)` (WARN and mint fresh on null); else mint a fresh `session_id` (ULID). Record the resolved value in the platform's private `Map<team_id, session_id>` (per ADR 18). The body's `team_id` is the resolved team id from step 3; the body closes over it and passes it to every `persist` / `compact` / `restore` call. The body's `session_id` is the value resolved in this step (per-team model: one session id per team, shared across all agents in the team — see ADR 18). v1 loads the startup team only; multi-team loading is a Day 2+ concern (per ADR 19).
9. **Instantiate `AgentBody`** for each role:
   - Pass `AgentSoul`, `EventBus`, `ArtifactStore`, the **shared** `MemoryManager` (constructed once in step 8, per ADR 12), `team_id`, `session_id` (resolved by the handle per `08-memory.md` "Restore"), and `is_leader: boolean` (set by the team-blueprint loader per the rules in `06-agent-model.md` "Platform Auto-Wiring" — multi-agent teams with `TEAM.md`: `true` for the `leader:` role's body, `false` for others; single-agent teams without `TEAM.md`: `true` for the single body by implicit-leader rule; etc.). The constructor signature is the one in `06-agent-model.md` "AgentBody".
   - The body's `start()` (step 10) registers the body's auto-subscriptions (`{team_id}.{agent_key}` for every body, plus `{team_id}.leader.prompt` for the leader's body) and domain topics from the soul's `subscribe:` frontmatter (the platform prefixes `{team_id}.` at body construction per `03-event-system.md` and ADR 19).
   - Each body fills `team_id` into the `AgentEvent` envelope on every event it publishes. The full wire-format contract is in `03-event-system.md` "Event Envelope" and `02-protocol-stack.md` "Prompt Ingress".
10. **Call `body.start()`** on each `AgentBody` and `await` every body's `start()` before proceeding to step 11. The body's `start()` runs the four-step restore-and-start sequence documented in `06-agent-model.md` "AgentBody" `start()`: (1) register bus subscriptions, (2) `memory.restore()` and push to `agent.state.messages`, (3) if last message is `user`/`toolResult`, `agent.continue()`, (4) start the queue-processing loop (drain the queue if non-empty, otherwise wait for new events). The body does **not** publish `agent.idle` at startup. The "this team is loaded" signal is the next step.
11. **Publish `{team_id}.team.loaded`** for the startup team (per ADR 22). The platform publishes this event once, after all bodies' `start()` resolves, with payload `{ team_id, agents: [{ role, agent_key, is_leader }, ...] }` (sorted alphabetically by role). This is the TUI's agents-panel-at-boot anchor and replaces the per-body startup `agent.idle` as the canonical "team is loaded" signal. Subsequent team loads (Day 2+) follow the same pattern (per ADR 19).
12. **Branch by mode:**
    - **`jie` (TUI):** Import and start the `jie-tui` component, passing the `EventBus` reference. The TUI subscribes to the un-scoped platform subjects and filters by the active `team_id` from the envelope. TUI renders, user interacts. (Stub in v1 per ADR 15.) In Day 2+, the TUI's `/team <id>` slash command calls the platform's `loadTeam` (idempotent ensure-loaded) and then switches its view; previously-active teams keep running per ADR 19. The view switch is the TUI's concern, not a handle method. The TUI's "agent is alive" check is satisfied by `{team_id}.team.loaded` (per ADR 22), not by per-body `agent.idle`.
    - **`jie -p <instruction>`:** Subscribe to `agent.stream.chunk` (filter `sender.identity.teamId === <startup_team_id> && sender.identity.agentRole === <leader_role>`) → print to stdout. Publish `Events.userPrompt({ kind: "cli" }, <startup_team_id>, "<instruction>")` to `{startup_team_id}.leader.prompt`. The envelope's `topic` is the full subject, `payload` is `{ teamId: <startup_team_id>, prompt }`, `sender` is `{ kind: "cli" }` (the CLI is the publisher, not the target), `version: 1`, `timestamp` = current ISO 8601 (per `02-protocol-stack.md` "Prompt Ingress" and `ui/cli.md` `jie -p` step 6). The CLI then runs its local idle gate (subscribes to `agent.turn.start` and `agent.idle`, maintains per-body state, opens when all bodies are idle — see `ui/cli.md` `jie -p` step 7 for the full implementation). Print final newline, exit.

### Graceful Shutdown

On SIGINT/SIGTERM:

1. **Send abort** to all in-flight operations across **all loaded teams**: agent loops, tool calls, and MCP requests. The combined `AbortSignal` propagates the abort; tools see it and throw `AbortError`.
2. **Bounded wait**: wait up to **10 seconds** for agents (across all loaded teams) to finish their abort handling and exit their loops. The handle maintains internal "bodies settled" bookkeeping for this wait (consuming the same `agent.turn.start` / `agent.idle` events that the CLI's `-p` idle gate consumes per `ui/cli.md` step 7), but does not expose it. `stop()` is the only lifecycle primitive that needs this check; the CLI does not consume it.
3. **On timeout**: force-exit the process. No further cleanup. Agents may have left a partial state in the artifact store; the next run starts with a clean session.
4. **On graceful exit (within 10s)**: close `ArtifactStore` (SQLite), terminate MCP subprocesses, unsubscribe event listeners, exit 0.

The 10s window balances responsiveness against letting a slow tool complete cleanly. Configurable later if needed.

## Workspace Layout

```
./
  .jie/                  # Project-local platform state (discovered by walking up from CWD)
    settings.json        # Optional project overrides for defaultProvider/defaultModel/defaultTeam (deep-merged over global)
    mcp.json             # MCP server definitions
    storage.db           # SQLite artifact store
    teams/               # User-installed team directories (project-local)
      <team_id>/         # One directory per team; looked up by `defaultTeam` from settings
        TEAM.md          # Team wiring (leader)
        <role>.md        # Agent definitions (one per role)
  src/                   # User's codebase (workspace = process.cwd(), not configurable)
```

User teams can also live globally at `~/.jie/teams/<team_id>/` for sharing across projects. The platform's selected team is `defaultTeam` from merged settings (or `--team <id>` for one-shot override); `defaultTeam` is reset to first-available if stale.

## Health and Restarts

Agents do not crash — they handle tool failures gracefully and transition to `idle`. See `06-agent-model.md` Failure Handling.

If the `jie` process itself crashes (SIGSEGV, OOM), all agents die with it. No automatic restart in v1 — the user re-runs `jie`. Process-level resilience is a Day 2 concern.

## Logging

v1 uses `console.log` / `console.error` to stdout/stderr. No external logging library.

**Format**: `[ISO8601] [LEVEL] [agent_key] message`

| Level | Usage |
|---|---|
| `INFO` | Lifecycle events: agent started. |
| `WARN` | Non-fatal anomalies: tool execution approaching timeout. |
| `ERROR` | Fatal conditions before exit: config parse failure, SQLite open failure. |

Tool-result errors are surfaced through the LLM conversation, not via the log. Agent-to-agent diagnostics are on the EventBus — logging is for operator visibility only.

Agents log to the shared stdout of the `jie` process. The `agent_key` prefix disambiguates output.

## MCP Server Management

MCP servers with `transport: stdio` are spawned as child subprocesses at startup. The parent `jie` process monitors them:
- **Startup connect failure** (server not reachable, catalog fetch failed): log a `WARN`, do not register that server's tools. Startup continues with the rest of the team. If the team's blueprint depends on tools from the failed server, the team fails to start (see `10-configuration.md` Cascade: Agent Load Failure).
- **Mid-session server exit**: the in-flight tool call (if any) times out or returns `mcp_server_unreachable`. All subsequent invocations to that server also return errors until the server is reconnected. Agents handle these as tool-result errors and may retry or fail gracefully. The platform does **not** auto-reconnect mid-session; restart the process to recover.

**MCP servers are generic.** The platform has no per-server code. Any MCP server is configured in `mcp.json` like any other, and follows the cascade policy above. A team's MCP-server dependency is declared in that team's `.md` manifest. If a server is unreachable at startup, the dependent team fails to start (cascade); a team with no dependency is unaffected. This is consistent with ADR 4 (MCP-agnostic platform).
