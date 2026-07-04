# CLI

The `jie` binary is the single entry point for all user interaction. It runs as one OS process hosting all agents, the EventBus, and optionally the TUI.

## Flag Parsing Rules

The hand-rolled CLI parser applies these rules uniformly to every flag across `jie`, `jie -p`, `jie login`, `jie logout`, `jie model`, `jie team`:

- **Duplicate flag is an error.** If the same flag appears more than once on the command line (e.g. `jie -p "..." --team alpha --team beta`, or `jie --api-key k1 --api-key k2`), the CLI exits 1 with `duplicate flag: --<flag>` and does not start the team. The user fixes the command line and re-runs. The "last one wins" shell convention is **not** used; the CLI surfaces the duplicate rather than silently picking one. This applies to every flag — including `--team`, `--api-key`, `--timeout`, `--json`, `--resume`, and the subcommand flags.
- **Missing required argument is an error.** If a flag that requires an argument (e.g. `--team <id>`, `--api-key <key>`, `--resume <session_id>`, `--model <provider>/<modelId>`) is given without the argument, the CLI exits 1 with `missing argument for --<flag>`.
- **Flag ordering is normalized before any side effect.** The CLI parses all flags into a normalized record before executing any side-effecting step. `--api-key <key>` writes `auth.json` before the rest of the flow runs, regardless of position on the command line. `jie -p "..." --api-key <key>` and `jie --api-key <key> -p "..."` behave identically: the API key is in `auth.json` before `-p` resolves the model and starts the LLM call. This is a hard rule — without it, `-p` would race against the just-written credential.

## Config Discovery

All commands resolve configuration by walking up from CWD to find `.jie/`, then loading `.jie/settings.json` (if present) and deep-merging it with `~/.jie/settings.json`. If no settings file is found, the platform runs with empty settings — no interactive init flow. To customize provider, model, or team selection at the project level, create `.jie/settings.json` manually. See `10-configuration.md` and `12-installation.md`.

## `jie`

Launch the full team with interactive TUI.

```
jie [--team <id>]
```

**Behavior:**
1. Walk up from CWD to find `.jie/`. Load `.jie/settings.json` if present; deep-merge with `~/.jie/settings.json`. If absent, the platform still proceeds — model resolution falls through to the per-team `system.error` event during `handle.start()` (see `06-agent-model.md` "Team Loading").
2. Validate `settings.json`. On error → exit 1.
3. Resolve team:
   - If `--team <id>` is given → use `<id>`; hard fail if not installed.
   - Else read `defaultTeam` from merged settings → use it; if stale (not installed), WARN and reset to first-available user team, or clear and fall back to the built-in minimal team if no user teams exist.
   - Else pick first-available user team alphabetically across `.jie/teams/*` and `~/.jie/teams/*`.
   - Else use the platform's built-in minimal team (`packages/jie-platform/team/built-in/minimal-team.ts`, see `minimal-team.md`). The platform always has a runnable team.
