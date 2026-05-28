# CLI

Headless command-line interface for publishing prompts, observing team state, and managing the team lifecycle. Part of the UI family alongside the TUI (`11-ui/tui.md`).

## Config Discovery

All commands resolve configuration by walking up from CWD to find `.jie/config.yaml`. If not found, the command exits with code 1 and an error message.

Config is loaded once at invocation. Changes to config while a command is running are not observed.

## Global Flags

| Flag | Behavior |
|---|---|
| `--json` | Machine-readable output. One JSON object per line (JSONL). Available on `start`, `doctor`, `query-task`, and `prompt`. |

Global flags must appear before the subcommand.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success. |
| 1 | Usage error (bad args, config not found, team already running). |
| 2 | Infrastructure error (NATS unreachable, artifact store locked, connection lost). |
| 3 | Timeout (prompt response timed out, graceful stop timed out). |

---

## `jie`

Start the full team (backend + TUI).

```
jie
```

### Behavior

1. Load config. If `code_lens_url` or `nats_url` fails a connectivity check, exit code 2.
2. Check `.jie/supervisor.pid`:
   - **No PID file, or PID file exists but process is dead**: start the backend (supervisor + agents + Code-Lens) as described in `jie start`. Then launch the TUI process. The `jie` process tracks that it owns the backend and forwards SIGINT/SIGTERM to both children. When the TUI exits, `jie` stops the backend and exits.
   - **Live supervisor at PID**: do not start the backend. Launch the TUI only. `jie` does not own the backend; on exit, only the TUI is stopped. The backend continues running.
3. If `.jie/` directory is not writable → exit 1, message: `"cannot write to .jie/: {reason}"`.

### Errors

- Config not found → exit 1.
- NATS unreachable → exit 2.
- Code-Lens unreachable → exit 2.
- `.jie/` not writable → exit 1.

---

## `jie start`

Start the backend only (supervisor + agent processes + Code-Lens). Runs in the foreground, logging major events to stdout.

```
jie start [--json]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `--json` | false | Output JSONL instead of human-readable log lines. |

### Behavior

1. Load config. Connectivity checks for `nats_url` and `code_lens_url`. Fail → exit 2.
2. Check `.jie/supervisor.pid`:
   - **Live supervisor at PID** → exit 1, message: `"team already running (pid {n})"`.
   - **No PID file or stale PID file** → remove stale file if present, proceed.
3. Write supervisor PID to `.jie/supervisor.pid`.
4. Spawn the supervisor process as a child. The supervisor spawns agent bodies and Code-Lens (per `13-deployment.md`).
5. The `jie start` process blocks until the supervisor exits, forwarding SIGINT/SIGTERM to the supervisor.
6. While running, subscribe to `session.*.task.>` on NATS and log major task lifecycle events to stdout.

### Event Logging

`jie start` subscribes to `session.*.task.>` and logs the following events:

| Event | Logged fields |
|---|---|
| `task.recorded` | `task_id`, `session_id` |
| `task.researched` | `task_id` |
| `task.designed` | `task_id`, `descriptor_paths` (if available) |
| `task.planned` | `task_id` |
| `task.implemented` | `task_id` |
| `task.review_passed` | `task_id` |
| `task.review_failed` | `task_id`, `feedback` (summary) |
| `task.done` | `task_id` |
| `task.failed` | `task_id`, `error` |
| `task.rejected` | `reason` |

### Output Formats

**Human-readable (default):**
```
[10:30:00] task.recorded       task: PROJ-123  session: a1b2c3d4e5f67890
[10:30:05] task.researched     task: PROJ-123
[10:30:20] task.designed       task: PROJ-123  descriptors: src/foo/CONTEXT.md
[10:30:30] task.planned        task: PROJ-123
[10:30:40] task.implemented    task: PROJ-123
[10:30:50] task.review_passed  task: PROJ-123
[10:31:00] task.done           task: PROJ-123
```

**JSONL (`--json`):**
```json
{"timestamp":"2026-05-27T10:30:00Z","event":"task.recorded","task_id":"PROJ-123","session_id":"a1b2c3d4e5f67890"}
{"timestamp":"2026-05-27T10:30:05Z","event":"task.researched","task_id":"PROJ-123"}
{"timestamp":"2026-05-27T10:31:00Z","event":"task.done","task_id":"PROJ-123"}
```

### Errors

- Config not found → exit 1.
- NATS unreachable → exit 2.
- Code-Lens unreachable → exit 2.
- Supervisor already running → exit 1.
- `.jie/` not writable → exit 1.

---

## `jie ui`

Launch the TUI only. Connects to a running backend.

```
jie ui
```

### Behavior

1. Load config.
2. Launch the TUI process.
3. Block until TUI exits.
4. If no supervisor is running (`.jie/supervisor.pid` missing or stale), the TUI displays a disconnected state — no barrier exit.

### Errors

- Config not found → exit 1.

---

## `jie prompt <text>`

Send text to the DM agent and wait for a response. The DM interprets the content — it may be a task request, a status query, or any other instruction.

```
jie prompt <text> [--timeout <seconds>] [--json]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<text>` | (required) | Free-form text sent to the DM. |
| `--timeout <s>` | 300 | Max seconds to wait for DM response. 0 = no timeout. |
| `--json` | false | Output response as JSONL instead of human-readable. |

### Behavior

1. Load config. Connect to NATS.
2. Generate a `reply_id` (8 hex chars from random uint32).
3. Subscribe to `team.{team_id}.response.{reply_id}`.
4. Publish a `PromptMessage` to `team.{team_id}.prompt` with `reply_id` in the envelope.
5. Wait for a `PromptResponse` on `team.{team_id}.response.{reply_id}`.
6. On response received → if `error` is set, output it to stderr and exit 1. Otherwise output `content` to stdout, exit 0.
7. On timeout → exit 3, message: `"no response from DM within {timeout}s"`.

### PromptResponse Envelope

```typescript
interface PromptResponse {
  reply_id: string;
  content: string;      // the DM's response text
  error?: string;        // set if the DM could not process the prompt
  timestamp: string;     // ISO 8601
}
```

### Output Formats

**Human-readable (default):** the `content` string as-is.

**JSONL (`--json`):** one line containing the raw `PromptResponse` envelope.

### Errors

- NATS unreachable → exit 2.
- Timeout → exit 3.
- DM returned error → exit 1 with message from DM.

---

## `jie doctor`

Show the team's status: supervisor health and per-agent status.

```
jie doctor [--json]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `--json` | false | Output JSONL. |

