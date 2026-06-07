# Handoff

## Status

All spec review groups A–G are resolved (review-pass decisions D, F, G, I, N, O plus the consolidated Group A and Group B cleanup; Group C tools; Group E startup/config; **Group F concrete values**; **Group G TBD pointers**). The `review-tracker.md` has no open items.

## Resolved Decisions (this session)

- **Group F (concrete values)**: All 5 items resolved per user decisions.
  - **F1** install version: v1 supports only manual install (`git clone` + `bun link --global`). Polished install script (`https://install.jie.dev`) and npm publish deferred to **Day 2 backlog #20**. Specs: `12-installation.md`, `backlog.md`.
  - **F2** git repo URL: `https://cuzfrog.github.com/jie` (per project owner). Spec: `12-installation.md`.
  - **F3** `jie --version` source: walk-up from `import.meta.dirname` to find umbrella `package.json` (where `name === "@cuzfrog/jie"`); fallback `0.0.0-dev`. Mirrors pi's `getPackageDir()` / `VERSION` pattern (`@earendil-works/pi-coding-agent/src/config.ts`). Spec: `ui/cli.md`.
  - **F4** `memory_turns` DDL: already in migration block; marked resolved.
  - **F5** `read_file` is a built-in platform tool, mirroring pi's `read`. **ADR 10** captures the decision. v1 scope: text only (no images), 2000 lines OR 50 KiB truncation, UTF-8, workspace-root path constraint. `write_file` documented as Day 2 (entangled with frozen-rule enforcement, jie-team backlog #8); Implementer uses `bash` + redirection as v1 stand-in. Specs: `05-agent-model.md`, `00-overview.md`, `monorepo-structure.md`.
- **Group G (TBD pointers)**: Both items referenced a non-existent "Storage Maintenance chapter (TBD)". Replaced with backlog #7 references. Specs: `04-artifact-store.md`, `08-memory.md`.

## Open Questions (not blockers)

- **Minimal team tool set**: `minimal-team.md` lists `bash`, `write_artifact`, `read_artifact` for the `general` leader. With `read_file` now a built-in platform tool, should the minimal team include it? Not changed in this session — flag for next review.
- **`write_file` Day 2 contract**: The dev team Implementer needs `write_file` to ship a runnable dev team. Spec currently says "use bash + redirection as v1 stand-in". The frozen-rule enforcement contract (jie-team backlog #8) must be defined before `write_file` is added. Until then, implementer writes work via bash; this is functional but loses boundary enforcement.

## Previous decisions

- **E (startup/config/errors)**: All 7 items in `review-tracker.md` Group E resolved. Key calls: no interactive init, strict config validation, WARN-and-skip MCP at startup / hard-fail at agent load, 10s bounded graceful shutdown, no `jie init` in v1, prompt queue cap deferred to Day 2 (backlog #19).
- **C (tools)**: All 5 items in `review-tracker.md` Group C resolved. Key calls: `WebSearchResult = { title, url, snippet }`, pluggable `WebSearchProvider` (DuckDuckGo default), format-agnostic `web_fetch`, `bash` 32 KiB per-stream truncation, `write_artifact` returns `{ key, created_at }`.
- **D (group review)**: All 11 items in `review-tracker.md` Group D resolved. See ADR 8 (no grace turn) and ADR 9 (AgentBody mechanisms). Decisions captured in `user-intentions.md`.
- **D (jie -p mode)**: `jie -p` mode is single-turn: returns leader's first response, exits on first `leader.idle`.
- **F**: SQLite WAL mode, busy timeout 5000ms, UTC ISO 8601 timestamps.
- **G**: Default tool timeout 120s (bash overrides to 300s). `notify` returns `{ ok, recipients }`. MCP crash returns tool error (not process exit).
- **I**: Prompt queuing required, in-memory only (acceptable for v1). TUI shows queued-prompt indicator.
- **N**: Bash timeout is a tool error (`command_timed_out`). `read_artifact` returns `null` on missing key.
- **O**: Already resolved in Group A cleanup.
- **E (LLM keys)**: LLM API keys via environment variables only. Model strings as `<provider>/<model_id>` split on `/`.
- **K**: pi-agent integration uses raw `Agent` class. Jie tools use TypeBox schemas.
- **Pi repo** at `../pi` — `pi-agent-core` provides `Agent` (loop, events, streaming) and `pi-ai` provides `getModel(provider, modelId)` + `getEnvApiKey(provider)`.