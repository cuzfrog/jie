# TUI User Scenarios (v0.2)

The v0.2 TUI acceptance surface. Each scenario is one entry in the v0.2 AC, lifted from the deferred archive (`00-user-scenarios-archive.md`) and rewritten as **preconditions / inputs / observable outputs / recorded `EventBus` trace**. The trace is the canonical AC; the screen frame is a derived assertion asserted by the snapshot tests. Rendering details (which widget paints which row, which color, which glyph) are intentionally not in this file — those belong in unit tests against the relevant `Component` subclass, not in e2e. Tests live under `tests/e2e/tui/<scenario>.test.ts`; fixtures under `tests/e2e/tui/fixtures/<scenario>.jsonl`.

The v1 user-scenarios surface (`00-user-scenarios.md` — three scenarios) is unchanged. TUI scenarios are additive.

## Test layers

`ui/tui.md` defines three test layers; the AC bullets here apply to **layer 3** (integration: JSONL → reducer → render → `VirtualTerminal`) unless explicitly noted otherwise:

- **Layer 1 (reducer unit tests):** `packages/jie-tui/state.test.ts`, `packages/jie-tui/reducer.test.ts`. Same input envelope → same `TuiState`. The AC's state-derived assertions (e.g. `state.agents[id].currentTurn.blocks[*].text`) are tested here.
- **Layer 2 (render unit tests):** `packages/jie-tui/<component>.test.ts` per `Component` subclass. Fixed `TuiState` inputs → frame output line-by-line. The AC's rendering details (rail glyphs, footer formatting, transient visibility timing) are tested here.
- **Layer 3 (e2e integration):** `tests/e2e/tui/<scenario>.test.ts`. The full path: hand-recorded JSONL trace → reducer → renderer → `VirtualTerminal` → snapshot match. Asserts both the canonical AC (trace → expected `TuiState`) and the derived AC (frame → snapshot).

The e2e suite asserts user-observable behavior — what a human sees, what files exist, what exit code the process returns. Internal state (`TuiState`, the in-memory event buffer) is asserted by layer-1 tests, not by the e2e JSONL trace, except where the AC explicitly states a state-derived check (e.g. T3 step 6 restoration).

## Scenario T1: simple agent

1. Run `jie` under a fresh directory without any team definitions. A TUI opens.
2. I can open the agents panel; the panel contains one agent with role `general`.
3. `jie` behaves as a normal agent CLI (prompt input, conversation screen).
4. Prompt `Tell me a story`. Response streams to the conversation area, the same way as a pi agent.
5. Press `Ctrl+D`. The process exits 0.

**Preconditions.** No `.jie/`, no `~/.jie/teams/`, no `~/.jie/auth.json` other than what the fixture provides. Default model and provider are resolved from the merged settings file (the fixture writes one). The agents panel starts hidden (`state.showRail === false` per `tui-state.md` initial state); step 2 requires the user to press `← ←` to reveal it.

**Inputs.** Keystrokes (for layer-3 integration test only): `T`, `e`, `l`, `l`, ` `, `m`, `e`, ` `, `a`, ` `, `s`, `t`, `o`, `r`, `y`, `Enter`; then `Ctrl+D`. The layer-1 (reducer) and layer-2 (render) tests feed the prompt text directly into the reducer / renderer without driving keystrokes.

**Observable outputs.**

