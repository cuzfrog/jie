# CLI

The `jie` binary is the single entry point for all user interaction. It runs as one OS process hosting all agents, the EventBus, and optionally the TUI.

## Config Discovery

All commands resolve configuration by walking up from CWD to find `.jie/config.yaml`. **If not found, the platform runs with all defaults** — no interactive init flow. The built-in minimal team is used (reached only by omitting `team_id` from config). To customize, create `.jie/config.yaml` manually. See `10-configuration.md` and `12-installation.md`.

## `jie`

Launch the full team with interactive TUI.

```
jie
```

**Behavior:**
1. Walk up to find `.jie/config.yaml`. If absent, use defaults (built-in minimal team).
2. Load merged `settings.json` (global `~/.jie/settings.json` deep-merged with project `.jie/settings.json`). If absent, the platform still proceeds — the model pre-check in step 6 will fail with a clear pointer to `jie model` if any agent has no explicit `model:`.
3. Validate `config.yaml` (if present) and `settings.json`. On error → exit 1.
4. Resolve team: `.jie/teams/<team_id>/` → `~/.jie/teams/<team_id>/` → built-in default. If `team_id` is set but no manifest found → exit 1.
5. Open `ArtifactStore` (SQLite). On failure → exit 1.
6. **Model pre-check**: walk every agent in the blueprint and resolve `(provider, modelId)`. If any agent fails (no `model:` in its `.md`, and the merged `settings.json` does not provide a resolvable default), startup exits 1 with one error listing every unresolved agent.
7. Connect MCP servers. Per-server failures log WARN and skip; if a team's blueprint depends on a missing tool, the team fails to start.
8. Instantiate and start `AgentBody` for each role.
9. Import `jie-tui`, pass `EventBus` + `ArtifactStore`, start TUI.
10. TUI is the main event loop — renders agent streams, tool calls, pipeline events. User prompts are published to `leader.prompt` via the EventBus.
11. Block until TUI exits or SIGINT. Graceful shutdown (10s bounded).

**Exit codes:** 0 (normal exit), 1 (config error, team not found, model pre-check failure, agent load failure).

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

1. Walk up to find `.jie/config.yaml`. If absent, use defaults (built-in minimal team).
2. Load merged `settings.json`. Validate `config.yaml` and `settings.json`. Resolve team. Open `ArtifactStore`. Connect MCP servers. (Same as `jie` steps 2–5, including the model pre-check.)
3. Instantiate and start `AgentBody` for each role.
4. Subscribe to `agent.stream.chunk` events; filter for `agent_role === leader`.
5. Publish `{ prompt: "<instruction>" }` to `leader.prompt`.
6. Print each stream chunk from the leader to stdout as it arrives.
7. Wait for leader `agent.idle` event.
8. Print final newline, stop all agents, close DB, exit 0.
9. On timeout → stop agents, exit 3, message to stderr: `"no response from leader within {timeout}s"`.

### Output Formats

**Human-readable (default):** stream chunks printed as-is, concatenated.

**JSONL (`--json`):** one JSON object per line per stream chunk: `{ "chunk": string, "seq": number }`.

**Errors:** timeout → exit 3, config error → exit 1, team not found → exit 1.

---

## `jie --version`

```
jie --version
```

Prints `jie <version>` to stdout, exits 0. Does not load config.

### Version Source

The CLI reads its version from the umbrella `@cuzfrog/jie` package's `package.json` at startup. Because the monorepo has zero build step (`monorepo-structure.md`), there is no compile-time injection — the value is fetched at runtime.

**Resolution algorithm** (in `packages/jie-cli/version.ts`):

1. Start at `import.meta.dirname` (the directory containing `packages/jie-cli/index.ts`).
2. Walk up the parent chain. At each level, try to read `package.json`.
3. Return the first `package.json` whose `name` equals `"@cuzfrog/jie"` — that's the umbrella.
4. Use `pkg.version` as `VERSION`.
5. If no matching package.json is found, fall back to `"0.0.0-dev"` (defensive — should not happen in normal installs).

This mirrors pi's `getPackageDir()` / `VERSION` pattern (`@earendil-works/pi-coding-agent/src/config.ts`).

**Why walk up rather than `import ... with { type: "json" }`:** A direct JSON import is resolved relative to the CLI file. In dev (monorepo layout), the umbrella is `../../package.json`. After `bun install -g` (Day 2 publish), bun flattens dependencies and the relative path breaks. The walk-up algorithm handles both layouts.

## `jie --help`

```
jie --help
```

Prints usage summary, subcommands (`-p`, `--print`, `login`, `logout`, `model`, `team install`, `--version`, `--help`), exits 0. Does not load config.

---

## `jie login`

Configure provider credentials. Writes to `~/.jie/auth.json` (mode `0600`).

