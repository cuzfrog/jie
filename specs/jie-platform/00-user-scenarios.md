# User Scenarios

Scenarios tagged `[v1]` are the v1 acceptance surface (`jie -p` + setup commands). Scenarios tagged `[Day 2+]` require the TUI or MCP client (deferred per ADR 17) and re-enter the test plan when those land.

## Scenario 1: simple agent `[Day 2+]`
1. when I run `jie` under the dir `/tmpworkspace/my-project/` without any config, a TUI opens.
2. the TUI only contains 1 tab: agent with a role `general`.
3. under the tab, jie can be used just as a normal agent CLI, containing a prompt input area at the bottom, a screen area to display the conversation, etc.
4. I can issue prompts to the agent, and the agent will respond with LLM output, the same way as a pi agent.

## Scenario 2: pass work in a team `[Day 2+]`
1. when I run `jie` under the dir `/tmp/workspace/my-project2/` with 2 team manifests under `.jie/teams/my-team/` (see below team-A), a TUI opens.
2. the TUI has 2 tabs: agent with a role `manager` and agent with a role `worker`.
3. I can switch tabs to switch between the 2 agents. Each tab contains a prompt input area at the bottom, a screen area to display the conversation, etc.
4. I can issue prompts to the agent, and the agent will respond with LLM output, the same way as a pi agent. Each tab is a separate conversation.
5. When there is a file under CWD `my-question.txt` containing text "100+10=?" and I prompt to the `manager`: "Write the answer of my question in the file `my-question.txt` to file `my-answer.txt`", the `manager` will later inform me that the task is done, and the file `my-answer.txt` will contain `110`.
6. While the task is being worked on, I can issue another prompt to the `manager`: "Tell me a joke", and the `manager` will tell me a joke, possibly before the task is done.

## Scenario 3: switch teams `[Day 2+]` (TUI flow)
1. Under the dir `/tmp/workspace/my-project3/`, when there are  2 team manifests `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`.
2. When I run `jie` under the dir `/tmp/workspace/my-project3/`, a TUI opens with tab(s) containing `my-team-1`'s agent(s).
3. When I prompt: "Tell me the sum of 1+2", then I should got some response about "3" in the conversation area.
4. when I use cmd `/team my-team-2` to switch to team `my-team-2`, the TUI tabs change to `my-team-2`'s agent(s), the conversation area is clean.
5. when I use cmd `/team my-team-1` to switch back to team `my-team-1`, the TUI tabs change to `my-team-1`'s agent(s), the conversation area contains the previous conversation with `my-team-1`'s agent.
6. When I type the cmd `/team`, a list of teams is shown, and I can select one to switch to. I can also type some text to filter the list of teams, just like pi's selection filter.

### select team with cli `[v1]` (CLI error path); the TUI part of this section is `[Day 2+]`
1. Under the dir `/tmp/workspace/my-project3/`, when there are  2 team manifests `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`.
2. when I run `jie --team wrong-team` under the dir `/tmp/workspace/my-project3/`, an error message is printed and the process exits 1.
3. when I run `jie --team my-team-2` under the dir `/tmp/workspace/my-project3/`, a TUI opens with tab(s) containing `my-team-2`'s agent(s).
4. I can use cmd `/team my-team-1` to switch to team `my-team-1`.

### select team with -p `[v1]`
1. Under the dir `/tmp/workspace/my-project3/`, when there are  2 team manifests `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`.
2. when I run `jie --team my-team-2 -p "Tell me a story"` under the dir `/tmp/workspace/my-project3/`, response "Once upon a time..." is streamed to stdout, ending with a final newline.
3. the process exits 0.
4. when I run `jie --team my-team-1 -p "Tell me a story"` under the dir `/tmp/workspace/my-project3/`, response "Marry had a little lamb" is streamed to stdout, ending with a final newline.
5. the process exits 0.

`agent-1.md` under `.jie/teams/my-team-1/` contains:
```
---
When the user asks you to tell a story, respond: "Marry had a little lamb".
```

`agent-2.md` under `.jie/teams/my-team-2/` contains:
```
---
When the user asks you to tell a story, respond: "Once upon a time..."
```

## Scenario 4: one-shot print mode `[v1]`
1. when I run `jie -p "List files under current dir"` under a dir without any config or team definitions, no TUI opens; the command blocks.
2. streamed chunks print to stdout, ending with a final newline.
3. the process exits 0.

### one-shot print mode in a team `[v1]`
1. when I run `jie -p "List files under current dir"` under a dir with a team definition (see below team-A), no TUI opens; the command blocks.
2. response is streamed to stdout, ending with a final newline. The content should mean the task has been completed.
3. the process exits 0.
(after the leader passes the task to the worker, the leader becomes idle but the workder is busy, jie should not exist until all agents are idle)

## Scenario 6: first-time setup `[v1]` (CLI flow)
1. on a fresh machine without user scope config, I run `jie -p "Tell me a joke"` under any directory without project scope config. Startup exits 1 with: `No model has been selected, please login and select a default model.`
2. I run `jie login`, pick `anthropic`, paste API key — `~/.jie/auth.json` exists and saves the API key. (follow pi convention)
3. I run `jie model anthropic/claude-sonnet-4-5` — `~/.jie/settings.json` contains `defaultProvider: anthropic` and `defaultModel: claude-sonnet-4-5` . (follow pi convention)
4. I run `jie -p "Tell me a joke"` again. Response is streamed to stdout, ending with a final newline.
5. the process exits 0.

### first-time setup with TUI `[Day 2+]`
1. on a fresh machine without user scope config, I run `jie` under any directory without project scope config. A TUI opens.
2. the TUI only contains 1 tab: agent with a role `general`.
3. when I send a prompt "Tell me a joke", erro info is displayed: `No model has been selected, please login and select a default model.`
4. I run `/login`, pick `anthropic`, paste API key — `~/.jie/auth.json` exists and saves the API key.(follow pi convention)
5. I run `/model`, and pick `anthropic/claude-sonnet-4-5` — `~/.jie/settings.json` contains `defaultProvider: anthropic` and `defaultModel: claude-sonnet-4-5`. (follow pi convention)
6. I send a prompt "Tell me a joke". Response is streamed to the conversation area.
7. when I press ctl+D, the process exits 0.

## Scenario 7: MCP-backed tools `[Day 2+]` (MCP client deferred per ADR 17)
1. `./e2e/test-mcp/.jie/mcp.json` configures a `mock-mcp-server` server; the mcp server exposes 3 tools `mock-tool-A1`, `mock-tool-A2`, `mock-tool-B1`.
2. `./e2e/test-mcp/.jie/teams/my-team/` contains a single `my-agent.md` file.
2. when I run `jie -p "Call all your mcp tools"` under the `./e2e/test-mcp/`, the mcp server's `mock-tool-A1` and `mock-tool-A2` are invoked, `mock-tool-B1` is not invoked.
3. after some response is streamed to stdout, the process exits 0.

`my-agent.md`
```
---
tools: [mcp:mock-mcp-server:mock-tool-A*]
---
```

## Scenario 9: queued prompts while leader is busy `[Day 2+]`
1. when I run `jie` under `/tmp/workspace/my-project9/` without any config or team definitions, a TUI opens.
1. I prompt: "Research the history of J and write a simple description to `notes.md`."
2. while the agent is busy, I type: "Also write me a haiku about it in the same file." I can see the prompt is queued. (follow pi convention)
3. after the agent becomes idle, I have `notes.md` containing both the description and the haiku.
4. when I press ctl+D, the process exits 0.


## team-A-blueprint

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