- After the first `system.teams`, `state.agents` contains exactly one entry with `agentKey === "general"` and `isLeader === true` (built-in minimal team — the single agent is implicitly the leader). Footer line 1 right reads `my-team:general` (verifiable from the rendered frame).
- After `Enter`, response tokens stream into the conversation area; `state.agents[my-team:general].currentTurn.blocks[*].text` accumulates the streamed content.
- After `Ctrl+D`, the process exits 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t1.jsonl`. Envelope schema per `tui.md` "Wire-format contract". Includes `system.teams` (with `payload.agents[0].model === null` for the built-in minimal team — the team's `general` does not pin a model), the user prompt, the agent's streaming response, and `agent.idle` close.

## Scenario T2: pass work in a team

1. Under a directory with two team manifests at `.jie/teams/my-team/` (team shape: see "T2 test fixture — team-A blueprint" below). A TUI opens.
2. The TUI has two tabs: agent with role `manager` and agent with role `worker`.
3. I can open the agents panel and switch agents. Each agent has a separated conversation in the chat area.
4. With `my-question.txt` containing `100+10=?`, prompt the `manager`: `Write the answer of my question in the file my-question.txt to file my-answer.txt`.
5. While the task is in flight, prompt the `manager`: `Tell me a joke`. The `manager` responds with a joke **before the worker becomes idle** — the joke's stream chunks land while the worker is still computing.
6. The `manager` informs the user when the task is done; `my-answer.txt` contains `110`.
7. After both turns complete, switch to the `worker` (`Ctrl+↓` cycles forward in insertion order `[manager, worker]`) and back to the `manager` (`Ctrl+↑`); each agent's conversation continues independently.
8. Press `Ctrl+D`. The process exits 0.

**Preconditions.** `.jie/teams/my-team/TEAM.md` declares `leader: manager`. `manager.md` and `worker.md` declare roles per the team-A blueprint (system prompts verbatim — see fixture section). `my-question.txt` exists with content `100+10=?`.

**Inputs.** Slash-command / keystroke sequence: delegation prompt + `Enter`; joke prompt + `Enter` (while worker is still busy); `Ctrl+↓` to worker; `Ctrl+↑` to manager; `Ctrl+D`.

**Observable outputs.**

- The chat area for `manager` shows the delegation prompt, the streamed response, the joke response (arriving **before** the worker's `agent.idle`), and the `task done` message — all in a single scrollback.
- The chat area for `worker` (after `Ctrl+↓`) shows the worker's streamed tool calls (`read_file`, `write_file`) and the `done` notification.
- `my-answer.txt` exists with content `110`. Verify by reading from the test harness's sandboxed directory.
- The chat area for `manager` (after `Ctrl+↑`) shows the same single scrollback — focus cycling does not affect scrollback content.
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t2.jsonl` (with the team-A blueprint at `tests/e2e/tui/fixtures/t2-fixture/`). Envelope schema per `tui.md` "Wire-format contract" (each line is `{ version, timestamp, sender: { identity: { teamId, agentKey } }, topic, payload }`). Includes one `system.teams`, two user prompts, multiple `agent.turn.start` / `agent.idle` alternations across both agents, `agent.stream.chunk` and `agent.tool.call` / `agent.tool.result` for both, and `custom.{teamId}.task.*` events from `notify`. The ordering constraint: the joke's `agent.stream.chunk` envelopes arrive **before** the worker's `agent.idle`. The `custom.*` events are in the trace for completeness but the reducer does not assert on them (per `tui-state.md` `custom.{teamId}.{topic}` rule).

### T2 test fixture — team-A blueprint

The T2 fixture (`tests/e2e/tui/fixtures/t2-fixture/`) ships a verbatim copy of the `team-A-blueprint` from `00-user-scenarios-archive.md`. The test harness copies the fixture to a sandboxed `.jie/teams/my-team/` before running T2; the assertions against the EventBus trace and the rendered frames are reproducible because the agent system prompts (which drive the LLM-stub responses in the JSONL trace) are pinned.

`TEAM.md`
```
---
name: my-team # this is team_id, required
leader: manager # when there's only 1 agent, this is optional
---
```

`manager.md`
```
---
subscribe: [work]
tools: [read_file, write_artifact] # tool `notify` is implicit
---
You are the manager who delegates tasks.
- When you receive a task from the user, you delegate it by writing a `task` artifact and notifying the team there is a new task.
- When you receive a notification of a task completion, you inform the user that the task is done.
```

`worker.md`
```
---
subscribe: [work]
tools: [write_file, read_artifact]
---
You are the worker who implements tasks.
- When you receive a notification of a new task, you read the `task` artifact and implement the task.
- When you finish your task, you notify the team that the task is done.
```

The fixture's JSONL trace assumes these system prompts verbatim. If a future iteration of the team shape changes a system prompt, the fixture must be re-recorded; the test harness flags the drift via a sha256 (UTF-8 bytes) content-hash check on the fixture's TEAM/manager/worker `.md` files, compared against the hash recorded in `tests/e2e/tui/fixtures/t2-fixture/.system-prompt.sha256`.

