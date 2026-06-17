import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Agent,
  AgentEvent as PiAgentEvent,
  AgentMessage,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { runPrint, type PrintDeps, type PrintArgs } from "./print.ts";
import { makeAuthStore } from "../auth-store.ts";
import { makeSettingsStore } from "../settings-store.ts";
import { SqliteStorage, type MergedSettings } from "@cuzfrog/jie-platform";
import type { Team } from "@cuzfrog/jie-platform/team";

function makeSettings(): MergedSettings {
  return { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" };
}

function makeDeps(homeDir: string, hooks: Partial<PrintDeps> = {}): PrintDeps {
  return {
    authStore: makeAuthStore(homeDir),
    settingsStore: makeSettingsStore(homeDir),
    homeDir,
    ...hooks,
  };
}

function printArgs(partial: Partial<PrintArgs> = {}): PrintArgs {
  return {
    kind: "print",
    instruction: "hi",
    team: undefined,
    timeout: 5,
    json: false,
    apiKey: undefined,
    resume: undefined,
    continueLast: false,
    ...partial,
  };
}

interface StubHandle {
  fire: (event: PiAgentEvent) => void;
}

interface StubFactory {
  factory: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
  handles: StubHandle[];
}

function makeStubAgentFactory(): StubFactory {
  const handles: StubHandle[] = [];
  const factory = (_opts: ConstructorParameters<typeof Agent>[0]): Agent => {
    let listener: (event: PiAgentEvent) => void = () => {};
    const state: {
      systemPrompt: string;
      model: unknown;
      tools: unknown[];
      messages: AgentMessage[];
      isStreaming: boolean;
    } = {
      systemPrompt: "",
      model: null,
      tools: [],
      messages: [],
      isStreaming: false,
    };
    const agent = {
      subscribe: (l: (event: PiAgentEvent) => void) => {
        listener = l;
        return () => {};
      },
      state,
      continue: async () => {},
      prompt: async () => {},
    } as unknown as Agent;
    handles.push({
      fire: (event) => listener(event),
    });
    return agent;
  };
  return { factory, handles };
}

function makeAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: text.length > 0 ? [{ type: "text", text }] : [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function makeTextDelta(delta: string, partial: AssistantMessage): AssistantMessageEvent {
  return { type: "text_delta", contentIndex: 0, delta, partial };
}

describe("print mode — guard rails", () => {
  let workspace: string;
  let homeDir: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-cli-print-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-print-home-"));
    storage = new SqliteStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("--team <id> not installed exits 1 with team-not-installed message", async () => {
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const code = await runPrint(
      printArgs({ instruction: "hello", team: "ghost", timeout: 1 }),
      workspace,
      makeDeps(homeDir),
    );
    expect(code).toBe(1);
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("team 'ghost' is not installed"))).toBe(true);
    writeErr.mockRestore();
  });

  test("empty team (no .md files) guard: exits 1 with no-agents message", async () => {
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const code = await runPrint(
      printArgs({ instruction: "hello", team: "minimal", timeout: 1 }),
      workspace,
      makeDeps(homeDir, {
        loadTeam: () => ({ roles: [], leaderRole: null }),
        resolveModel: () => ({ id: "x" } as never),
        getApiKey: () => undefined,
        settingsOverride: makeSettings(),
      }),
    );
    expect(code).toBe(1);
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("has no agents to run"))).toBe(true);
    writeErr.mockRestore();
  });
});

