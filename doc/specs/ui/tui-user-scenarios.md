# TUI User Scenarios

The TUI's acceptance surface. Each scenario corresponds to one e2e test file — `tests/e2e/tui/scenario-N.test.ts` — driven against the mock LLM backend (`bun mock:start` + `bun test:e2e:mock`; see `doc/DEVELOPMENT.md`). The narratives below are the user-facing acceptance criteria; the test files are the canonical assertions. Rendering details (which widget paints which row) belong in unit tests against the relevant component, not in e2e.

## Scenario 1: simple agent

1. Run `jie` under a fresh directory without any team definitions. A TUI opens on the built-in minimal team.
2. Prompt `Tell me a story`. The response streams into the conversation area.
3. Press `Ctrl+D` (editor empty). The process exits 0.

**Observable outputs.** After `system.team.loaded`, `state.agents` contains exactly one entry (`general`, leader). Response tokens accumulate in `state.agents[my-team:general-1].currentTurn.blocks[*].text`; `agent.idle` closes the turn.

## Scenario 2: pass work in a team

1. Under a directory with a team at `.jie/teams/my-team/` — `manager` (leader) and `worker`, both with the `bash` tool. A TUI opens.
2. Prompt the `manager`: `Read file1.txt and write its content to my-answer.txt`. The manager drives the `bash` tool to completion — at least one `bash` tool-result card with no error.
3. Cycle to the `worker` (`Ctrl+↓`, forward in insertion order `[manager, worker]`) and back (`Ctrl+↑`); each agent's conversation continues independently. The footer line-1 right segment tracks the focused agent.
4. Press `Ctrl+D` (editor empty). The process exits 0.

**Observable outputs.** `state.leaderAgentId === "my-team:manager-1"`; the manager's turns carry the `bash` tool cards and streamed text; focus cycling does not mutate any agent's turn state.

## Scenario 3: switch teams