The trace's stubbed manager responses for `task done` are substring-asserted, not literal-asserted: `state.agents[manager].currentTurn.blocks[*].text` (or, after the turn rotates, `state.agents[manager].history[*].blocks[*].text`) contains the substring `task done` or `task is done`. LLM wording drift between fixture regenerations is tolerated.

## Scenario T3: switch teams

1. Under a directory with two team manifests: `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`. Each has a single agent with role `general`. `my-team-1` is the default.
2. Run `jie`. A TUI opens with agents from `my-team-1`.
3. Prompt: `Tell me the sum of 1+2`. Response mentions `3`.
4. Use `/team my-team-2` to switch teams. The agent panel repopulates from `my-team-2`; the conversation area is clean.
5. Prompt: `Tell me a story`. Response streams to the conversation area.
6. Use `/team my-team-1` to switch back. The agent panel repopulates from `my-team-1`; the conversation area contains the previous conversation.
7. Type `/team` to see a list of teams with selection filter. Selecting `my-team-1` is equivalent to step 6.
8. Press `Ctrl+D`. The process exits 0.

**Preconditions.** Two installed teams with distinct agent canned responses. `defaultTeam: my-team-1` in `.jie/settings.json`.

**Inputs.** Slash-command sequence: first prompt + `Enter`; `/team my-team-2` + `Enter`; second prompt + `Enter`; `/team my-team-1` + `Enter`; `/team` + `Enter` + arrow + `Enter` to select `my-team-1`; `Ctrl+D`.

**Observable outputs.**

- After step 3: `state.agents[my-team-1:general].currentTurn.blocks[*].text` contains the substring `3` (state-derived; robust to LLM wording drift).
- After step 4: `state.teamId === "my-team-2"`; `state.agents` contains `my-team-2:general` and not `my-team-1:general`; the conversation area shows an empty scrollback.
- After step 5: `state.agents[my-team-2:general].currentTurn.blocks[*].text` contains the `my-team-2` story.
- After step 6: `state.teamId === "my-team-1"`; the in-memory event buffer (per `tui-state.md` "In-memory event buffer") replays into the chat pane and `state.agents[my-team-1:general].history` / `currentTurn` contain the step-3 response.
- After step 7: same as step 6; the rendered frame does not contain the picker's filter rows (verifiable by diffing the post-Enter frame against the pre-`/team Enter` frame).
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t3.jsonl`. Envelope schema per `tui.md` "Wire-format contract". Includes two `system.teams` events (the second on step 4, the first on step 6 either replayed from the buffer or re-emitted by the platform — fixture pins which path), two user prompts, and the in-memory event buffer is asserted via the renderer's view of the state, not via a separate bus event. Each `system.teams` payload's `agents[0].model` is recorded verbatim (the fixture carries the `(provider, id, effort)` triple).

## Scenario T4: first-time setup (TUI flow)

1. On a fresh machine, run `jie`. A TUI opens.
2. The TUI contains one tab: agent with role `general`.
3. Prompt `Tell me a joke` → error displayed: `No model has been selected, please login and select a default model.` The error is the TUI's `errorBanner` (per `tui-state.md`); it renders in the editor placeholder area and persists until the user acts.
4. Run `/login`, pick `nvidia`, paste API key — `~/.jie/auth.json` exists.
5. Run `/model nvidia/<modelId>` — `~/.jie/settings.json` contains `defaultProvider: nvidia` and `defaultModel: <modelId>`.
6. Prompt `Tell me a joke`. Response streams to the conversation area.
7. Press `Ctrl+D`. The process exits 0.

**Preconditions.** No `~/.jie/auth.json`, no `~/.jie/settings.json`. `process.env.NVIDIA_API_KEY` is set so the JSONL fixture can carry the stubbed API key in the test setup (the replay itself does not call an LLM; the provider was switched from `anthropic` in the archive to `nvidia` for e2e CI alignment with the v1 harness).

**Inputs.** Slash-command / keystroke sequence: `Tell me a joke` + `Enter`; `/login` + `Enter`; arrow-down to `nvidia` + `Enter`; paste the API key + `Enter`; `/model nvidia/<modelId>` + `Enter`; prompt + `Enter`; `Ctrl+D`.

**Observable outputs.**

- After step 3: `state.errorBanner?.text` equals `No model has been selected, please login and select a default model.`. The error persists until the user types the next keystroke that submits or clears the editor (publishes `ui.error.clear`).
- After step 4: `~/.jie/auth.json` contains `{ nvidia: { type: "api_key", key: <key> } }`. On POSIX runners, the file mode is `0600`; on Windows runners, the file exists and contains the entry (the mode check is skipped). `state.transientMessage?.text` equals `logged in to nvidia` immediately after the slash command, cleared on the next `Enter` or after 5 seconds (per `tui-state.md` "Transient messages").
- After step 5: `~/.jie/settings.json` contains `{ defaultProvider: "nvidia", defaultModel: "<modelId>" }`. `state.transientMessage?.text` equals `default model set to nvidia/<modelId>`, cleared on the next `Enter` or after 5 seconds.
- After step 6: conversation area streams the joke; `state.errorBanner` is `null` (cleared by the `agent.turn.start` rule per `tui-state.md`, which fires when the body picks up the user's second prompt).
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t4.jsonl`. Envelope schema per `tui.md` "Wire-format contract". Includes a `system.teams`, the no-model error path (synthesized `ui.error` envelope published by `startTUI` before forwarding the prompt), a slash-command sequence (synthesized `ui.transient` envelopes, not from the platform bus), and a normal prompt / response. The trace's order: `system.teams` → user prompt → `ui.error { text: "No model..." }` → `ui.error.clear` → `/login` slash command → `ui.transient { text: "logged in to nvidia" }` → `ui.transient.clear` → `/model` slash command → `ui.transient { text: "default model set to nvidia/<modelId>" }` → user prompt → stream.

