# Deployment and Process Model

## Process Topology

A Jie team runs as a set of OS processes orchestrated by a supervisor:

```
┌─────────────────────────────────────────────────────────┐
│ Supervisor                                              │
│  ┌──────────┐ ┌──────────┐ ┌───┐ ┌──────┐ ┌──────────┐ │
│  │ dm       │ │researcher│ │...│ │tui   │ │code-lens │ │
│  │ (body)   │ │ (body)   │ │   │ │      │ │          │ │
│  └──────────┘ └──────────┘ └───┘ └──────┘ └──────────┘ │
└─────────────────────────────────────────────────────────┘
         │                                     │
    ┌────┴────┐                          ┌─────┴─────┐
    │  NATS   │                          │ Artifact  │
    │ Server  │                          │ Store     │
    └─────────┘                          │ (SQLite)  │
                                         └───────────┘
```

| Process | Count | Role |
|---|---|---|
| Supervisor | 1 | Orchestrates team lifecycle: spawns, health-checks, restarts agent bodies. Launches Code-Lens. |
| Agent body (per role) | 1 per role (6 total) | DM, Researcher, Architect, Planner, Implementer, Reviewer. Each is its own OS process. |
| Code-Lens | 1 per team | Standalone MCP server for AST queries. Started by supervisor before agent bodies. |
| TUI | 1 | Terminal UI. Subscribes to team events on NATS, publishes prompts. |
| NATS Server | 1 (shared) | Message bus. External process — may be shared across teams (soft isolation, see `02-protocol-stack.md`). |
| Artifact Store | 0 (SQLite file) | Not a process. One SQLite database file per workspace, accessed by agent bodies via `packages/storage/`. |

## Supervisor

The supervisor is the team's lifecycle manager. It is **not** an agent — it has no soul, no LLM, and no event subscriptions. It is operational infrastructure.

Responsibilities:

- **Launch.** On team start, the supervisor:
  1. Starts / verifies NATS connectivity.
  2. Starts Code-Lens (per-team instance, configured with workspace root).
  3. Spawns agent body processes in subscription order: DM first (it subscribes to prompt ingress), then Researcher, Architect, Planner, Implementer, Reviewer.
  4. Spawns the TUI process.
- **Health monitoring.** The supervisor monitors each child process. If an agent body exits:
  - On `task.failed` (clean exit after publishing the event): the supervisor restarts the agent process. The body re-subscribes via JetStream and is ready for the next task. Other agents are unaffected.
  - On crash (SIGSEGV, unhandled panic): the supervisor force-publishes `task.failed` on behalf of the crashed agent with `error = "agent_crash"`, then restarts the process.
  - On MCP server unreachable (exited after publishing `task.failed`): supervisor restarts Code-Lens, then the agent.
- **Team shutdown.** Supervisor sends SIGTERM to all child processes, waits for graceful exit, then force-kills stragglers.

## Agent Body Process

Each agent body is an independent OS process that:

1. Loads its soul definition from `packages/agents/`.
2. Connects to NATS and subscribes to the role's subjects.
3. Opens the team's SQLite artifact store.
4. Enters the event loop (see `07-agent-model.md`).
5. Exits when `stop()` is called or on a fatal error after publishing `task.failed`.

Agent bodies do not communicate directly with each other. All coordination is through the event bus.

## Workspace Layout

```
./
  .jie/                  # Team-local state
    config.yaml          # Team config (NATS address, Code-Lens address, workspace root)
    artifacts.db         # SQLite artifact store (one per team)
  src/                   # User's codebase (the workspace root)
```

The `.jie/` directory is the team's scratch space. It is discovered by the supervisor via:
1. An explicit `--config` flag.
2. Walking up from the current working directory to find `.jie/config.yaml`.

## CLI Entry Points

Defined in `11-ui/cli.md`. The headless CLI (`jie`) provides `jie start`, `jie prompt`, `jie status`, `jie stop`.

## Configuration

Defined in `14-configuration.md`. Minimum v1 surface: `.jie/config.yaml` with `team_id`, `nats_url`, `code_lens_url`, and `workspace_root`. See that chapter for the full config surface, budget overrides, and discovery rules.