1. Under a directory with two installed teams, `my-team-1` (default) and `my-team-2`, each with a single `general` agent. Run `jie`.
2. Prompt on `my-team-1`; the response mentions `3`.
3. `/team my-team-2` — the agent map repopulates from `my-team-2` (`my-team-1`'s agents leave `state.agents`); the chat area shows the new team.
4. Prompt; the response streams.
5. `/team my-team-1` — the agent map re-seeds from `my-team-1`. Typing `/team ` autocompletes the installed IDs in-flow (the default marked); `Tab` commits one and `Enter` loads it — equivalent to step 3. Bare `/team` is a usage error (`/team <teamId>`).
6. Press `Ctrl+D` (editor empty). The process exits 0.

**Observable outputs.** After each switch, `state.teamId` matches and `state.agents` contains exactly the switched-to team's agents. Switching resets and re-seeds the agent map per the `system.team.loaded` / `Actions.switchTeam` rules in `tui-state.md` — there is no TUI-side conversation buffer.

## Scenario 4: first-time setup (TUI flow)

1. With no `~/.jie/auth.json` and no model in settings, run `jie` and prompt. The error banner shows `No model has been selected, please login and select a default model.` and persists until the user acts.
2. `/login nvidia <apiKey>` — `~/.jie/auth.json` gains the `nvidia` entry (mode `0600` on POSIX); transient `logged in to nvidia`.
3. `/model nvidia/<modelId>` — `~/.jie/settings.json` gains `defaultProvider`/`defaultModel`; transient `default model set to nvidia/<modelId>`.
4. Prompt again; the response streams and the banner is gone (cleared by `agent.turn.start`).
5. Press `Ctrl+D` (editor empty). The process exits 0.

**Observable outputs.** `state.errorBanner` holds the no-model message until the first keystroke after it is shown, a submit, or a new turn starts (per `tui-state.md` `clearBanners` / `agent.turn.start`). Transient messages age out after 5 s render-side.

## Scenario 5: second prompt after the first turn

1. Run `jie` with a single-agent team.
2. Prompt `Research the history of J`; wait for the agent to become idle.
3. Prompt `Tell me a haiku`; wait for idle again.
4. Press `Ctrl+D` (editor empty). The process exits 0.

**Observable outputs.** Both prompts and both responses are captured across `state.agents[my-team:general-1].history` + `currentTurn` (the first turn rotates into history when the second prompt arrives); the agent ends `idle`.

## Scenario 6: queued prompts from agent

1. Run `jie` with a two-agent team (manager + worker; the worker subscribes to the manager's `task` topic).
2. Prompt the manager: `send 5 math tasks to the worker 1 per message`. The manager calls `notify` 5 times — five tool cards — then becomes idle.
3. The worker receives the messages via subscription; while it is busy with one, the rest queue up (`agent.prompt.queue.update` carries the full queue snapshot). Cycling focus to the worker (`Ctrl+↓`) shows the footer line-2 queue segment `N prompts queued` with the next-task preview.
4. The worker drains the queue one message per turn, then becomes idle.

**Observable outputs.** `state.agents[my-team:manager-1]` shows the 5 `notify` cards; the worker's `queue` grows then drains to `[]` (the indicator clears when the body publishes the empty snapshot before `agent.turn.start`); the worker ends `idle`.

## Scenario 7: ! bash mode

1. Run `jie` with a single-agent team carrying the `bash` tool.
2. Submit `!ls -la`. The editor's borders flip to `warning` color while the buffer parses as a bash command; on submit the line routes straight through the `bash` tool — the LLM is not involved — and the output lands as a `bash` tool-result card with no error.
3. Submit a bare `!`. The error banner shows `bash mode requires a command…`; nothing is sent and the agent's history is unchanged.

**Observable outputs.** A `toolResult` card named `bash` with `error === null`; on the bare `!`, `state.errorBanner` matches `/bash mode requires a command/` and history length is unchanged.

## Scenario 8: slash-command autocomplete

1. Type `/he` — the autocomplete popup lists matching slash commands.
2. Press `Tab`: the buffer becomes `/help ` — completion inserts the token and does **not** submit (pi semantics).
3. Press `Enter`: the command submits; the transient reply `type a prompt...` appears; no error banner.

**Observable outputs.** `state.editorText` transitions `"/he"` → `"/help "` → `""` (submit clears); `state.transientMessage` matches `type a prompt`.

## Scenario 9: @-mention autocomplete

1. Under a project with `src/main.ts` and `src/helper.ts`, type `@main` — the popup lists the matching file.
2. Press `Tab`: the buffer becomes `@src/main.ts ` (relative path, trailing space) — the token is inserted, not submitted.

**Observable outputs.** `state.editorText` transitions `"@main"` → `"@src/main.ts "`; no error banner.

## Scenario 10: error banner renderer

1. Submit `/nonexistent-command` — the error banner shows `unknown slash command: /nonexistent-command`.
2. Submit `/help` — the banner clears (the editor clears banners on submit and on the first keystroke after an error is shown).

**Observable outputs.** `state.errorBanner` matches `unknown slash command`, then returns to `null`.

## Scenario 11: slash command autocomplete

Team and session selection ride the editor's autocomplete popup — drawn inside the editor's frame, so the editor never leaves the layout and the chat stays visible above (`tui-layout.md`, "Selection via editor autocomplete").

1. Type `/team my` — the popup lists matching installed team ids. `Tab` commits the id (`state.editorText === "/team my-team"`), and one `Enter` then submits and loads the team.
2. Type `/team ` and press `Esc` while the popup is open — the popup closes, the editor keeps its text, and further typing appends to the buffer; no error banner.
3. With a seeded session on disk, type `/resume ` — the popup lists the loaded team's sessions with `<n> msg · <age>`. `Tab` commits the session id, and one `Enter` resumes it via `resumeSession` — the seeded history hydrates into the chat. The startup `--resume <sessionId>` entry hydrates the same way on the team load.

**Observable outputs.** `state.editorText` transitions `"/team my"` → `"/team my-team"` → `""` (submit clears); the picked team reaches `state.teamId`; the resumed session's prompt appears in the agent's turns; `state.errorBanner` stays `null`.

## Out of scope

MCP-backed tools and the jie dev team are out of scope for these scenarios; the TUI surface does not change for them, only the tool surface does.
