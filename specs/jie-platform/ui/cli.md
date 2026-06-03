# CLI

The `jie` binary is the single entry point for all user interaction. It runs as one OS process hosting all agents, the EventBus, and optionally the TUI.

## Config Discovery

All commands resolve configuration by walking up from CWD to find `.jie/config.yaml`. If not found, the CLI enters an interactive init flow and writes a minimal config before proceeding.

### Interactive Init

1. **`team_id`** — default `"default"`. Accepts `[A-Za-z0-9_-]{1,32}`.
2. **`workspace_root`** — default `"."`. Accepts any valid relative or absolute path.

The CLI writes `.jie/config.yaml` and proceeds.

## `jie`

Launch the full team with interactive TUI.

```
jie
```

**Behavior:**
1. Walk up to find `.jie/config.yaml` (or init).
2. Load team blueprint from `team_path` (or built-in fallback from `jie-team`).
3. Instantiate `InProcessEventBus`, `ArtifactStore` (SQLite), MCP servers.
4. Instantiate and start `AgentBody` for each role.
5. Import `jie-tui`, pass `EventBus` + `ArtifactStore`, start TUI.
6. TUI is the main event loop — renders agent streams, tool calls, pipeline events. User prompts are published to `leader.prompt` via the EventBus.
7. Block until TUI exits or SIGINT. Graceful shutdown on exit.

**Exit codes:** 0 (normal exit), 1 (config error, init cancelled).

---

## `jie -p <instruction>`

One-shot print mode. Start the team, process the instruction, print the leader's response, and exit. No TUI.

```
jie -p <instruction> [--timeout <seconds>] [--json]
jie --print <instruction> [--timeout <seconds>] [--json]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<instruction>` | (required) | Free-form text sent to the leader agent. |
| `-p`, `--print` | — | Enable print mode. |
| `--timeout <s>` | 300 | Max seconds to wait for response. 0 = no timeout. |
| `--json` | false | Output response as JSONL. |

### Behavior

1. Walk up to find `.jie/config.yaml` (or init).
2. Load team blueprint. Instantiate EventBus, ArtifactStore, MCP servers.
3. Instantiate and start `AgentBody` for each role.
4. Subscribe to `agent.stream.chunk` events; filter for `agent_role === leader`.
5. Publish `{ prompt: "<instruction>" }` to `leader.prompt`.
6. Print each stream chunk from the leader to stdout as it arrives.
7. Wait for leader `agent.idle` event and exit.
8. Print final newline, stop all agents, close DB, exit 0.
9. On timeout → stop agents, exit 3, message to stderr: `"no response from leader within {timeout}s"`.

### Output Formats

**Human-readable (default):** stream chunks printed as-is, concatenated.

**JSONL (`--json`):** one JSON object per line per stream chunk: `{ "chunk": string, "seq": number }`.

**Errors:** timeout → exit 3, config error → exit 1.

---

## `jie --version`

```
jie --version
```

Prints `jie <version>` to stdout, exits 0. Does not load config.

## `jie --help`

```
jie --help
```

Prints usage summary, subcommands (`-p`, `--print`, `--version`, `--help`), exits 0. Does not load config.
