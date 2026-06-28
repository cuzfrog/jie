# Deferred User Scenarios (Day 2+ Archive)

Day 2+ user scenarios from the original `00-user-scenarios.md`. Preserved as a reference for the test plan when the corresponding features land. See `backlog.md` for the feature backlog and `00-user-scenarios.md` for the v1 acceptance surface.

## Scenario 1: simple agent `[Day 2+]`

1. Run `jie` under `/tmpworkspace/my-project/` without any config. A TUI opens.
2. I can open the agents panel, the panel contains one agent with role `general`.
3. jie behaves as a normal agent CLI (prompt input, conversation screen).
4. Prompts produce LLM output, the same way as a pi agent.

Requires: TUI (backlog #21).

## Scenario 2: pass work in a team `[Day 2+]`

1. Run `jie` under `/tmp/workspace/my-project2/` with two team manifests at `.jie/teams/my-team/` (see "team-A-blueprint" below). A TUI opens.
2. The TUI has two tabs: agent with role `manager` and agent with role `worker`.
3. I can open the agents panel, and switch agents. Each agent has separated conversation in the chat area.
4. Prompts produce LLM output per agent; each tab is a separate conversation.
5. With `my-question.txt` containing "100+10=?", prompt the `manager`: "Write the answer of my question in the file `my-question.txt` to file `my-answer.txt`". The `manager` informs the user when the task is done; `my-answer.txt` contains `110`.
6. While the task is in flight, prompt the `manager`: "Tell me a joke". The `manager` responds with a joke, possibly before the task is done.

Requires: TUI (backlog #21) + jie-team dev team (backlog #24).

## Scenario 3: switch teams `[Day 2+]` (TUI flow)

1. Under `/tmp/workspace/my-project3/`, two team manifests: `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`.
2. Run `jie`. A TUI opens with tab(s) for `my-team-1`'s agents.
3. Prompt: "Tell me the sum of 1+2". Response mentions "3".
4. Use `/team my-team-2` to switch teams. The TUI tabs change to `my-team-2`'s agents; the conversation area is clean.
5. Use `/team my-team-1` to switch back. Tabs change back to `my-team-1`'s agents; the conversation area contains the previous conversation.
6. Type `/team` to see a list of teams with selection filter (matching pi's selection-filter UI).

The v1 CLI parts (`--team <id>` error path and `--team <id> -p` mode) are covered by Scenario 2 in `00-user-scenarios.md`.

Requires: TUI (backlog #21).

## Scenario 6: first-time setup `[Day 2+]` (TUI flow)

1. On a fresh machine, run `jie`. A TUI opens.
2. The TUI contains one tab: agent with role `general`.
3. Prompt "Tell me a joke" → error displayed: `No model has been selected, please login and select a default model.`
4. Run `/login`, pick `anthropic`, paste API key — `~/.jie/auth.json` exists.
5. Run `/model`, pick `anthropic/claude-sonnet-4-5` — `~/.jie/settings.json` contains `defaultProvider: anthropic` and `defaultModel: claude-sonnet-4-5`.
6. Prompt "Tell me a joke". Response streams to the conversation area.
7. Press ctl+D; the process exits 0.

The v1 CLI parts (`jie login`, `jie model`, `jie -p` after setup) are covered by Scenario 3 in `00-user-scenarios.md`.

Requires: TUI (backlog #21).

## Scenario 7: MCP-backed tools `[Day 2+]`

1. `./e2e/test-mcp/.jie/mcp.json` configures a `mock-mcp-server` server with three tools: `mock-tool-A1`, `mock-tool-A2`, `mock-tool-B1`.
2. `./e2e/test-mcp/.jie/teams/my-team/` contains a single `my-agent.md`:

```
---
tools: [mcp:mock-mcp-server:mock-tool-A*]
---
```

3. Run `jie -p "Call all your mcp tools"` under `./e2e/test-mcp/`.
4. The MCP server's `mock-tool-A1` and `mock-tool-A2` are invoked; `mock-tool-B1` is not (the glob excludes `B1`).
5. After some response streams to stdout, the process exits 0.

Requires: MCP client (backlog #26).

## Scenario 9: queued prompts while leader is busy `[Day 2+]`

1. Run `jie` under `/tmp/workspace/my-project9/` without any config. A TUI opens.
2. Prompt: "Research the history of J and write a simple description to `notes.md`."
3. While the agent is busy, type: "Also write me a haiku about it in the same file." The prompt is queued (visible in the TUI).
4. After the agent becomes idle, `notes.md` contains both the description and the haiku.
5. Press ctl+D; the process exits 0.

Requires: TUI (backlog #21).

## team-A-blueprint (illustrative — jie-team-style)

This is a jie-team-style team used by Scenario 2. It is **not** a v1 team — v1 ships only the built-in minimal team (per `minimal-team.md`).

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