```
jie login                                        # interactive: pick provider, then OAuth or paste API key
jie login --provider <id> --api-key <key>        # headless: write a single API key entry
```

### Behavior

- With no flags, the CLI lists known providers and prompts for one. For OAuth-capable providers (anthropic, openai-codex, github-copilot) the CLI launches a browser-based auth flow; for API-key providers it prompts for the key (input hidden).
- With `--provider` and `--api-key`, the CLI writes the entry non-interactively. Useful for CI / scripted setup.
- On success, prints `logged in to <provider>` to stdout and exits 0. On user cancellation, exits 0 with no write. On validation error, exits 1.
- The command does not start the team, does not load `.jie/config.yaml`, and does not touch `settings.json`.

**Exit codes:** 0 (success or cancel), 1 (unknown provider, invalid API key format, write error).

## `jie logout [<provider>]`

Clear provider credentials from `~/.jie/auth.json`.

```
jie logout                # clear all entries
jie logout anthropic      # clear only the anthropic entry
```

### Behavior

- With no argument, the CLI lists current `auth.json` entries and asks for confirmation before clearing all.
- With a provider argument, the CLI removes that provider's entry and exits.
- On success, prints `logged out of <provider>` (or `logged out of all providers`) and exits 0.
- The command does not start the team. The next `jie` run after a logout may fail at LLM-call time if no other credential source covers the resolved provider.

**Exit codes:** 0 (success or nothing-to-do), 1 (read error).

## `jie model <provider>/<modelId>`

Set the global default model. Writes to `~/.jie/settings.json` (not the project file — project overrides go in `.jie/settings.json` by hand).

```
jie model anthropic/claude-sonnet-4-20250514
jie model openai/gpt-4o
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<provider>/<modelId>` | (required) | Single string, slash-separated. Splits on the first `/`; the model id may itself contain `/` (e.g. `openrouter/anthropic/claude-sonnet-4`). |

### Behavior

1. Parse the argument: split on the first `/`. Both pieces must be non-empty.
2. Validate that `<provider>` is a known `KnownProvider` (or accept and warn for unknown — same policy as `settings.json` reading).
3. Read the current `~/.jie/settings.json` (if any), set `defaultProvider` and `defaultModel`, deep-merge if other settings are present, write back with mode `0644`.
4. Print `default model set to <provider>/<modelId>` and exit 0.

The command does not start the team, does not load `.jie/config.yaml`, and does not touch `auth.json`. Project-level overrides (`.jie/settings.json`) are not written by `jie model`; users edit that file directly.

**Exit codes:** 0 (success), 1 (malformed argument, unknown provider, write error).

## `jie --api-key <key>`

One-shot API key override. Applies to the next `jie` or `jie -p` invocation in the same process tree (sets the value for the `getApiKey` callback pi-agent-core uses, ahead of `auth.json` and env vars).

```
jie --api-key sk-ant-... -p "instruction"
ANTHROPIC_API_KEY=sk-ant-... jie --api-key sk-ant-...    # --api-key wins
```

The flag does not write to `auth.json` — it is a per-invocation override. Useful for CI / ad-hoc rotation without touching the user's saved credentials.

## `jie team install [<id>]`

Install one or all bundled team manifests from the `jie-team` package to a teams directory. The platform reads team manifests from the standard paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`); this command is the manual entry point for jie-team's install logic. The same logic runs automatically on `bun install` via jie-team's `postinstall` script (see ADR 12).

```
jie team install                       # install all bundled teams (minimal, dev) to ~/.jie/teams/
jie team install minimal               # install only the minimal team
jie team install dev --scope project   # install the dev team to .jie/teams/ in the current project
jie team install dev --force           # overwrite existing files at the destination
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<id>` | *(absent — install all bundled teams)* | Team identifier. Must be one of the bundled teams (`minimal`, `dev`) in v1. |
| `--scope user` | yes (default) | Install to `~/.jie/teams/<id>/`. |
| `--scope project` | | Install to `.jie/teams/<id>/` relative to CWD. The directory is created if it does not exist. |
| `--force` | | Overwrite files that already exist at the destination. Default: skip on conflict to preserve user customizations. |

### Behavior

1. Read the source manifest directory from the `jie-team` package (located via `import.meta.resolve("@cuzfrog/jie-team/package.json")`).
2. For each `<role>.md` and `TEAM.md` in the source directory, copy to the destination (default: `~/.jie/teams/<id>/`).
3. Skip files that exist at the destination unless `--force` is set.
4. Print the destination path and copied/skipped file counts; exit 0.

The command does not start the team, does not load `.jie/config.yaml`, and does not touch `auth.json` or `settings.json`. It is the same logic that runs at jie-team's `postinstall`; running it manually is a no-op if the destination is already populated.

**Exit codes:** 0 (success or no-op), 1 (unknown team id, source manifest missing, copy error).
