import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Events, type AnyEventEnvelope, type EventEnvelope, type EventType, type JiePlatform, type SessionSummary } from "@cuzfrog/jie-platform";
import { visibleWidth } from "@earendil-works/pi-tui";
import { bootTui, type TuiCradle } from "../container";
import type { Tui } from "../tui";
import { VirtualTerminal } from "./virtual-terminal";

const COLS = 80;
const ROWS = 24;
const UTF8_LOCALE = "en_US.UTF-8";
const AGENT_SENDER = { kind: "agent", teamId: "my-team", agentKey: "general-1" } as const;
const TEAM_LOADED = Events.teamLoaded({ kind: "system" }, {
  id: "my-team",
  leaderKey: "general-1",
  history: [],
  agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
});
const SESSIONS: ReadonlyArray<SessionSummary> = [
  { sessionId: "alpha-1", messageCount: 3, lastActivity: "2026-07-21T00:00:00.000Z" },
];

class ScreenStdin extends PassThrough {
  isTTY = true;
  ref(): this { return this; }
  unref(): this { return this; }
  setRawMode(): this { return this; }
  setEncoding(): this { return this; }
  resume(): this { super.resume(); return this; }
  pause(): this { super.pause(); return this; }
}

class ScreenStdout extends PassThrough {
  columns = COLS;
  rows = ROWS;
}

interface ScreenHarness {
  readonly tui: Tui;
  readonly stateStore: TuiCradle["stateStore"];
  readonly stdin: ScreenStdin;
  readonly vt: VirtualTerminal;
  emit(event: AnyEventEnvelope): void;
}

async function bootScreen(): Promise<ScreenHarness> {
  const vt = new VirtualTerminal(COLS, ROWS);
  const stdin = new ScreenStdin();
  const stdout = new ScreenStdout();
  stdout.on("data", (chunk: Buffer) => vt.write(chunk.toString("utf8")));
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const previousLang = process.env.LANG;
  process.env.LANG = UTF8_LOCALE;
  try {
    const cradle = bootTui({ cwd: "/repo" }, { platform: makePlatform(handlers), homeJieDir: join(tmpdir(), "jie-tui-screen-home"), stdin, stdout }).cradle;
    void cradle.tui.start();
    await vt.waitForRender();
    return {
      tui: cradle.tui,
      stateStore: cradle.stateStore,
      stdin,
      vt,
      emit: (event) => { handlers.get(event.type)?.(event); },
    };
  } finally {
    assignOrDeleteLang(previousLang);
  }
}

function makePlatform(handlers: Map<EventType, (env: AnyEventEnvelope) => void>): JiePlatform {
  return {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as (env: AnyEventEnvelope) => void;
      handlers.set(topic, handler);
      return (): void => {
        if (handlers.get(topic) === handler) handlers.delete(topic);
      };
    },
    prompt: () => undefined,
    interrupt: () => undefined,
    execute: ((command: { readonly name: string }) => {
      if (command.name === "listSessions") return Promise.resolve(SESSIONS);
      return Promise.resolve(null);
    }) as JiePlatform["execute"],
    teams: () => [],
  };
}

async function typeText(harness: ScreenHarness, text: string): Promise<void> {
  for (const char of text) {
    harness.stdin.write(char);
    await nextImmediate();
  }
  await harness.vt.waitForRender();
}

async function press(harness: ScreenHarness, data: string): Promise<void> {
  harness.stdin.write(data);
  await nextImmediate();
  await harness.vt.waitForRender();
}

async function settle(harness: ScreenHarness): Promise<void> {
  await sleep(60);
  await harness.vt.waitForRender();
}

