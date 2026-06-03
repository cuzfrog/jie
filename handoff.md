# Handoff

## Status

All spec review groups (A–O) are resolved. Only **Group M** (package scaffolding) remains as an implementation concern.

## Resolved Decisions

- **D**: `jie -p` mode is single-turn: returns leader's first response, exits on first `leader.idle`.
- **F**: SQLite WAL mode, busy timeout 5000ms, UTC ISO 8601 timestamps.
- **G**: Default tool timeout 120s (bash overrides to 300s). `notify` returns `{ ok, recipients }`. MCP crash returns tool error (not process exit).
- **I**: Prompt queuing required, in-memory only (acceptable for v1). TUI shows queued-prompt indicator.
- **N**: Bash timeout is a tool error (`command_timed_out`). `read_artifact` returns `null` on missing key.
- **O**: Already resolved in Group A cleanup. No changes needed.

## Previous decisions

- **E**: LLM API keys via environment variables only. Model strings as `<provider>/<model_id>` split on `/`.
- **K**: pi-agent integration uses raw `Agent` class. Jie tools use TypeBox schemas.
- **Pi repo** at `../pi` — `pi-agent-core` provides `Agent` (loop, events, streaming) and `pi-ai` provides `getModel(provider, modelId)` + `getEnvApiKey(provider)`.

## Files changed

- `specs/jie-platform/04-artifact-store.md` — WAL mode, UTC timestamps, `read_artifact` null semantics
- `specs/jie-platform/05-agent-model.md` — default tool timeout, notify recipients, MCP crash handling, bash timeout as error
- `specs/jie-platform/09-deployment.md` — MCP in-flight call error
- `specs/jie-platform/10-configuration.md` — MCP in-flight call error
- `specs/jie-platform/ui/cli.md` — `-p` mode single-turn semantics
- `specs/jie-platform/ui/tui.md` — prompt queue UX feedback
- `review-tracker.md` — groups D, F, G, I, N, O marked resolved
