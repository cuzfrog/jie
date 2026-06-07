# Handoff

## Status

Groups A–H are resolved. **Group H is closed** — all 14 items resolved.

A fresh implementer pass has surfaced **7 new implementation-grade gaps (Group J)** that block writing working code. They are recorded in `review-tracker.md` Group J. Proposed resolutions are presented in the session transcript; no specs have been updated yet — they await implementer agreement on the 7 decisions.

---

## Open Items — Group J (awaiting agreement)

| # | File | Issue | Proposed resolution | ADR? |
|---|---|---|---|---|
| J1 | 05-agent-model.md | `BashResult` → LLM `ToolResult.content` mapping unspecified | `content = stdout + "\n--- stderr ---\n" + stderr`; exit code in `details.exitCode` | ADR 13 |
| J2 | 05-agent-model.md | `notify` LLM-visible return string unspecified | `"Notification delivered to N recipients"`; explicit zero case naming the topic | Spec note |
| J3 | 03-event-system.md | `EventBus.publish` error propagation when subscriber throws is unspecified | Catch per-callback; continue dispatch; report actual recipient count | ADR 13 |
| J4 | 03, 05-agent-model.md | `tool_call_id` uint32 counter mapping from pi-agent string ID is unspecified | `Map<pi_toolCallId, uint32>` in AgentBody (non-persistent) | Spec note |
| J5 | 05-agent-model.md | `write_file` `bytes_written` semantic (bytes vs characters) ambiguous | `Buffer.byteLength(content, "utf8")` | Spec clarification |
| J6 | 03, ui/tui.md | No initial `agent.idle` on agent start → TUI agents-panel starts empty | Publish `agent.idle` once at startup per agent, after subscriptions registered | ADR 13 |
| J7 | ui/tui.md | TUI `roles` param purpose unclear (required or redundant?) | Required; provides blueprint-ordered agent list for initial render | Spec clarification |

---

## Resolved Decisions (Groups A–H)

### Group H (final 6, hygiene batch)
H5, H6, H8, H9, H11, H12. All small wording/scope clarifications, no new ADRs.

- **H5**: `agent.idle` published on every `agent_end` — explicit note in `03-event-system.md` "Agent Idle" section.
- **H6**: `beforeToolCall` row rewritten; Jie does not use the hook to block execution in v1.
- **H8**: `subscribe:` field semantics: "yes (may be empty `[]`)".
- **H9**: `PlatformEventPayload` type-narrowing boundary explicit: domain payload types live in `jie-team`; platform treats all string types as opaque.
- **H11**: 4 KiB truncation applies to event payload only; the LLM sees the full value.
- **H12**: No platform-reserved key for in-flight tracking; team owns its key scheme.

### Group H (structural)

- **H1**: `prepareNextTurn` spec/code mismatch. `AgentLoopTurnUpdate` has no prompt field; actual mechanism is `agent.prompt()` from body's in-memory queue after `agent_end`. Spec row at `05-agent-model.md:426` rewritten; `pi-agent-api-reference.md:95` updated.
- **H2 + H3 + H4**: `write_file` is a **v1 platform tool**; minimal team tools = `[bash, read_file, write_file]` (no artifact tools for single-agent fallback). Platform enforces workspace-root containment only; module-boundary enforcement is the team layer's responsibility (jie-team backlog #8, Day 2). **ADR 11** captures the split. ADR 10 amended. Specs updated: `05-agent-model.md`, `minimal-team.md`, `00-overview.md`, `monorepo-structure.md`.
- **H7**: Team-blueprint loader location and **package boundary**. Resolved as **jie-platform owns the loader; jie-team ships manifests + install logic only**. The platform is agnostic of jie-team — zero `import` of any kind. jie-team's `postinstall` + new `jie team install` CLI command copy bundled team manifests to `~/.jie/teams/<id>/`. **ADR 12** captures the principle. ADR 3 amended. Specs updated: `monorepo-structure.md`, `minimal-team.md`, `10-configuration.md`, `12-installation.md`, `ui/cli.md`.
- **H10**: Business identifiers (`task_id`, `work_id`) are not a platform concept. Note added in `05-agent-model.md` `notify` section, cross-referencing ADR 7 and ADR 12.
- **H13**: Code-Lens is generic MCP; dev team declares the dependency in its manifest. WARN-and-skip + cascade applies uniformly. Specs updated: `code-lens/service.md`, `09-deployment.md`.
- **H14**: Queued-prompt indicator mechanism. Resolved as **explicit `agent.queue.update` event** mirroring pi's `queue_update`. Body publishes `{ prompts: string[] }` on every enqueue and dequeue. TUI subscribes. Specs updated: `03-event-system.md`, `05-agent-model.md`, `ui/tui.md`.

### Group H1 pre-session F5 status update

F5 was previously "read_file is built-in, write_file is Day 2". H3 elevates `write_file` to v1 and supersedes the F5 second half. **ADR 11** is the new authority; F5 should be read with the H2/H3 outcome applied.

### Earlier groups (A–G)

All prior groups (A through G) are resolved. Decisions are captured in `./addrs/1` through `./addrs/9`. The handoff document contains the original per-decision notes from prior sessions; those are now archival. The tracker above contains compact one-line summaries of each resolved group.

---

## Previous concise decisions (archival)

- **E (startup/config/errors)**: No interactive init, strict config validation, WARN-and-skip MCP at startup / hard-fail at agent load, 10s bounded graceful shutdown, no `jie init` in v1, prompt queue cap deferred to Day 2 (backlog #19).
- **C (tools)**: `WebSearchResult = { title, url, snippet }`, pluggable `WebSearchProvider` (DuckDuckGo default), format-agnostic `web_fetch`, `bash` 32 KiB per-stream truncation, `write_artifact` returns `{ key, created_at }`.
- **D (group review)**: All 11 items resolved. See ADR 8 (no grace turn) and ADR 9 (AgentBody mechanisms). Decisions originally captured in `user-intentions.md`.
- **D (jie -p mode)**: `jie -p` mode is single-turn: returns leader's first response, exits on first `leader.idle`.
- **F**: SQLite WAL mode, busy timeout 5000ms, UTC ISO 8601 timestamps.
- **G**: Default tool timeout 120s (bash overrides to 300s). `notify` returns `{ ok, recipients }`. MCP crash returns tool error (not process exit).
- **I / N**: Prompt queuing required, in-memory only (acceptable for v1). TUI shows queued-prompt indicator. Bash timeout is a tool error (`command_timed_out`). `read_artifact` returns `null` on missing key.
- **E (LLM keys)**: LLM API keys via environment variables only. Model strings as `<provider>/<model_id>` split on `/`.
- **K**: pi-agent integration uses raw `Agent` class. Jie tools use TypeBox schemas.
- **Pi repo** at `../pi` — `pi-agent-core` provides `Agent` (loop, events, streaming) and `pi-ai` provides `getModel(provider, modelId)` + `getEnvApiKey(provider)`.
