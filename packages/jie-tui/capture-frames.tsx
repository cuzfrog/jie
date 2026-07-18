#!/usr/bin/env bun
/**
 * Frame-capture harness for jie-tui.
 *
 * Renders the real <App> through the same ink renderer used by tests
 * (see packages/jie-tui/test-renderer.ts), but drives it through a list
 * of scenarios so each one leaves behind a text dump of every rendered
 * frame in ./frames/<scenario>/<step>.txt.
 *
 * This is the dev tool we use to review what jie's TUI *actually*
 * looks like, screen by screen, without needing a real terminal.
 *
 * Usage:
 *   bun tmp/capture-frames.ts [--scenario name] [--out dir]
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { Events } from "@cuzfrog/jie-platform";
import { App } from "./components/index";
import { render } from "./test-renderer";
import { Actions, createStateStore } from "./state";

type Step = {
  readonly label: string;
  readonly setup?: (stateStore: ReturnType<typeof createStateStore>) => void;
};

type Scenario = {
  readonly name: string;
  readonly columns: number;
  readonly rows: number;
  readonly steps: ReadonlyArray<Step>;
};

const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    name: "01-startup-empty",
    columns: 120,
    rows: 30,
    steps: [
      { label: "00-boot" },
      {
        label: "01-env-set",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
        },
      },
      {
        label: "02-team-loaded",
        setup: (s) => {
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                  { teamId: "main", role: "helper", agentKey: "helper-1", isLeader: false, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                  { teamId: "main", role: "specialist", agentKey: "specialist-1", isLeader: false, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
    ],
  },
  {
    name: "02-startup-rail-open",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                  { teamId: "main", role: "helper", agentKey: "helper-1", isLeader: false, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                  { teamId: "main", role: "specialist", agentKey: "specialist-1", isLeader: false, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-toggle-rail",
        setup: (s) => {
          s.dispatch(Actions.toggleTeamRail());
        },
      },
    ],
  },
  {
    name: "03-user-turn-streaming",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-user-prompt",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "main", "Tell me about Go generics.", "general-1")));
        },
      },
      {
        label: "02-turn-start",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "main", agentKey: "general-1" })));
        },
      },
      {
        label: "03-stream-text-chunk",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 0, "text", "Go 1.18 added generics to the language. ")));
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 1, "text", "Type parameters look like `[T any]` or `[T comparable]`.\n\n")));
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 2, "text", "They enable writing functions that work on any type while still being type-safe.")));
        },
      },
      {
        label: "04-stream-thinking-chunk",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 3, "thinking", "Let me think about whether to mention type inference here.")));
        },
      },
      {
        label: "05-stream-end-idle",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentStreamEnd({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 4)));
          s.dispatch(Actions.receiveEvent(Events.agentIdle({ kind: "agent", teamId: "main", agentKey: "general-1" }, "stop")));
          s.dispatch(Actions.receiveEvent(Events.agentUsage({ kind: "agent", teamId: "main", agentKey: "general-1" }, { input: 320, output: 88, cacheRead: 0, cacheWrite: 0, totalTokens: 408 })));
        },
      },
    ],
  },
  {
    name: "04-tool-call-card",
    columns: 120,
    rows: 40,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-user-prompt-and-turn",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "main", "Run `ls -la`.", "general-1")));
          s.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "main", agentKey: "general-1" })));
        },
      },
      {
        label: "02-tool-call",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentToolCall({ kind: "agent", teamId: "main", agentKey: "general-1" }, "c1", "bash", "ls -la")));
        },
      },
      {
        label: "03-tool-result",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentToolResult(
            { kind: "agent", teamId: "main", agentKey: "general-1" },
            "c1",
            "bash",
            "drwxr-xr-x 2 cuz cuz 4096 Jul 17 18:30 .\ndrwxr-xr-x 5 cuz cuz 4096 Jul 14 09:05 ..\n-rw-r--r-- 1 cuz cuz 10006 Jul 12 21:18 CLAUDE.md",
            142,
            null,
            null,
          )));
        },
      },
      {
        label: "04-final-text-and-idle",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 0, "text", "Listed the directory. There are 3 entries.")));
          s.dispatch(Actions.receiveEvent(Events.agentStreamEnd({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 1)));
          s.dispatch(Actions.receiveEvent(Events.agentIdle({ kind: "agent", teamId: "main", agentKey: "general-1" }, "stop")));
        },
      },
    ],
  },
  {
    name: "05-editor-text-and-banners",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-typing-text",
        setup: (s) => {
          s.dispatch(Actions.setEditorText("Hello, jie!"));
        },
      },
      {
        label: "02-error-banner",
        setup: (s) => {
          s.dispatch(Actions.setErrorMessage("boom: provider rejected the request"));
        },
      },
      {
        label: "03-transient-banner",
        setup: (s) => {
          s.dispatch(Actions.setTransientMessage("Session resumed."));
        },
      },
      {
        label: "04-cleared-typing",
        setup: (s) => {
          s.dispatch(Actions.clearBanners());
          s.dispatch(Actions.setEditorText("/model lm-studio/ornith-1.0-9b-mtp"));
        },
      },
    ],
  },
  {
    name: "06-slash-and-file-mention",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-slash-prefix",
        setup: (s) => {
          s.dispatch(Actions.setEditorText("/"));
        },
      },
      {
        label: "02-slash-resume",
        setup: (s) => {
          s.dispatch(Actions.setEditorText("/res"));
        },
      },
      {
        label: "03-file-mention-prefix",
        setup: (s) => {
          s.dispatch(Actions.setEditorText("look at @"));
        },
      },
    ],
  },
  {
    name: "07-session-picker",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-picker-open",
        setup: (s) => {
          s.dispatch(Actions.openSessionPicker([
            { sessionId: "sess-abc", lastActivity: new Date(Date.now() - 60_000).toISOString(), messageCount: 4 },
            { sessionId: "sess-def", lastActivity: new Date(Date.now() - 5 * 60_000).toISOString(), messageCount: 9 },
            { sessionId: "sess-ghi", lastActivity: new Date(Date.now() - 30 * 60_000).toISOString(), messageCount: 1 },
          ]));
        },
      },
      {
        label: "02-picker-typed",
        setup: (s) => {
          s.dispatch(Actions.setPickerQuery("ab"));
        },
      },
    ],
  },
  {
    name: "08-context-near-full",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 1000 } },
                ],
              }),
            ),
          );
          s.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "main", "x".repeat(8000), "general-1")));
          s.dispatch(Actions.receiveEvent(Events.agentUsage({ kind: "agent", teamId: "main", agentKey: "general-1" }, { input: 950, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 950 })));
        },
      },
    ],
  },
  {
    name: "09-todo-list",
    columns: 120,
    rows: 30,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
          s.dispatch(Actions.receiveEvent(Events.agentToolResult(
            { kind: "agent", teamId: "main", agentKey: "general-1" },
            "c1",
            "todo_write",
            "ok",
            5,
            null,
            {
              kind: "todos",
              todos: [
                { content: "Read CLAUDE.md", status: "completed" },
                { content: "Survey TUI components", status: "completed" },
                { content: "Build frame capture harness", status: "in_progress" },
                { content: "Review frames for issues", status: "pending" },
                { content: "Fix rendering bugs", status: "pending" },
              ],
            },
          )));
        },
      },
    ],
  },
  {
    name: "10-scroll-hud",
    columns: 120,
    rows: 18,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
        },
      },
      {
        label: "01-many-turns",
        setup: (s) => {
          for (let i = 0; i < 12; i++) {
            s.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "main", `Question ${i + 1}: What is a closure in JavaScript? Please answer in 3 lines.`, "general-1")));
            s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, i + 1, 0, "text", `Answer ${i + 1}: A closure is a function bundled with references to its surrounding lexical scope.`)));
            s.dispatch(Actions.receiveEvent(Events.agentStreamEnd({ kind: "agent", teamId: "main", agentKey: "general-1" }, i + 1, 1)));
            s.dispatch(Actions.receiveEvent(Events.agentIdle({ kind: "agent", teamId: "main", agentKey: "general-1" }, "stop")));
          }
        },
      },
      {
        label: "02-scroll-up",
        setup: (s) => {
          s.dispatch(Actions.scrollChat("main:general-1", 8));
        },
      },
    ],
  },
  {
    name: "11-thinking-and-tool-expanded",
    columns: 120,
    rows: 40,
    steps: [
      {
        label: "00-boot",
        setup: (s) => {
          s.dispatch(Actions.setEnvironment("/home/cuz/workspace/jie", "dev_tui_features", true));
          s.dispatch(
            Actions.receiveEvent(
              Events.teamLoaded({ kind: "system" }, {
                id: "main",
                leaderKey: "general-1",
                agents: [
                  { teamId: "main", role: "general", agentKey: "general-1", isLeader: true, model: { provider: "lm-studio", id: "ornith-1.0-9b-mtp", effort: "off", contextWindow: 100000 } },
                ],
              }),
            ),
          );
          s.dispatch(Actions.toggleThinking());
          s.dispatch(Actions.toggleToolCards());
        },
      },
      {
        label: "01-turn-with-cards-and-thinking",
        setup: (s) => {
          s.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "main", "Inspect /tmp", "general-1")));
          s.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "main", agentKey: "general-1" })));
          s.dispatch(Actions.receiveEvent(Events.agentToolCall({ kind: "agent", teamId: "main", agentKey: "general-1" }, "c1", "read_file", "/tmp/missing.txt")));
          s.dispatch(Actions.receiveEvent(Events.agentToolResult({ kind: "agent", teamId: "main", agentKey: "general-1" }, "c1", "read_file", null, 18, "ENOENT: no such file or directory", null)));
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 0, "thinking", "The file doesn't exist. I'll explain that and suggest creating it.")));
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 1, "text", "I tried to read `/tmp/missing.txt` but it doesn't exist on disk. ")));
          s.dispatch(Actions.receiveEvent(Events.agentStreamChunk({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 2, "text", "Want me to create an empty stub?")));
          s.dispatch(Actions.receiveEvent(Events.agentStreamEnd({ kind: "agent", teamId: "main", agentKey: "general-1" }, 1, 3)));
          s.dispatch(Actions.receiveEvent(Events.agentIdle({ kind: "agent", teamId: "main", agentKey: "general-1" }, "stop")));
        },
      },
    ],
  },
];

function ansiAwareFrameToText(frame: string): string {
  // Frame buffer emits ANSI escapes. For our "what does the screen look like"
  // viewing we strip color but keep layout-affecting escapes (cursor / clear).
  return frame.replace(/\[[0-9;]*m/g, "");
}

async function capture(scenario: Scenario, outDir: string): Promise<void> {
  const dir = resolve(outDir, scenario.name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const stateStore = createStateStore();
  const instance = render(
    <App stateStore={stateStore} />,
    { stdoutIsTTY: true },
  );
  instance.stdout.columns = scenario.columns;
  instance.stdout.rows = scenario.rows;
  // Force the App to re-read window size after we mutate the stream.
  instance.stdout.emit("resize");

  // Wait one tick for the initial render.
  await new Promise((r) => setTimeout(r, 100));

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i]!;
    step.setup?.(stateStore);
    await new Promise((r) => setTimeout(r, 100));
    await instance.waitUntilRenderFlush();
    const frame = instance.lastFrame() ?? "";
    const file = resolve(dir, `${String(i).padStart(2, "0")}-${step.label}.txt`);
    const text = [
      `// scenario: ${scenario.name}`,
      `// step:     ${step.label}`,
      `// cols:     ${scenario.columns}  rows: ${scenario.rows}`,
      `// raw frame (ansi stripped, layout retained):`,
      "",
      ansiAwareFrameToText(frame),
      "",
      "// raw frame (full ansi, original):",
      "",
      frame,
      "",
    ].join("\n");
    await writeFile(file, text);
  }

  instance.unmount();
  instance.cleanup();
  await new Promise((r) => setTimeout(r, 100));
  process.stdout.write(`  captured ${scenario.steps.length} step(s)\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let outDir = "../../tmp/frames";
  let onlyName: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") {
      outDir = args[++i] ?? outDir;
    } else if (a === "--scenario") {
      onlyName = args[++i] ?? null;
    }
  }
  await mkdir(outDir, { recursive: true });
  process.stdout.write(`capturing frames -> ${resolve(outDir)}\n`);
  for (const scenario of SCENARIOS) {
    if (onlyName !== null && scenario.name !== onlyName) continue;
    process.stdout.write(`- ${scenario.name}\n`);
    await capture(scenario, outDir);
  }
  process.stdout.write("done\n");
}

await main();