### Behavior

1. Load config. Connect to NATS.
2. Subscribe to `supervisor.{team_id}.heartbeat` and `agent.{team_id}.>.heartbeat`.
3. Wait up to 2 seconds to collect heartbeats.
4. Output a summary of all agents and the supervisor.

Heartbeat subjects, envelopes, intervals, and status definitions are defined in `15-monitoring.md`.

### Output Formats

**Human-readable (default):**
```
supervisor: running (pid 12345, uptime 3h24m, 5 agents)

researcher    idle
architect     busy     task: PROJ-123
planner       idle
implementer   busy     task: PROJ-123
reviewer      idle
dm            busy     task: PROJ-123
```

**JSONL (`--json`):**
```json
{"type":"supervisor","pid":12345,"uptime_seconds":12240,"agent_count":5}
{"type":"agent","agent_id":"...","role":"researcher","status":"idle"}
{"type":"agent","agent_id":"...","role":"architect","status":"busy","current_task_id":"PROJ-123","uptime_seconds":11900}
```

### Errors

- NATS unreachable → exit 2.
- No supervisor heartbeat within 2s → exit 1, message: `"no supervisor heartbeat (team not running?)"`.

---

## `jie query-task`

Read and display task status from the artifact store.

```
jie query-task [task_id] [--json] [--limit <n>]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `[task_id]` | (absent) | A specific task to show. If absent, list all tasks. |
| `--json` | false | Output JSONL. |
| `--limit <n>` | 20 | Max tasks to list when `task_id` is absent. |

### Behavior (no `task_id` — list mode)

1. Load config. Open artifact store at `{workspace_root}/.jie/artifacts.db`.
2. Query all distinct `task_id` values from `task_status`, ordered by latest `updated_at` descending, limited to `--limit`.
3. For each task, output the latest row: `task_id`, `phase`, `iteration`, `updated_at`.
4. Deleted tasks (status `done` or purged) are excluded.

### Behavior (with `task_id`)

1. Load config. Open artifact store.
2. Query all `task_status` rows for `task_id`, ordered by `created_at` ascending.
3. Output the full chain: an initial state row plus all phase transitions.

### Output Formats

**List mode, human-readable:**
```
PROJ-123    review_passed    3    2026-05-27T10:35:00Z
PROJ-456    failed           1    2026-05-27T09:00:00Z
prompt-ab12c3d4    planned    2    2026-05-26T18:00:00Z
```

**Single task, human-readable:**
```
task: PROJ-123    phase: review_passed    iteration: 3    updated: 2026-05-27T10:35:00Z

  recorded        iter=1    2026-05-27T10:30:00Z
  researched      iter=1    2026-05-27T10:31:00Z
  designed        iter=1    2026-05-27T10:32:00Z
  planned         iter=2    2026-05-27T10:33:00Z
  implemented     iter=2    2026-05-27T10:34:00Z
  review_failed   iter=2    2026-05-27T10:34:30Z
  planned         iter=3    2026-05-27T10:34:40Z
  implemented     iter=3    2026-05-27T10:35:00Z
  review_passed   iter=3    2026-05-27T10:35:00Z
```

**JSONL (`--json`):** one JSON object per output line.

```json
{"task_id":"PROJ-123","phase":"review_passed","iteration":3,"updated_at":"2026-05-27T10:35:00Z"}
```

For a single task, one object per status row.

### Errors

- Artifact store not found / locked → exit 2.
- `task_id` not found → exit 1, message: `"task not found: {task_id}"`.

---

## `jie stop`

Stop a running team by signaling the supervisor.

```
jie stop [--timeout <seconds>]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `--timeout <s>` | 10 | Seconds to wait for graceful shutdown before force-kill. |

### Behavior

1. Load config.
2. Read `.jie/supervisor.pid`.
3. Send SIGTERM to the supervisor PID.
4. Wait up to `--timeout` seconds for the process to exit.
5. If the supervisor exits within timeout → remove `.jie/supervisor.pid`, exit 0. Output: `"team stopped"` to stderr.
6. If timeout expires → send SIGKILL, remove `.jie/supervisor.pid`, exit 0. Output: `"team killed after timeout"` to stderr.

### Errors

- `.jie/supervisor.pid` not found → exit 1, message: `"no running team (supervisor.pid not found)"`.
- PID file exists but process not running → exit 1, message: `"stale pid file (process not found)"`. Remove the stale pid file.

---

## Cross-References

- `02-protocol-stack.md` — Prompt Ingress subjects, transport
- `03-event-system.md` — prompt subject schema, durability, envelope format
- `11-ui/messaging-protocol.md` — `PromptMessage` envelope format, DM request-response correlation
- `15-monitoring.md` — agent and supervisor heartbeat subjects, envelopes, status definitions
- `14-configuration.md` — config discovery, `.jie/config.yaml` format
- `13-deployment.md` — supervisor process model, `.jie/` layout
- `04-artifact-store.md` — SQLite schema for `task_status`, read path
