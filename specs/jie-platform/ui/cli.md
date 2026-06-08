# CLI

The `jie` binary is the single entry point for all user interaction. It runs as one OS process hosting all agents, the EventBus, and optionally the TUI.

## Config Discovery

All commands resolve configuration by walking up from CWD to find `.jie/`, then loading `.jie/settings.json` (if present) and deep-merging it with `~/.jie/settings.json`. If no settings file is found, the platform runs with empty settings — no interactive init flow. To customize provider, model, or team selection at the project level, create `.jie/settings.json` manually. See `10-configuration.md` and `12-installation.md`.

## `jie`

Launch the full team with interactive TUI.

```
jie [--team <id>]
```

**Behavior:**
1. Walk up from CWD to find `.jie/`. Load `.jie/settings.json` if present; deep-merge with `~/.jie/settings.json`. If absent, the platform still proceeds — the model pre-check in step 6 will fail with a clear pointer to `jie model` if any agent has no explicit `model:`.
2. Validate `settings.json`. On error → exit 1.
3. Resolve team:
   - If `--team <id>` is given → use `<id>`; hard fail if not installed.
   - Else read `defaultTeam` from merged settings → use it; if stale (not installed), WARN and reset to first-available user team, or clear and fall back to the built-in minimal team if no user teams exist.
   - Else pick first-available user team alphabetically across `.jie/teams/*` and `~/.jie/teams/*`.
   - Else use the platform's built-in minimal team (`packages/jie-platform/team/built-in/minimal-team.ts`, see `minimal-team.md`). The platform always has a runnable team.
4. Open `ArtifactStore` (SQLite at `{cwd}/.jie/artifacts.db`). On failure → exit 1.
5. **Model pre-check**: walk every agent in the blueprint and resolve `(provider, modelId)`. If any agent fails (no `model:` in its `.md`, and the merged `settings.json` does not provide a resolvable default), startup exits 1 with one error listing every unresolved agent.
6. Connect MCP servers. Per-server failures log WARN and skip; if a team's blueprint depends on a missing tool, the team fails to start.
7. Instantiate and start `AgentBody` for each role.
8. Import `jie-tui`, pass `EventBus` + `ArtifactStore`, start TUI.
9. TUI is the main event loop — renders agent streams, tool calls, pipeline events. User prompts are published to `leader.prompt` via the EventBus.
10. Block until TUI exits or SIGINT. Graceful shutdown (10s bounded).

**Exit codes:** 0 (normal exit), 1 (config error, team not found, model pre-check failure, agent load failure).

---

## `jie -p <instruction>`

One-shot print mode. Start the team, process the instruction, print the leader's response, and exit. No TUI.

```
jie -p <instruction> [--team <id>] [--timeout <seconds>] [--json]
jie --print <instruction> [--team <id>] [--timeout <seconds>] [--json]
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<instruction>` | (required) | Free-form text sent to the leader agent. |
| `-p`, `--print` | — | Enable print mode. |
| `--team <id>` | (merged settings `defaultTeam`) | One-shot team override. Hard fail if `<id>` is not installed. |
| `--timeout <s>` | 300 | Max seconds to wait for response. 0 = no timeout. |
| `--json` | false | Output response as JSONL. |

### Behavior

1. Walk up from CWD to find `.jie/`. Load `.jie/settings.json` if present; deep-merge with `~/.jie/settings.json`.
2. Validate `settings.json`. Resolve team (applying `--team <id>` override if given). Open `ArtifactStore` at `{cwd}/.jie/artifacts.db`. Connect MCP servers. (Same as `jie` steps 2–6, including the model pre-check.)
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

**Errors:** timeout → exit 3, config error → exit 1, team not found → exit 1, `--team <id>` not installed → exit 1.

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

Prints usage summary, subcommands (`-p`, `--print`, `login`, `logout`, `model`, `team`, `--resume`, `--continue`, `--version`, `--help`), exits 0. Does not load config.

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
- The command does not start the team, does not load `.jie/settings.json`, and does not touch `auth.json`.

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

The command does not start the team, does not load `.jie/settings.json`, and does not touch `auth.json`. Project-level overrides (`.jie/settings.json`) are not written by `jie model`; users edit that file directly.