describe("screen rendering", () => {
  test("streamed assistant text lands in the terminal viewport", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      harness.emit(Events.agentTurnStart(AGENT_SENDER));
      harness.emit(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "hello screen world"));
      await settle(harness);
      const screen = harness.vt.getViewport().join("\n");
      expect(screen).toContain("hello screen world");
      expect(screen).toContain("●");
    } finally {
      harness.tui.stop();
    }
  });

  test("fenced code blocks render with language syntax highlighting", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      harness.emit(Events.agentTurnStart(AGENT_SENDER));
      harness.emit(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "```ts\nconst x = 1;\n```"));
      await settle(harness);
      const styled = harness.vt.getStyledViewport().join("\n");
      expect(styled).toContain("\x1b[36mconst\x1b[39m");
    } finally {
      harness.tui.stop();
    }
  });

  test("shift+left toggles the team panel beside the chat", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      await press(harness, "\x1b[1;2D");
      await settle(harness);
      const shown = harness.vt.getScrollBuffer().map(stripAnsi).join("\n");
      expect(shown).toContain("★");
      expect(shown.split("\n").some((line) => line.includes("│") && line.includes("general-1"))).toBe(true);
      await press(harness, "\x1b[1;2D");
      expect(harness.vt.getViewport().map(stripAnsi).join("\n")).not.toContain("│");
    } finally {
      harness.tui.stop();
    }
  });

  test("the resume autocomplete lists sessions in-flow and the editor stays visible", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      await typeText(harness, "/resume ");
      await settle(harness);
      const opened = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(opened).toContain("alpha-1");
      expect(opened).toContain("─");
      await press(harness, "\x1b");
      await settle(harness);
      const closed = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(closed).not.toContain("alpha-1");
      expect(closed).toContain("─");
      await typeText(harness, "x");
      expect(harness.stateStore.getState().editorText).toBe("/resume x");
    } finally {
      harness.tui.stop();
    }
  });

  test("bare '/' lists commands with the hint-and-description column", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      await typeText(harness, "/");
      await settle(harness);
      const screen = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(screen).toContain("<provider> <apiKey> — store a provider API key");
      expect(screen).toContain("show this help");
    } finally {
      harness.tui.stop();
    }
  });

  test("/help reprints the welcome info into the chat area", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      await typeText(harness, "/help");
      await press(harness, "\r");
      await settle(harness);
      expect(harness.stateStore.getState().infoEntries.length).toBe(1);
      const screen = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(screen).toContain("/resume");
      expect(screen).toContain("COMMANDS");
      expect(screen).toContain("mention a file");
    } finally {
      harness.tui.stop();
    }
  });

  test("long content with expanded tool cards renders without crashing the frame", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      harness.emit(Events.agentTurnStart(AGENT_SENDER));
      harness.emit(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "x".repeat(500)));
      harness.emit(Events.agentToolCall(AGENT_SENDER, "c1", "bash", "y".repeat(500)));
      harness.emit(Events.agentToolResult(
        AGENT_SENDER,
        "c1",
        "bash",
        JSON.stringify({ content: "z".repeat(500), details: null, terminate: false }),
        5,
        null,
        null,
      ));
      harness.emit(Events.agentIdle(AGENT_SENDER, "stop"));
      await press(harness, "\x0f");
      await settle(harness);
      const lines = harness.vt.getViewport();
      const screen = lines.join("\n");
      expect(screen).toContain("x".repeat(60));
      expect(screen).toContain("y".repeat(60));
      expect(screen).toContain("z".repeat(60));
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(COLS);
      }
    } finally {
      harness.tui.stop();
    }
  });

  test("the working slot shows the spinner while busy, a static Interrupted after an abort, and clears on the next turn", async () => {
    const harness = await bootScreen();
    try {
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      harness.emit(Events.agentTurnStart(AGENT_SENDER));
      await settle(harness);
      const busy = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(busy).toContain("Working…");
      expect(harness.stateStore.getState().interruptedAgentId).toBeNull();
      harness.emit(Events.agentIdle(AGENT_SENDER, "aborted"));
      await settle(harness);
      const interrupted = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(interrupted).toContain("Interrupted");
      expect(interrupted).not.toContain("Working…");
      expect(harness.stateStore.getState().interruptedAgentId).toBe("my-team:general-1");
      harness.emit(Events.agentTurnStart(AGENT_SENDER));
      await settle(harness);
      const resumed = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(resumed).toContain("Working…");
      expect(resumed).not.toContain("Interrupted");
      harness.emit(Events.agentIdle(AGENT_SENDER, "stop"));
      await settle(harness);
      const cleared = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(cleared).not.toContain("Working…");
      expect(cleared).not.toContain("Interrupted");
    } finally {
      harness.tui.stop();
    }
  });

  test("the empty screen shows the welcome splash above the editor and clears it once a turn streams", async () => {
    const harness = await bootScreen();
    try {
      const initial = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(initial).toContain("multi-agent coding");
      expect(initial).toContain("█▀▀▀▀█▀▀▀▀█");
      expect(initial).toContain("COMMANDS");
      expect(initial).toContain("/resume");
      harness.emit(TEAM_LOADED);
      await harness.vt.waitForRender();
      const withTeam = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(withTeam).toContain("team my-team");
      expect(withTeam).toContain("general-1 (leader)");
      expect(withTeam).toContain("COMMANDS");
      harness.emit(Events.agentTurnStart(AGENT_SENDER));
      harness.emit(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "hello splash"));
      await settle(harness);
      const after = harness.vt.getViewport().map(stripAnsi).join("\n");
      expect(after).toContain("hello splash");
      expect(after).not.toContain("COMMANDS");
      expect(after).not.toContain("multi-agent coding");
    } finally {
      harness.tui.stop();
    }
  });
});

function assignOrDeleteLang(value: string | undefined): void {
  if (value === undefined) delete process.env.LANG;
  else process.env.LANG = value;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function nextImmediate(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