4. Open `ArtifactStore` (SQLite at the `.jie/storage.db` discovered by walking up from CWD — same walk as settings/team lookup per `10-configuration.md` "Discovery"; create `.jie/` at the walk's root if absent). On failure → exit 1.
5. `createJiePlatform` returns the handle. The CLI subscribes to `system.error` (which surfaces per-team load failures during `start()`), then `await handle.start()` triggers `TeamManager.loadAll()`. Teams whose souls fail to resolve publish `system.error` and are omitted from `handle.teams`; the CLI's `resolveTeam` falls back to `"minimal"` if the requested id is missing. The CLI does **not** fail-fast on missing models — it WARNs and proceeds with whatever loaded.
6. (MCP server connection — Day 2+. Per ADR 15, MCP client integration is out of scope for v0.2; this step is a no-op in v0.2.)
7. Instantiate and start `AgentBody` for each role.
8. Import `jie-tui`, pass the `JiePlatform` facade, start TUI. The TUI's `createTui(deps, options)` takes `deps = { platform: JiePlatform }` and reads `platform.events.subscribe(...)`, `platform.userPrompt(...)`, `platform.interrupt()`, `platform.loadTeam(...)`, `platform.getGitStatus()`, and the slash-command operations directly from the facade. The TUI's role stems and per-agent roster come from the `system.team.loaded` event on the bus (per ADR 25).
9. TUI is the main event loop — renders agent streams, tool calls, pipeline events. User prompts flow through `platform.userPrompt(agentKey, prompt)`, which derives `teamId` from `platform.team.id` and constructs the `user.prompt` envelope per the wire-format contract in `02-protocol-stack.md` "Prompt Ingress" and `ui/tui-overview.md` "Role".
10. Block until TUI exits or SIGINT. Graceful shutdown (10s bounded) stops all loaded teams.

**Exit codes:** 0 (normal exit), 1 (config error, team not found, agent load failure, `--resume <id>` validation failure, fallback team missing).

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
2. Validate `settings.json`. Resolve team (applying `--team <id>` override if given). Open `ArtifactStore` at the `.jie/storage.db` discovered by walking up from CWD (same walk as settings/team lookup per `10-configuration.md` "Discovery"; create `.jie/` at the walk's root if absent). MCP server connection: skipped in v0.2 (Day 2+). `createJiePlatform` returns a handle whose `teams` map is empty until `handle.start()` resolves.
3. `await handle.start()` triggers `TeamManager.loadAll()`. Per loaded team, the handle publishes `system.team.loaded` once all bodies' `start()` returns (per ADR 22). Per failed team, the platform publishes `system.error` with `team '<id>' failed to load: <reason>`; the CLI's `createApp` forwards that to stderr as a warning and continues.
4. Resolve the leader's role from the chosen `TeamIdentity.agents` array (`agent.isLeader === true`; fallback to first agent per `createApp.pickLeader`). Get the per-role `agent_key` for that role (per v1's `{role}-{N}` convention: `<leader_role>-1`). Subscribe to `agent.stream.chunk` events; filter for `sender.identity.teamId === <startup_team_id> && sender.identity.agentRole === <leader_role>`. (The `agent.stream.end` event is published at the end of every LLM stream by the leader — the CLI does **not** subscribe to it; the local idle gate is the source of truth for "work done", not a stream-end check.)
5. **Set up the local idle gate.** After `handle.start()` resolves, the CLI uses the resolved team's `TeamIdentity.agents` array to build the gate's initial state. **If the resolved `TeamIdentity.agents` array is empty** (the loaded team has no agents — possible if the team directory has no `.md` files, per the "empty team" rule in `06-agent-model.md` "Parse Errors"), the CLI exits 1 with `team '<id>' has no agents to run; check the team manifest` and does not enter the gate. Otherwise, for each loaded body, the gate's state is initialized to `'idle'` (the default state per the Event-Order Contract). The CLI then subscribes to the `agent.turn.start` and `agent.idle` topics on `handle.bus`. On every event, the CLI updates the corresponding body's state and evaluates the gate. The gate is a local state machine — it lives in CLI code, not on the platform.
6. Publish the `EventEnvelope` (topic `user.prompt`) via `Events.userPrompt({ kind: "cli" }, startup_team_id, "<instruction>", leader_agent_key)`. The envelope's `topic` is `user.prompt`; `payload` is `{ teamId: startup_team_id, agentKey: leader_agent_key, prompt: "<instruction>" }`; `sender` is `{ kind: "cli" }` (the CLI is the publisher, not the target); `version` is `1`; `timestamp` is the current ISO 8601 string. The CLI fills every envelope field — there is no shorthand or partial-publish path. The full wire-format contract is in `03-event-system.md` "Event Envelope" and `02-protocol-stack.md` "Prompt Ingress".
7. Print each stream chunk from the leader to stdout as it arrives.
8. **Wait for the idle gate to open.** The gate opens when "for all loaded bodies, the state is `'idle'`". Because the gate is initialized with all bodies in the `'idle'` state, the gate does **not** open until at least one body has transitioned `'idle'` → `'busy'` → `'idle'` (every `'busy'` is preceded by a `'turn_start'` for the same body, and every `'idle'` is preceded by a `'busy'` — see the Event-Order Contract in `03-event-system.md`). The CLI awaits the gate (or `--timeout`, whichever fires first). On gate open: print final newline, call `handle.stop()`, exit 0. On timeout: `handle.stop()`, exit 3 with stderr message `"no response from team within {timeout}s"`. `--timeout` is the upper bound on the wait (default 300s; 0 = no timeout).

The gate implementation (CLI-side, after `startJie()` returns):

```typescript
let resolveGate: () => void;
let timer: ReturnType<typeof setTimeout> | undefined;
const gate = new Promise<void>((resolve, reject) => {
  resolveGate = resolve;
  timer = setTimeout(() => reject(new Error('timeout')), timeoutMs * 1000);
});

const state = new Map<string, 'busy' | 'idle'>();
const loadedAgentKeys = system.teams.agents.map(a => a.agent_key);
for (const k of loadedAgentKeys) state.set(k, 'idle');

const evaluate = () => {
  if ([...state.values()].every(v => v === 'idle')) {
    clearTimeout(timer);
    resolveGate();
  }
};

handle.bus.subscribe('agent.turn.start', (env) => {
  if (env.sender.kind !== "agent") return;
  const key = env.sender.identity.agentKey;
  if (state.has(key)) state.set(key, 'busy');
});
handle.bus.subscribe('agent.idle', (env) => {
  if (env.sender.kind !== "agent") return;
  const key = env.sender.identity.agentKey;
  if (state.has(key)) {
    state.set(key, 'idle');
    evaluate();
  }
});
```

The gate relies on the Event-Order Contract (`03-event-system.md` "Event-Order Contract"): `agent.turn.start` is always published before the corresponding `agent.idle` for the same turn, and the bus delivers events in publish order. Under this contract, the gate is a correct "all work done" detector — no body can transition from "no event seen" to `'idle'` without first being observed as `'busy'`. The platform does not own this gate; the CLI composes it from primitives.

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

Prints usage summary, subcommands (`-p`, `--print`, `login`, `logout`, `model`, `team`, `--resume`, `--version`, `--help`), exits 0. Does not load config.

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

**Exit codes:** 0 (success or cancel), 1 (write error).

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
2. If `<provider>` is not a known `KnownProvider`, **WARN to stderr** (`unknown provider: <value>`) but continue — the platform's policy is to write what the user supplied; an unknown provider surfaces at model-resolution time (init-state behavior, see `10-configuration.md` Config Validation).
3. Read the current `~/.jie/settings.json` (if any), set `defaultProvider` and `defaultModel`, deep-merge if other settings are present, write back with mode `0644`.
4. Print `default model set to <provider>/<modelId>` and exit 0.

The command does not start the team, does not load `.jie/settings.json`, and does not touch `auth.json`. Project-level overrides (`.jie/settings.json`) are not written by `jie model`; users edit that file directly.

**Exit codes:** 0 (success), 1 (malformed argument, write error).

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

Write the API key for the resolved provider to `~/.jie/auth.json`. The flag does **not** match the key against the provider's expected format (no `sk-` / `sk-ant-` / etc. prefix assumption) — the user supplies whatever string they have. If the key is wrong, the LLM call fails at first use with whatever error the provider returns.

```
jie --api-key sk-ant-...            # set key for defaultProvider, then exit
jie --api-key sk-... -p "fix bug"   # set key for defaultProvider, then run -p
```

This flag is the `jie login --provider <id> --api-key <key>` flow inlined as a top-level flag, intended for automated modes (CI / scripts) where interactive login is impractical. It writes `auth.json` and persists across runs — the entry is the same shape `jie login` writes. There is exactly one API key per provider (`auth.json` is provider-keyed); `--api-key` overwrites the entry for the resolved provider.

### Behavior

1. Read merged `settings.json`; resolve `defaultProvider`. If `defaultProvider` is unset or invalid (treated as absent per `10-configuration.md` Config Validation), exit 1: `no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider`.
2. Read `~/.jie/auth.json` if it exists; otherwise start from `{}`.
3. Set (or replace) the entry for `defaultProvider` with `{ type: 'api_key', key: <key> }`.
4. Write `~/.jie/auth.json` with mode `0600`.
5. Print `logged in to <provider>` to stdout.
6. If `--api-key` is the only CLI flag, exit 0. Otherwise, continue with the remaining flags (e.g., `-p "..."`); the rest of this command's flow reads the just-written credential from `auth.json` via the standard chain (`10-configuration.md` Credentials Resolution Order).

## `jie --resume <session_id>`

Continue a previous session. The `session_id` is passed to every `AgentBody` at construction, overriding the default "mint a new `session_id`" behavior (`08-memory.md`). The body calls `memory.restore(agent_key, session_id, team_id)` and resumes from the prior `memory_turns` rows for its `(team_id, agent_key)` pair.

```
jie --resume <session_id>        # resume a specific session
```

### Behavior

The CLI does not run session-id SQL itself. It passes intent via `JiePlatformOptions` and the platform's `createJiePlatform` does the work (per ADR 20):

- **`--resume <session_id>`**: CLI sets `JiePlatformOptions.resumeSessionId = <id>`. The platform validates via `memory.hasSession(team_id, session_id)`. If `false` → exit 1: `unknown session_id: <value>`. If `true` → the platform records the value in its `Map<team_id, session_id>` and threads it to every body.
- **No flag**: `createJiePlatform` mints a fresh `session_id` and records it in the platform's `Map<team_id, session_id>`.

The TUI does not have a slash-command equivalent: opening `jie` (without `--resume`) starts a new session. The platform keeps each team's bodies running once started, so team-to-team conversation history persists mid-process across the team's lifetime.

**Exit codes:** 0 (success); 1 (unknown session_id for `--resume`, `memory_turns` read error).

