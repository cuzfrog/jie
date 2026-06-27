# TUI User Scenarios (v0.2)

The v0.2 TUI acceptance surface. Each scenario is one entry in the v0.2 AC, lifted from the deferred archive (`00-user-scenarios-archive.md`) and rewritten as **preconditions / inputs / observable outputs / recorded `EventBus` trace**. The trace is the canonical AC; the screen frame is a derived assertion. Tests live under `tests/e2e/tui/<scenario>.test.ts`; fixtures under `tests/e2e/tui/fixtures/<scenario>.jsonl`.

The v1 user-scenarios surface (`00-user-scenarios.md` — three scenarios) is unchanged. TUI scenarios are additive.

## Scenario T1: simple agent

1. `jie` opens the TUI in a directory without any team definitions.
2. The TUI renders the built-in minimal team's single agent (`general`) as the leader (top of the left rail, with `★`).
3. The user types `Tell me a story` and presses `Enter`.
4. The status bar shows `●busy`; the chat pane streams the agent's response.
5. The status bar returns to `idle` when the turn completes.
6. The user presses `Ctrl+D`. The TUI exits 0.

**Preconditions.** No `.jie/`, no `~/.jie/teams/`, no `~/.jie/auth.json` other than what the fixture provides. Default model and provider are resolved from the merged settings file (the fixture writes one).

**Inputs.** Keystrokes: `T`, `e`, `l`, `l`, ` `, `m`, `e`, ` `, `a`, ` `, `s`, `t`, `o`, `r`, `y`, `Enter`; then `Ctrl+D`.

**Observable outputs.**

- Left rail: one row `★ general  idle` after the `team.loaded` event.
- Status bar: `★ general (leader)  <provider>/<modelId>` initially; transitions to `●busy` on `agent.turn.start`; back to `idle` on `agent.idle`.
- Chat pane: shows the streamed `agent.stream.chunk` content for `general`; ends with the final newline.
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t1.jsonl`. Minimum events: `team.t1.loaded`, `team.t1.agent.general-1.prompt` (published by the TUI via `Events.userPrompt({ kind: "tui" }, "t1", "Tell me a story", "general-1")`), `agent.turn.start` (general-1), one or more `agent.stream.chunk`, `agent.stream.end`, `agent.idle` (general-1), `handle.stop()` exit.

## Scenario T2: pass work in a team

1. A user-installed two-agent team (`manager`, `worker`) is in `.jie/teams/team-A/`.
2. `jie` opens the TUI; the left rail shows `★ manager` and `worker`.
3. The user focuses `manager` (default), types a delegation prompt: `Write the answer of my-question.txt to my-answer.txt`.
4. The `manager` calls the team's domain event (`task`); the `worker` picks it up via `notify`; the `worker` reads the file, computes, writes the answer, notifies completion.
5. The `manager` informs the user the task is done.
6. While the task is in flight, the user switches to the `worker` tab (`Alt+2`); the chat pane shows the worker's streaming work; the user switches back (`Alt+1`).
7. The user types a second prompt: `Tell me a joke`. The `manager` answers.

**Preconditions.** `.jie/teams/team-A/TEAM.md` declares `leader: manager`. `.jie/teams/team-A/manager.md` and `worker.md` declare their roles. A `my-question.txt` exists in the workspace with content `100+10=?`.

**Inputs.** Keystrokes: delegation prompt + `Enter`; `Alt+2`; `Alt+1`; second prompt + `Enter`; `Ctrl+D`.

**Observable outputs.**

- Left rail: `★ manager  ●busy` then `●idle`; `worker  ●busy` then `●idle`; back to `★ manager  ●busy` for the second prompt; final `★ manager  idle`.
- Chat pane (manager view, primary): delegation prompt; `manager`'s streamed text; `● notify task`, `✓ notify task`; `manager`'s "task done" text; second prompt and the joke answer.
- Chat pane (worker view, after `Alt+2`): the worker's streamed tool calls (`read_file`, `write_file`); the worker's "done" notification.
- `my-answer.txt` exists with content `110`.
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t2.jsonl`. Includes `team.t1.loaded`, two user prompts, multiple `agent.turn.start` / `agent.idle` alternations across both agents, `agent.stream.chunk` and `agent.tool.call` / `agent.tool.result` for both, and at least one `custom.t1.task.*` event from `notify`.

## Scenario T3: switch teams

1. Two user-installed teams in `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`. Each has a single agent with role `general`. `my-team-1` is the default.
2. `jie` opens the TUI; left rail shows `★ general  idle` (my-team-1).
3. User prompts: `Tell me the sum of 1+2`. The `general` answers `3`.
4. User types `/team my-team-2` and submits. The TUI's `teamId` switches. The left rail clears and repopulates from `team.{my-team-2_id}.loaded` (or the cached `team.loaded` for the previously-loaded team).
5. User prompts the new team: `Tell me a story`. The team answers with a different canned phrase (e.g. `Once upon a time`).
6. User types `/team my-team-1`. The chat pane **restores** the previous conversation for `my-team-1` (from the in-memory event buffer).
7. User types `/team` and selects `my-team-1` from the fuzzy-filtered list. The behavior is identical to step 6.
8. `Ctrl+D` exits 0.

