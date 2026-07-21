# TUI User Scenarios

The TUI's acceptance surface. Each scenario corresponds to one e2e test file — `tests/e2e/tui/scenario-N.test.ts` — driven against the mock LLM backend (`bun mock:start` + `bun test:e2e:mock`; see `doc/DEVELOPMENT.md`). The narratives below are the user-facing acceptance criteria; the test files are the canonical assertions. Rendering details (which widget paints which row) belong in unit tests against the relevant component, not in e2e.

## Scenario 1: simple agent

1. Run `jie` under a fresh directory without any team definitions. A TUI opens on the built-in minimal team.
2. Open the agents panel (`Shift+←`); it contains one agent with role `general` (the implicit leader). The rail starts hidden.
3. Prompt `Tell me a story`. The response streams to the conversation area.
4. Press `Ctrl+D` twice (within 500 ms). The process exits 0.

**Observable outputs.** After `system.team.loaded`, `state.agents` contains exactly one entry (`general`, leader). Response tokens accumulate in `state.agents[my-team:general-1].currentTurn.blocks[*].text`; `agent.idle` closes the turn.

## Scenario 2: pass work in a team

1. Under a directory with a team at `.jie/teams/my-team/` — `manager` (leader) and `worker`, both with the `bash` tool. A TUI opens.
2. The agents panel shows both agents; each keeps a separate conversation in the chat area.
3. Prompt the `manager`: `Read file1.txt and write its content to my-answer.txt`. The manager drives the `bash` tool to completion — at least one `bash` tool-result card with no error.
4. Cycle to the `worker` (`Ctrl+↓`, forward in insertion order `[manager, worker]`) and back (`Ctrl+↑`); each agent's conversation continues independently.
5. Press `Ctrl+D` twice (within 500 ms). The process exits 0.

**Observable outputs.** `state.leaderAgentId === "my-team:manager-1"`; the manager's turns carry the `bash` tool cards and streamed text; focus cycling does not mutate any agent's scrollback or turn state.

## Scenario 3: switch teams

1. Under a directory with two installed teams, `my-team-1` (default) and `my-team-2`, each with a single `general` agent. Run `jie`.
2. Prompt on `my-team-1`; the response mentions `3`.
3. `/team my-team-2` — the agent map repopulates from `my-team-2` (`my-team-1`'s agents leave `state.agents`); the chat area shows the new team.
4. Prompt; the response streams.
5. `/team my-team-1` — the agent map re-seeds from `my-team-1`. `/team` (no arg) lists `defaultTeam` and installed IDs; picking one is equivalent to step 3.
6. Press `Ctrl+D` twice (within 500 ms). The process exits 0.

**Observable outputs.** After each switch, `state.teamId` matches and `state.agents` contains exactly the switched-to team's agents. Switching resets and re-seeds the agent map per the `system.team.loaded` / `Actions.switchTeam` rules in `tui-state.md` — there is no TUI-side conversation buffer.

## Scenario 4: first-time setup (TUI flow)

1. With no `~/.jie/auth.json` and no model in settings, run `jie` and prompt. The error banner shows `No model has been selected, please login and select a default model.` and persists until the user acts.
2. `/login nvidia <apiKey>` — `~/.jie/auth.json` gains the `nvidia` entry (mode `0600` on POSIX); transient `logged in to nvidia`.
3. `/model nvidia/<modelId>` — `~/.jie/settings.json` gains `defaultProvider`/`defaultModel`; transient `default model set to nvidia/<modelId>`.
4. Prompt again; the response streams and the banner is gone (cleared by `agent.turn.start`).
5. Press `Ctrl+D` twice (within 500 ms). The process exits 0.

**Observable outputs.** `state.errorBanner` holds the no-model message until the first keystroke after it is shown, a submit, or a new turn starts (per `tui-state.md` `clearBanners` / `agent.turn.start`). Transient messages age out after 5 s render-side.

## Scenario 5: second prompt after the first turn

1. Run `jie` with a single-agent team.
2. Prompt `Research the history of J`; wait for the agent to become idle.
3. Prompt `Tell me a haiku`; wait for idle again.
4. Press `Ctrl+D` twice (within 500 ms). The process exits 0.

**Observable outputs.** Both prompts and both responses are captured across `state.agents[my-team:general-1].history` + `currentTurn` (the first turn rotates into history when the second prompt arrives); the agent ends `idle`.

## Scenario 6: queued prompts from agent

1. Run `jie` with a two-agent team (manager + worker; the worker subscribes to the manager's `task` topic).
2. Prompt the manager: `send 5 math tasks to the worker 1 per message`. The manager calls `notify` 5 times — five tool cards — then becomes idle.
3. The worker receives the messages via subscription; while it is busy with one, the rest queue up (`agent.prompt.queue.update` carries the full queue snapshot). Cycling focus to the worker (`Ctrl+↓`) shows the footer line-2 queue segment `N prompts queued` with the next-task preview (truncated to 40 code points).
4. The worker drains the queue one message per turn, then becomes idle.

**Observable outputs.** `state.agents[my-team:manager-1]` shows the 5 `notify` cards; the worker's `queue` grows then drains to `[]` (the indicator clears when the body publishes the empty snapshot before `agent.turn.start`); the worker ends `idle`.

## Out of scope

MCP-backed tools and the jie dev team are out of scope for these scenarios; the TUI surface does not change for them, only the tool surface does.
