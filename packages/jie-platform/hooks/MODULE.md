---
no-new-exports:
  - command-executor.ts
  - hook-runner.ts
  - index.ts
  - load-hooks.ts
  - module.ts
  - parse-hooks.ts
  - types.ts
---

## Contracts

- Hooks are configured under the `hooks` key of `settings.json` (claude-code shape): `{ "<Event>": [ { "matcher"?, "hooks": [ { "type": "command", "command", "timeout"? } ] } ] }`. `loadHooksConfig` reads the key from `~/.jie/settings.json` then `.jie/settings.json` and `parseHooksConfig` merges the two scopes additively (project matchers run after global). Parsing is lenient: unknown event keys, non-`command` handler types, and malformed groups are skipped, never thrown — a broken hooks block must not discard the rest of the settings.
- v1 events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`. Only `command` handlers are supported. `matcher` is a tool-name regex (absent/`""`/`"*"` matches every tool); it applies only to the tool events.
- Each handler runs as `/bin/sh -c <command>` with a JSON payload on stdin (`session_id`, `hook_event_name`, `cwd`, `team_id`, `agent_key`, `role`, plus event fields) and a per-handler timeout (default 60s). Exit `2` blocks; a JSON stdout of `{ "continue": false }` or `{ "decision": "block", "reason" }` blocks; `hookSpecificOutput.additionalContext` injects context where the event supports it. Other non-zero exits are non-blocking errors. A timeout is non-blocking.
- `PreToolUse` maps to pi-agent `beforeToolCall` (a block returns `{ block: true, reason }`, which pi turns into an error tool result). `PostToolUse` maps to `afterToolCall` (block marks the result an error; `additionalContext` appends to the tool result). `UserPromptSubmit`, `SessionStart`, `Stop` fire on the body lifecycle. Implementation classes (`HookRunnerImpl`, `ShCommandExecutor`) are module-private; only `HookRunner` and the input/outcome types cross the boundary.