**Exit codes:** 0 (success), 1 (malformed argument, unknown provider, write error).

## `jie team`

Manage the `defaultTeam` setting. Writes to settings.json.

```
jie team <id>          # set defaultTeam to <id> (scope-aware); takes effect on next `jie` invocation
jie team               # print current defaultTeam and installed teams
jie team --unset       # clear defaultTeam (scope-aware); takes effect on next `jie` invocation
```

### Arguments

| Flag | Default | Behavior |
|---|---|---|
| `<id>` | (required unless `--unset`) | Team id to select. Charset `[A-Za-z0-9_-]{1,32}`. |
| `--unset` | — | Clear `defaultTeam` from settings. |

### Behavior — `jie team <id>`

1. Validate `<id>` matches `[A-Za-z0-9_-]{1,32}`. On error → exit 1.
2. Check if `.jie/teams/<id>/` exists (project-local, walking up from CWD to find `.jie/`). If yes → write `defaultTeam: <id>` to `.jie/settings.json` (creating it if absent; preserving other keys).
3. Else check if `~/.jie/teams/<id>/` exists. If yes → write `defaultTeam: <id>` to `~/.jie/settings.json`.
4. Else → exit 1: `team '<id>' is not installed; checked .jie/teams/<id>/ and ~/.jie/teams/<id>/`.
5. Print `default team set to <id>` and exit 0.

The command does not start the team. The change takes effect on next `jie` invocation. In a running TUI session, `/team <id>` (the TUI counterpart) hot-swaps the team in-session — see `10-configuration.md` "Team Swap".

### Behavior — `jie team` (no arg)

1. Read merged `settings.json`. Print `defaultTeam: <id>` (or `defaultTeam: <unset>`).
2. Scan `.jie/teams/*` and `~/.jie/teams/*`; list installed team ids (deduped, alphabetical).
3. Exit 0.

### Behavior — `jie team --unset`

1. Determine scope: `.jie/settings.json` if it exists, else `~/.jie/settings.json`.
2. Clear `defaultTeam` field (write back without it).
3. Print `default team unset` and exit 0.

Takes effect on next `jie` invocation. Mid-session clearing in the TUI is not supported — clearing `defaultTeam` while a team is running would leave the running team nameless; restart `jie` to land on first-available.

**Exit codes:** 0 (success or no-op), 1 (invalid id, team not installed, write error).

## `jie --api-key <key>`

One-shot API key override. Applies to the next `jie` or `jie -p` invocation in the same process tree (sets the value for the `getApiKey` callback pi-agent-core uses, ahead of `auth.json` and env vars).

```
jie --api-key sk-ant-... -p "instruction"
ANTHROPIC_API_KEY=sk-ant-... jie --api-key sk-ant-...    # --api-key wins
```

The flag does not write to `auth.json` — it is a per-invocation override. Useful for CI / ad-hoc rotation without touching the user's saved credentials.

## `jie --resume [<session_id>]` / `jie --continue`

Continue a previous session. The `session_id` is passed to every `AgentBody` at construction, overriding the default "mint a new `session_id`" behavior (`08-memory.md`). The body calls `memory.restore(agent_key, session_id)` and resumes from the prior `memory_turns` rows.

```
jie --resume <session_id>        # resume a specific session
jie --continue                    # resume the most recent session for the current CWD
```

### Behavior

- **`--resume <session_id>`**: load the named `session_id`. Validation: it must exist in `memory_turns` (i.e. some prior `persist()` call wrote rows under it). If not, exit 1: `unknown session_id: <value>`.
- **`--continue`**: pick the most recent `session_id` (highest `created_at`) that has rows in `memory_turns` for the current CWD's `ArtifactStore` (or globally, if no CWD-scoped sessions). If no prior session exists, exit 1: `no prior session to continue`.

The TUI does not have a slash-command equivalent: opening `jie` (without `--resume`/`--continue`) starts a new session. The TUI's team-swap behavior preserves conversation history mid-session without these flags (see `10-configuration.md` "Team Swap"); `--resume`/`--continue` are for cross-process-run continuation.

**Exit codes:** 0 (success), 1 (unknown session_id, no prior session, `memory_turns` read error).

