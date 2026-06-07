# Handoff

## Status

All spec review groups A–O are resolved (review-pass decisions D, F, G, I, N, O plus the consolidated Group A and Group B cleanup). **Group D** (Core Mechanics), **Group C** (Tool Implementation Gaps), and **Group E** (Startup, Config & Error Handling) are now fully resolved. The remaining open items in `review-tracker.md` are Groups F (concrete values) and G (deferred TBDs). Recommended order: F → G.

## Resolved Decisions

- **E (startup/config/errors)**: All 7 items in `review-tracker.md` Group E resolved. Specs captured across `10-configuration.md` (config validation, team resolution rules), `09-deployment.md` (startup sequence, bounded shutdown), `12-installation.md` (manual project setup), `ui/cli.md` (no init flow), and `jie-team/minimal-team.md` (new built-in fallback team). Key calls:
  - No interactive init flow in either mode. Both `jie` and `jie -p` use all defaults if no config; minimal team is the default.
  - Team resolution: `.jie/teams/<team_id>/` → `~/.jie/teams/<team_id>/` → built-in default. If `team_id` set but no manifest → hard fail.
  - Strict config validation (no silent fallbacks). MCP startup: WARN-and-skip; cascade to hard fail at agent load.
  - Graceful shutdown: 10s bounded; abort in-flight ops via combined `AbortSignal`; force-exit on timeout.
  - Prompt queue cap deferred to Day 2 (backlog #19).
- **C (tools)**: All 5 items in `review-tracker.md` Group C resolved. Specs captured in `05-agent-model.md` (full TypeBox schemas, return types, HTTP/timeout policy) and `04-artifact-store.md` (refactored to point at the tool spec). Key calls:
  - `WebSearchResult = { title, url, snippet }` (no optional fields).
  - Pluggable `WebSearchProvider` interface; DuckDuckGo HTML default (no API key).
  - `web_fetch` is format-agnostic — adapter returns plain text for HTML, verbatim for other types.
  - `bash` truncates each stream independently to 32 KiB; `truncated: { stdout, stderr }` flag.
  - `write_artifact` returns `{ key, created_at }`; tool error on storage failure.
- **D (group review)**: All 11 items in `review-tracker.md` Group D resolved. See ADR 8 (no grace turn) and ADR 9 (AgentBody mechanisms). Decisions captured in `user-intentions.md`.
- **D (jie -p mode)**: `jie -p` mode is single-turn: returns leader's first response, exits on first `leader.idle`.
- **F**: SQLite WAL mode, busy timeout 5000ms, UTC ISO 8601 timestamps.
- **G**: Default tool timeout 120s (bash overrides to 300s). `notify` returns `{ ok, recipients }`. MCP crash returns tool error (not process exit).
- **I**: Prompt queuing required, in-memory only (acceptable for v1). TUI shows queued-prompt indicator.
- **N**: Bash timeout is a tool error (`command_timed_out`). `read_artifact` returns `null` on missing key.
- **O**: Already resolved in Group A cleanup. No changes needed.

## Previous decisions

- **E**: LLM API keys via environment variables only. Model strings as `<provider>/<model_id>` split on `/`.
- **K**: pi-agent integration uses raw `Agent` class. Jie tools use TypeBox schemas.
- **Pi repo** at `../pi` — `pi-agent-core` provides `Agent` (loop, events, streaming) and `pi-ai` provides `getModel(provider, modelId)` + `getEnvApiKey(provider)`.