## Scenario T5: queued prompts

1. Run `jie` under a directory with a `notes.md` file. A TUI opens.
2. Prompt: `Research the history of J and write a simple description to notes.md`. Response streams; the agent uses the `bash` and `write_file` tools.
3. While the agent is busy, type: `Also write me a haiku about it in the same file.` and press `Enter`. The prompt is queued (visible in the TUI).
4. After the agent becomes idle, `notes.md` contains both the description and the haiku.
5. Press `Ctrl+D`. The process exits 0.

**Preconditions.** `notes.md` exists (empty is fine). The `bash` and `write_file` tools are available.

**Inputs.** Slash-command / keystroke sequence: long prompt + `Enter`; second prompt + `Enter`; `Ctrl+D`.

**Observable outputs.**

- After step 3, the editor area shows `1 prompt queued` with the next-prompt preview text including the substring `Also write me a haiku about it in the same file` (exact punctuation is implementation-defined; full prompt text fits within the 100-char truncation window per `tui-state.md` "agent.queue.update").
- The indicator disappears when the queued prompt is picked up — the disappearing frame is taken **after** `state.agents[leader].status === "busy"` and the `agent.queue.update {prompts: []}` envelope is processed. The 50 ms `lastIdleAt` debounce hides any `agent.idle` → `agent.turn.start` flicker.
- `notes.md` ends with the description followed by the haiku (description first because the second prompt says `in the same file` after the description was already written).
- Final exit code: 0.

**Recorded `EventBus` trace.** `tests/e2e/tui/fixtures/t5.jsonl`. Envelope schema per `tui.md` "Wire-format contract". Includes two user prompts, two `agent.turn.start` events, and the `agent.queue.update` envelopes in this exact order: `agent.queue.update {prompts: ["Also write me a haiku..."]}` arrives while prompt 1 is busy; then `agent.idle` (prompt 1 done); then `agent.queue.update {prompts: []}`; then `agent.turn.start` for prompt 2; then the second turn's stream and `agent.idle` close. The order pins the disappearing-frame assertion.

## Out of v0.2 TUI scope (still archived)

| Archived scenario | Why deferred |
|-------------------|--------------|
| Scenario 7: MCP-backed tools | Requires MCP client (Day 2+). TUI surface does not change; only the tool surface does. |
| jie-team dev team | The v0.2 TUI runs against any user-installed team; the dev team is Day 2+. |

These remain in `00-user-scenarios-archive.md`.
