# User Scenarios

The v1 acceptance surface. Each scenario describes a sequence of user actions and the platform's expected behavior.

## Scenario 1: one-shot print mode `[v1]`

1. Run `jie -p "List files under current dir"` in a directory with a text file `file1.txt`, without any team definitions, with local LLM provider and model configured.
2. No TUI opens; the command blocks until completion.
3. Streamed chunks print to stdout, ending with a final newline. The response should contain `file1.txt` to verify the agent has used the `bash` tool to list the files.
4. The process exits 0.

## Scenario 1a: one-shot read and write file `[v1]`
1. Run `jie -p "Read the file1.txt and write its content to file2.txt"` in a directory with a text file `file1.txt`, without any team definitions, with local LLM provider and model configured. The `file1.txt` contains "Hello123888".
2. No TUI opens; the command blocks until completion.
3. Response prints to stdout, ending with a final newline.
4. The process exits 0.
5. `file2.txt` contains "Hello123888"

The platform falls back to the built-in minimal team (per `06-agent-model.md` "Blueprint Loading" and `minimal-team.md`).

## Scenario 2: one-shot print mode with `--team` `[v1]`

1. Under a directory with two team manifests at `.jie/teams/my-team-1/` and `.jie/teams/my-team-2/`.
2. Run `jie --team wrong-team -p "Tell me a story"` — an error message prints, the process exits 1.
3. Run `jie --team my-team-2 -p "Tell me a story"` — response "Once upon a time..." streams to stdout, ending with a final newline.
4. The process exits 0.
5. Run `jie --team my-team-1 -p "Tell me a story"` — response "Marry had a little lamb" streams to stdout, ending with a final newline.
6. The process exits 0.

`my-team-1/<role>.md` instructs the agent to respond with "Marry had a little lamb" when asked for a story. `my-team-2/<role>.md` instructs "Once upon a time...". Two teams with different roles in the same directory, selected one at a time via `--team`.

## Scenario 3: first-time setup `[v1]`

1. On a fresh machine without user-scope config, run `jie -p "Tell me a joke"` under any directory without project-scope config. Startup exits 1 with error info similar to: `No model has been selected, please login and select a default model.`
2. Run `jie login`, pick `nvidia`, paste API key — `~/.jie/auth.json` exists and saves the API key (per pi convention). (The API key can be found from env var `NVIDIA_API_KEY`)
3. Run `jie model nvidia/stepfun-ai/step-3.7-flash` — `~/.jie/settings.json` contains `defaultProvider: nvidia` and `defaultModel: stepfun-ai/step-3.7-flash`.
4. Run `jie -p "Tell me a joke"` again. Response streams to stdout, ending with a final newline.
5. The process exits 0.