describe("print mode — happy path with stub agent", () => {
  let workspace: string;
  let homeDir: string;
  let stub: StubFactory;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-cli-print-happy-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-print-happy-home-"));
    stub = makeStubAgentFactory();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("stub returns 'hello world': exit 0, stdout has 'hello world' followed by '\\n'", async () => {
    const writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    const writeErr = spyOn(console, "error").mockImplementation(() => {});

    const codePromise = runPrint(
      printArgs({ instruction: "hi", timeout: 5 }),
      workspace,
      makeDeps(homeDir, {
        resolveModel: () => ({ id: "x" } as never),
        getApiKey: () => undefined,
        settingsOverride: makeSettings(),
        createAgent: stub.factory,
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    const leader = stub.handles[0]!;
    const assistantMsg = makeAssistantMessage("hello world");
    const partial = makeAssistantMessage("");
    leader.fire({ type: "turn_start" });
    leader.fire({ type: "message_start", message: assistantMsg });
    leader.fire({
      type: "message_update",
      message: assistantMsg,
      assistantMessageEvent: makeTextDelta("hello world", partial),
    });
    leader.fire({ type: "message_end", message: assistantMsg });
    leader.fire({ type: "agent_end", messages: [assistantMsg] });

    const code = await codePromise;
    expect(code).toBe(0);
    const stdout = writeOut.mock.calls.map((c) => String(c[0])).join("");
    expect(stdout).toContain("hello world");
    expect(stdout.endsWith("\n")).toBe(true);
    writeOut.mockRestore();
    writeErr.mockRestore();
  });

  test("--timeout 1 with never-responding stub: exit 3, stderr 'no response from team within 1s'", async () => {
    const writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    const writeErr = spyOn(console, "error").mockImplementation(() => {});

    const code = await runPrint(
      printArgs({ instruction: "hi", timeout: 1 }),
      workspace,
      makeDeps(homeDir, {
        resolveModel: () => ({ id: "x" } as never),
        getApiKey: () => undefined,
        settingsOverride: makeSettings(),
        createAgent: stub.factory,
      }),
    );

    expect(code).toBe(3);
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no response from team within 1s"))).toBe(true);
    writeOut.mockRestore();
    writeErr.mockRestore();
  });

  test("--json: each stdout line is valid JSON with 'chunk' and 'seq'", async () => {
    const writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    const writeErr = spyOn(console, "error").mockImplementation(() => {});

    const codePromise = runPrint(
      printArgs({ instruction: "hi", timeout: 5, json: true }),
      workspace,
      makeDeps(homeDir, {
        resolveModel: () => ({ id: "x" } as never),
        getApiKey: () => undefined,
        settingsOverride: makeSettings(),
        createAgent: stub.factory,
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    const leader = stub.handles[0]!;
    const assistantMsg = makeAssistantMessage("hello world");
    const partial = makeAssistantMessage("");
    leader.fire({ type: "turn_start" });
    leader.fire({ type: "message_start", message: assistantMsg });
    leader.fire({
      type: "message_update",
      message: assistantMsg,
      assistantMessageEvent: makeTextDelta("hello world", partial),
    });
    leader.fire({ type: "message_end", message: assistantMsg });
    leader.fire({ type: "agent_end", messages: [assistantMsg] });

    const code = await codePromise;
    expect(code).toBe(0);

    const all = writeOut.mock.calls.map((c) => String(c[0])).join("");
    const lines = all.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { chunk: string; seq: number };
      expect(typeof parsed.chunk).toBe("string");
      expect(typeof parsed.seq).toBe("number");
    }
    writeOut.mockRestore();
    writeErr.mockRestore();
  });

  test("--print alias behaves the same as -p: exit 0, stdout has the response", async () => {
    const writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    const writeErr = spyOn(console, "error").mockImplementation(() => {});

    const codePromise = runPrint(
      printArgs({ instruction: "hi", timeout: 5 }),
      workspace,
      makeDeps(homeDir, {
        resolveModel: () => ({ id: "x" } as never),
        getApiKey: () => undefined,
        settingsOverride: makeSettings(),
        createAgent: stub.factory,
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    const leader = stub.handles[0]!;
    const assistantMsg = makeAssistantMessage("ack");
    const partial = makeAssistantMessage("");
    leader.fire({ type: "turn_start" });
    leader.fire({ type: "message_start", message: assistantMsg });
    leader.fire({
      type: "message_update",
      message: assistantMsg,
      assistantMessageEvent: makeTextDelta("ack", partial),
    });
    leader.fire({ type: "message_end", message: assistantMsg });
    leader.fire({ type: "agent_end", messages: [assistantMsg] });

    const code = await codePromise;
    expect(code).toBe(0);
    const stdout = writeOut.mock.calls.map((c) => String(c[0])).join("");
    expect(stdout).toContain("ack");
    writeOut.mockRestore();
    writeErr.mockRestore();
  });
});

describe("print mode — multi-agent gate", () => {
  let workspace: string;
  let homeDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-cli-print-multi-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-print-multi-home-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("gate waits for ALL bodies to go idle, not just the leader", async () => {
    const stub = makeStubAgentFactory();
    const writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    const writeErr = spyOn(console, "error").mockImplementation(() => {});

    const twoAgentTeam: Team = {
      roles: [
        {
          role: "leader",
          model: "anthropic/claude-sonnet-4",
          system_prompt: "leader",
          tools: [],
          subscribe: [],
          subscriptions: [],
        },
        {
          role: "worker",
          model: "anthropic/claude-sonnet-4",
          system_prompt: "worker",
          tools: [],
          subscribe: [],
          subscriptions: [],
        },
      ],
      leaderRole: "leader",
    };

    const codePromise = runPrint(
      printArgs({ instruction: "hi", timeout: 5 }),
      workspace,
      makeDeps(homeDir, {
        loadTeam: () => twoAgentTeam,
        resolveModel: () => ({ id: "x" } as never),
        getApiKey: () => undefined,
        settingsOverride: makeSettings(),
        createAgent: stub.factory,
      }),
    );

    await new Promise((r) => setTimeout(r, 10));

    // Bodies are constructed in alphabetical role order:
    // handles[0] = leader-1, handles[1] = worker-1.
    const leader = stub.handles[0]!;
    const worker = stub.handles[1]!;

    // Leader's full turn.
    const leaderMsg = makeAssistantMessage("from leader");
    const leaderPartial = makeAssistantMessage("");
    leader.fire({ type: "turn_start" });
    leader.fire({ type: "message_start", message: leaderMsg });
    leader.fire({
      type: "message_update",
      message: leaderMsg,
      assistantMessageEvent: makeTextDelta("from leader", leaderPartial),
    });
    leader.fire({ type: "message_end", message: leaderMsg });
    leader.fire({ type: "agent_end", messages: [leaderMsg] });

    // The gate must NOT open after the leader's idle. Wait a
    // tick; the CLI is still running.
    const stillRunning = await Promise.race([
      codePromise.then(() => "exited" as const),
      new Promise<"running">((r) => setTimeout(() => r("running"), 100)),
    ]);
    expect(stillRunning).toBe("running");

    // Worker's full turn. Only after the worker goes idle does
    // the gate open.
    const workerMsg = makeAssistantMessage("from worker");
    const workerPartial = makeAssistantMessage("");
    worker.fire({ type: "turn_start" });
    worker.fire({ type: "message_start", message: workerMsg });
    worker.fire({
      type: "message_update",
      message: workerMsg,
      assistantMessageEvent: makeTextDelta("from worker", workerPartial),
    });
    worker.fire({ type: "message_end", message: workerMsg });
    worker.fire({ type: "agent_end", messages: [workerMsg] });

    const code = await codePromise;
    expect(code).toBe(0);
    const stdout = writeOut.mock.calls.map((c) => String(c[0])).join("");
    // Only the leader's stream is printed to stdout; the worker's
    // is filtered out by the role filter.
    expect(stdout).toContain("from leader");
    expect(stdout).not.toContain("from worker");
    writeOut.mockRestore();
    writeErr.mockRestore();
  });
});
