# Handoff

## Status

All spec review groups A–O are resolved (review-pass decisions D, F, G, I, N, O plus the consolidated Group A and Group B cleanup). **Group D** (Core Mechanics — all 11 items in `review-tracker.md`) is now also fully resolved. The remaining open items in `review-tracker.md` are Groups C (tools), E (startup/config/errors), F (concrete values), and G (deferred TBDs). Recommended order: C → E → F → G.

## Resolved Decisions

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