**Preconditions.** Two installed teams with distinct agent canned responses. `defaultTeam: my-team-1` in `.jie/settings.json`.

**Inputs.** Keystrokes: first prompt + `Enter`; `/team my-team-2` + `Enter`; second prompt + `Enter`; `/team my-team-1` + `Enter`; `/team` + `Enter` + `Enter` (or arrow + `Enter` to select); `Ctrl+D`.

**Observable outputs.**

- After step 3: chat pane shows the sum-3 answer.
- After step 4: left rail repopulates with my-team-2's agents; chat pane clears.
- After step 5: chat pane shows the my-team-2 story.
- After step 6: chat pane **restores** the step-3 answer (event-buffer swap-back).
- After step 7: same as step 6; the picker overlay closes.
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t3.jsonl`. Includes two `team.{id}.loaded` events, two user prompts, and the in-memory buffer (asserted via the renderer's view of the state, not via a separate bus event).

## Scenario T4: first-time setup (TUI flow)

1. On a fresh machine, `jie` opens the TUI without auth or model.
2. The TUI renders the single `general` agent (built-in minimal team); status bar shows `●err` (or the platform-level "no model" error renders in the input area).
3. User types `/login` + `Enter`. The TUI opens a provider list overlay (a `SelectList`); user picks `nvidia`; the TUI prompts for the API key in a hidden input; the key writes to `~/.jie/auth.json` with mode `0600`.
4. User types `/model nvidia/<modelId>` + `Enter`. The TUI writes `defaultProvider` and `defaultModel` to `~/.jie/settings.json`.
5. User types `Tell me a joke` + `Enter`. The chat pane streams a response.
6. `Ctrl+D` exits 0.

**Preconditions.** No `~/.jie/auth.json`, no `~/.jie/settings.json`. `process.env.NVIDIA_API_KEY` is set for the test (mirrors the e2e CI flow).

**Inputs.** Keystrokes: `/login` + `Enter`; arrow-down to `nvidia` + `Enter`; paste the API key + `Enter`; `/model nvidia/<modelId>` + `Enter`; prompt + `Enter`; `Ctrl+D`.

**Observable outputs.**

- After step 2: input area renders `No model has been selected, please login and select a default model.`
- After step 3: `~/.jie/auth.json` contains `{ nvidia: { type: "api_key", key: <key> } }` with mode `0600`. **Input area (transient):** `logged in to nvidia`. The message clears on the next `Enter` or after 5 seconds.
- After step 4: `~/.jie/settings.json` contains `{ defaultProvider: "nvidia", defaultModel: "<modelId>" }`. **Input area (transient):** `default model set to nvidia/<modelId>`. Cleared on next `Enter` or after 5 seconds.
- After step 5: chat pane streams the joke.
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t4.jsonl`. Includes a `team.t1.loaded`, the no-model error path, a slash-command sequence (synthesized, not from the bus), and a normal prompt / response.

## Scenario T5: queued prompts

1. `jie` opens the TUI in a directory with a `notes.md` file.
2. User prompts: `Research the history of J and write a simple description to notes.md`. The status bar shows `●busy`; chat pane streams; the agent uses the `bash` and `write_file` tools.
3. While the agent is busy, the user types `Also write me a haiku about it in the same file.` and presses `Enter`.
4. The TUI renders the second prompt as **queued** in the input area: `queued: 1 prompt (next: "Also write me...")`.
5. The first turn completes; the status bar briefly flickers `idle` then `●busy` (the queue-pickup debounce hides the flicker — see `ui/tui.md` "Degraded States").
6. The second turn runs; the chat pane shows the haiku appended to the first turn's output.
7. `Ctrl+D` exits 0.

**Preconditions.** `notes.md` exists (empty is fine). The `bash` and `write_file` tools are available.

**Inputs.** Keystrokes: long prompt + `Enter`; second prompt + `Enter`; `Ctrl+D`.

**Observable outputs.**

- Status bar shows `queue: 1` between the first and second turn's start; the input area shows the queued-prompt indicator.
- The `agent.queue.update` event with `prompts: [second]` fires on the second `Enter`; the indicator appears.
- The `agent.queue.update` event with `prompts: []` fires when the body picks up the queued prompt; the indicator disappears.
- `notes.md` ends with both the description and the haiku appended.
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t5.jsonl`. Includes two `user.prompt` events, two `agent.turn.start` events, the `agent.queue.update` events bracketing the queued prompt, and a normal `agent.idle` close.

## Out of v0.2 TUI scope (still archived)

| Archived scenario | Why deferred |
|-------------------|--------------|
| Scenario 7: MCP-backed tools | Requires MCP client (Day 2+). TUI surface does not change; only the tool surface does. |
| jie-team dev team | The v0.2 TUI runs against any user-installed team; the dev team is Day 2+. |

These remain in `00-user-scenarios-archive.md`.
