# CLI

Headless command-line interface for publishing prompts, observing team state, and managing the team lifecycle. Part of the UI family alongside the TUI (`tui.md`).

## Config Discovery

All commands resolve configuration by walking up from CWD to find `.jie/config.yaml`. If not found, the CLI enters an interactive init flow (see below) and writes a minimal config before proceeding with the original command.

Config is loaded once at invocation. Changes to config while a command is running are not observed.

### Interactive Init

When no `.jie/config.yaml` is found, the CLI prompts the user:

1. **`team_id`** — default `"default"`. Accepts any string matching `[A-Za-z0-9_-]{1,32}`.
2. **`workspace_root`** — default `"."`. Accepts any valid relative or absolute path.
3. **NATS probe.** CLI attempts a connectivity check to `nats://localhost:4222`. If unreachable:
   - Prompts for `nats_url` — accepts any valid `nats://` or `tls://` URL.
   - If reachable, `nats_url` defaults to `"nats://localhost:4222"` without asking.
4. `code_lens_url` is supervisor-managed — not prompted. Supervisor auto-picks a free port on first boot (see `10-configuration.md`).

The CLI writes `.jie/config.yaml` and proceeds with the original command.

## Global Flags

| Flag | Behavior |
|---|---|
| `--json` | Machine-readable output. One JSON object per line (JSONL). Available on `start`, `doctor`, `query-task`, and `prompt`. |

Global flags must appear before the subcommand.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success. |
| 1 | Usage error (bad args, team already running, init cancelled by user). |
| 2 | Infrastructure error (NATS unreachable, artifact store locked, Code-Lens unreachable, connection lost). |
| 3 | Timeout (prompt response timed out, graceful stop timed out). |

## NATS Connectivity Pre-Check

Before executing any command that requires NATS (`jie`, `jie start`, `jie ui`, `jie prompt`, `jie doctor`), the CLI connects to `nats_url` from config. If unreachable:

- Prints: `Error: NATS is not reachable at <nats_url>. Ensure nats-server is running.`
- Suggests: `Run 'nats-server -js &' to start it.`
- Exits with code 2.

Commands that do not require NATS (`--version`, `--help`) skip this check.

---

## `jie`

Start the full team (backend + TUI).

```
jie
```

### Behavior

1. Load config (or init if missing). Run NATS connectivity pre-check. If `code_lens_url` fails a connectivity check, exit code 2.
2. Check `.jie/supervisor.pid`:
   - **No PID file, or PID file exists but process is dead**: start the backend (supervisor + agents + Code-Lens) as described in `jie start`. Then launch the TUI process. The `jie` process tracks that it owns the backend and forwards SIGINT/SIGTERM to both children. When the TUI exits, `jie` stops the backend and exits.
   - **Live supervisor at PID**: do not start the backend. Launch the TUI only. `jie` does not own the backend; on exit, only the TUI is stopped. The backend continues running.
3. If `.jie/` directory is not writable → exit 1, message: `"cannot write to .jie/: {reason}"`.

### Errors

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

1. Load config (or init if missing). Run NATS connectivity pre-check. Connectivity check for `code_lens_url`. Fail → exit 2.
2. Check `.jie/supervisor.pid`:
   - **Live supervisor at PID** → exit 1, message: `"team already running (pid {n})"`.
   - **No PID file or stale PID file** → remove stale file if present, proceed.
3. Write supervisor PID to `.jie/supervisor.pid`.
4. Spawn the supervisor process as a child. The supervisor spawns agent bodies and Code-Lens (per `09-deployment.md`).
5. The `jie start` process blocks until the supervisor exits, forwarding SIGINT/SIGTERM to the supervisor.
6. While running, subscribe to domain events on NATS and log major lifecycle events to stdout. The exact events logged are derived from the team blueprint.

### Output Formats

**Human-readable (default):** timestamp-prefixed log lines with event type and key fields.

**JSONL (`--json`):** one JSON object per line with `timestamp`, `event`, and event-specific fields.

### Errors

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

- NATS unreachable → exit 2.

---

## `jie prompt <text>`

Send text to the leader agent and wait for a response.

```
jie prompt <text> [--timeout <seconds>] [--json]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<text>` | (required) | Free-form text sent to the leader. |
| `--timeout <s>` | 300 | Max seconds to wait for response. 0 = no timeout. |
| `--json` | false | Output response as JSONL instead of human-readable. |

### Behavior

1. Load config. Connect to NATS.
2. Generate a `reply_id` (8 hex chars from random uint32).
3. Subscribe to `team.{team_id}.response.{reply_id}`.
4. Publish a `PromptMessage` to `team.{team_id}.prompt` with `reply_id` in the envelope.
5. Wait for a `PromptResponse` on `team.{team_id}.response.{reply_id}`.
6. On response received → if `error` is set, output it to stderr and exit 1. Otherwise output `content` to stdout, exit 0.
7. On timeout → exit 3, message: `"no response from leader within {timeout}s"`.

### Output Formats

**Human-readable (default):** the `content` string as-is.

**JSONL (`--json`):** one line containing the raw `PromptResponse` envelope.

### Errors

- NATS unreachable → exit 2.
- Timeout → exit 3.
- Leader returned error → exit 1.

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

Heartbeat subjects, envelopes, intervals, and status definitions are defined in `11-monitoring.md`.

### Output Formats

**Human-readable (default):** supervisor line + one line per agent with role and status.

**JSONL (`--json`):** one JSON object per line.

### Errors

- NATS unreachable → exit 2.
- No supervisor heartbeat within 2s → exit 1, message: `"no supervisor heartbeat (team not running?)"`.

---

## `jie query-task`

Read and display work-unit status from the artifact store.

```
jie query-task [work_id] [--json] [--limit <n>]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `[work_id]` | (absent) | A specific work unit to show. If absent, list all. |
| `--json` | false | Output JSONL. |
| `--limit <n>` | 20 | Max work units to list when `work_id` is absent. |

### Behavior (no `work_id` — list mode)

1. Load config. Open artifact store at `{workspace_root}/.jie/artifacts.db`.
2. Query all distinct `work_id` values from status records, ordered by latest `updated_at` descending, limited to `--limit`.
3. For each work unit, output the latest row.

### Behavior (with `work_id`)

1. Load config. Open artifact store.
2. Query all status rows for `work_id`, ordered by `created_at` ascending.
3. Output the full chain.

### Errors

- Artifact store not found / locked → exit 2.
- `work_id` not found → exit 1.

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
5. If the supervisor exits within timeout → remove `.jie/supervisor.pid`, exit 0.
6. If timeout expires → send SIGKILL, remove `.jie/supervisor.pid`, exit 0.

### Errors

- `.jie/supervisor.pid` not found → exit 1.
- PID file exists but process not running → exit 1. Remove the stale pid file.
