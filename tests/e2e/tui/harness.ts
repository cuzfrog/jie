// e2e test do not wait for intermediate state, it's not reliable. Check the eventual state.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { bootPlatform, type JiePlatform } from "@cuzfrog/jie-platform";
import { bootTui, type CreateTUIOptions, type Tui, type TuiCradle } from "@cuzfrog/jie-tui";
import { writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";

type AgentId = `${string}:${string}`;

const LANG_DEFAULT = "en_US.UTF-8";
const POLL_INTERVAL_MS = 10;

export interface TuiHarness {
  readonly dir: string;
  readonly tui: Tui;
  readonly stateStore: TuiCradle["stateStore"];
  readonly platform: JiePlatform;
  readonly stdin: PassThrough;
  readonly stdout: PassThrough;
  readonly ownedDir: boolean;
}

export interface StartTuiOptions {
  readonly rows?: number;
  readonly cwd?: string;
  readonly resumeSessionId?: string;
}

class TestWritable extends PassThrough {
  columns = 80;
  rows = 30;
  isTTY = true;
}

class TestReadable extends PassThrough {
  isTTY = true;
  ref(): this { return this; }
  unref(): this { return this; }
  setRawMode(): this { return this; }
  setEncoding(): this { return this; }
  resume(): this {
    super.resume();
    return this;
  }
  pause(): this {
    super.pause();
    return this;
  }
}

export async function startTui(opts: StartTuiOptions = {}): Promise<TuiHarness> {
  const dir = opts.cwd ?? mkdtempSync(join(tmpdir(), "jie-tui-e2e-"));
  if (opts.cwd === undefined) {
    writeModelsJsonTo(dir);
    writeSettingsJson(dir);
  }
  const prevLang = process.env.LANG;
  process.env.LANG = LANG_DEFAULT;
  const prevLangAll = process.env.LC_ALL;
  process.env.LC_ALL = LANG_DEFAULT;
  let platformContainer: ReturnType<typeof bootPlatform>;
  try {
    platformContainer = bootPlatform({ cwd: dir, homeJieDir: dir, projectJieDir: dir, resumeSessionId: opts.resumeSessionId });
  } catch (err) {
    restoreLang(prevLang, prevLangAll);
    if (opts.cwd === undefined) rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  const platform = platformContainer.cradle.platform;
  const stdin = new TestReadable();
  const stdout = new TestWritable();
  stdout.rows = opts.rows ?? 30;
  const stderr = new TestWritable();
  stderr.rows = opts.rows ?? 30;
  const tuiOptions: CreateTUIOptions = { cwd: dir, rows: opts.rows ?? 30 };
  const tuiContainer = bootTui(tuiOptions, {
    platform,
    stdin,
    stdout,
    stderr,
    gitBranch: "main",
    gitDirty: false,
  });
  const tui = tuiContainer.cradle.tui;
  const stateStore = tuiContainer.cradle.stateStore;
  void tui.start();
  return { dir, tui, stateStore, platform, stdin, stdout, ownedDir: opts.cwd === undefined };
}

export async function stopTui(harness: TuiHarness): Promise<void> {
  harness.tui.stop();
  await harness.platform.execute({ name: "stop" });
  if (harness.ownedDir) rmSync(harness.dir, { recursive: true, force: true });
}

async function typeChunk(stdin: PassThrough, chunk: string): Promise<void> {
  // Real terminals deliver each keystroke as its own stdin chunk. Ink's
  // input-parser matches single-codepoint special keys (\r, \t, \x7f)
  // against the chunk as a whole, so writing the whole command in a single
  // chunk collapses every char into one non-recognized event and the
  // trailing \r never matches `key.return`. Yield between writes so the
  // PassThrough emits a `readable` boundary between keystrokes, matching
  // raw-mode terminal behavior.
  for (const ch of chunk) {
    stdin.write(ch);
    // Flush the PassThrough's internal buffer so the next `read()` only
    // sees this codepoint, and the consumer's `handleReadable` callback
    // runs before the next keystroke is queued.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

export async function sendCmd(stdin: PassThrough, text: string): Promise<void> {
  await typeChunk(stdin, text);
}

export async function sendEnter(stdin: PassThrough): Promise<void> {
  await typeChunk(stdin, "\r");
}

export async function sendLine(stdin: PassThrough, text: string): Promise<void> {
  await sendCmd(stdin, text);
  await sendEnter(stdin);
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for: ${label}`);
}

export async function waitForTeam(harness: TuiHarness, teamId: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => harness.stateStore.getState().teamId === teamId,
    timeoutMs,
    `team ${teamId}`,
  );
}

export async function waitForAgentIdle(harness: TuiHarness, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => harness.stateStore.getState().agents.get(agentId)?.status === "idle",
    timeoutMs,
    `agent ${agentId} idle`,
  );
}

export async function waitForAgentIdleCount(
  harness: TuiHarness,
  agentId: AgentId,
  count: number,
  timeoutMs = 60000,
): Promise<void> {
  let seen = 0;
  const off = harness.platform.subscribe("agent.idle", (event) => {
    if (event.sender.kind !== "agent") return;
    if (`${event.sender.teamId}:${event.sender.agentKey}` !== agentId) return;
    seen += 1;
  });
  try {
    await waitFor(() => seen >= count, timeoutMs, `agent ${agentId} idle count >= ${count} (seen ${seen})`);
  } finally {
    off();
  }
}

export async function submitAndWaitForAgentIdle(
  harness: TuiHarness,
  prompt: string,
  agentId: AgentId,
  timeoutMs = 60000,
): Promise<void> {
  const before = harness.stateStore.getState().agents.get(agentId);
  const priorHistoryLen = before?.history.length ?? 0;
  const priorCurrentBlocks = before?.currentTurn?.blocks.length ?? 0;
  const priorCurrentCards = before?.currentTurn?.cards.length ?? 0;
  await sendLine(harness.stdin, prompt);
  await waitForPromptSettled(
    harness,
    agentId,
    priorHistoryLen,
    priorCurrentBlocks,
    priorCurrentCards,
    timeoutMs,
  );
}

async function waitForPromptSettled(
  harness: TuiHarness,
  agentId: AgentId,
  priorHistoryLen: number,
  priorCurrentBlocks: number,
  priorCurrentCards: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const agent = harness.stateStore.getState().agents.get(agentId);
    if (agent === undefined) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    if (agent.status === "idle") {
      const historyGrew = agent.history.length > priorHistoryLen;
      const currentHasOutput =
        (agent.currentTurn?.blocks.length ?? 0) > priorCurrentBlocks ||
        (agent.currentTurn?.cards.length ?? 0) > priorCurrentCards;
      const currentReplaced =
        agent.currentTurn !== null &&
        (agent.currentTurn.blocks.length > 0 || agent.currentTurn.cards.length > 0);
      if (historyGrew && currentReplaced) return;
      if (!historyGrew && currentHasOutput) return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  const agent = harness.stateStore.getState().agents.get(agentId);
  throw new Error(
    `submitAndWaitForAgentIdle timed out after ${timeoutMs}ms for agent ${agentId} (status=${agent?.status}, history=${agent?.history.length}, curBlocks=${agent?.currentTurn?.blocks.length}, curCards=${agent?.currentTurn?.cards.length})`,
  );
}

export async function waitForTurnText(harness: TuiHarness, agentId: AgentId, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const agent = harness.stateStore.getState().agents.get(agentId);
      if (agent === undefined) return false;
      const current = agent.currentTurn;
      if (current === null) return false;
      return current.blocks.some((b) => b.text.includes(contains));
    },
    timeoutMs,
    `agent ${agentId} blocks contain '${contains}'`,
  );
}

export async function waitForConversationText(harness: TuiHarness, agentId: AgentId, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const agent = harness.stateStore.getState().agents.get(agentId);
      if (agent === undefined) return false;
      const turns = agent.currentTurn === null ? agent.history : [...agent.history, agent.currentTurn];
      return turns.some((t) => t.blocks.some((b) => b.text.includes(contains)));
    },
    timeoutMs,
    `agent ${agentId} conversation contains '${contains}'`,
  );
}

export async function waitForErrorBanner(harness: TuiHarness, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const errorBanner = harness.stateStore.getState().errorBanner;
      return errorBanner !== null && errorBanner.includes(contains);
    },
    timeoutMs,
    `errorBanner contains '${contains}'`,
  );
}

export async function waitForNoErrorBanner(harness: TuiHarness, timeoutMs = 60000): Promise<void> {
  await waitFor(() => harness.stateStore.getState().errorBanner === null, timeoutMs, "errorBanner cleared");
}

export async function waitForEditorText(harness: TuiHarness, expected: string, timeoutMs = 60000): Promise<void> {
  await waitFor(() => harness.stateStore.getState().editorText === expected, timeoutMs, `editorText === '${expected}'`);
}

export async function waitForTransient(harness: TuiHarness, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const transient = harness.stateStore.getState().transientMessage ?? "";
      return transient.includes(contains);
    },
    timeoutMs,
    `transientMessage contains '${contains}'`,
  );
}

function restoreLang(prevLang: string | undefined, prevLangAll: string | undefined): void {
  if (prevLang === undefined) delete process.env.LANG;
  else process.env.LANG = prevLang;
  if (prevLangAll === undefined) delete process.env.LC_ALL;
  else process.env.LC_ALL = prevLangAll;
}
