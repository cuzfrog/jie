// e2e test do not wait for intermediate state, it's not reliable. Check the eventual state.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { bootPlatform, type EffortLevel, type JiePlatform } from "../../../src/platform";
import { bootTui, type CreateTUIOptions, type Tui, type TuiCradle } from "../../../src/tui";
import type { MessageCard, MessageTurn } from "../../../src/tui/state";
import { writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";

type AgentId = `${string}:${string}`;

const LANG_DEFAULT = "en_US.UTF-8";
const POLL_INTERVAL_MS = 10;

export interface TuiHarness {
  readonly dir: string;
  readonly tui: Tui;
  readonly container: ReturnType<typeof bootTui>;
  readonly stateStore: TuiCradle["stateStore"];
  readonly platform: JiePlatform;
  readonly stdin: PassThrough;
  readonly stdout: PassThrough;
  readonly exited: Promise<void>;
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
  let platformContainer: Awaited<ReturnType<typeof bootPlatform>>;
  try {
    platformContainer = await bootPlatform({ cwd: dir, homeJieDir: dir, projectJieDir: dir, resumeSessionId: opts.resumeSessionId });
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
    homeJieDir: dir,
    stdin,
    stdout,
    stderr,
    gitBranch: "main",
    gitDirty: false,
    version: "0.0.0-test",
  });
  const tui = tuiContainer.cradle.tui;
  const stateStore = tuiContainer.cradle.stateStore;
  const exited = tui.run();
  return { dir, tui, container: tuiContainer, stateStore, platform, stdin, stdout, exited, ownedDir: opts.cwd === undefined };
}

export async function stopTui(harness: TuiHarness): Promise<void> {
  await harness.container.dispose();
  await harness.exited;
  await harness.platform.execute({ name: "stop" });
  await harness.platform.shutdown();
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

export async function waitForAgent(harness: TuiHarness, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => harness.stateStore.getState().agents.has(agentId),
    timeoutMs,
    `agent ${agentId} in the roster`,
  );
}

export async function waitForAgentIdle(harness: TuiHarness, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => harness.stateStore.getState().agents.get(agentId)?.status === "idle",
    timeoutMs,
    `agent ${agentId} idle`,
  );
}

export async function waitForAgentBusy(harness: TuiHarness, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => harness.stateStore.getState().agents.get(agentId)?.status === "busy",
    timeoutMs,
    `agent ${agentId} busy`,
  );
}

export async function waitForAgentQueueNonEmpty(harness: TuiHarness, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => (harness.stateStore.getState().agents.get(agentId)?.queue.length ?? 0) > 0,
    timeoutMs,
    `agent ${agentId} queue non-empty`,
  );
}

export async function waitForFocusedAgent(harness: TuiHarness, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => harness.stateStore.getState().focusedAgentId === agentId,
    timeoutMs,
    `focused agent ${agentId}`,
  );
}

export async function submitAndWaitForAgentIdle(
  harness: TuiHarness,
  prompt: string,
  agentId: AgentId,
  timeoutMs = 60000,
): Promise<void> {
  const before = harness.stateStore.getState().agents.get(agentId);
  const priorHistoryLen = before?.history.length ?? 0;
  const priorCurrentEntries = before?.currentTurn?.entries.length ?? 0;
  await sendLine(harness.stdin, prompt);
  await waitForPromptSettled(
    harness,
    agentId,
    priorHistoryLen,
    priorCurrentEntries,
    timeoutMs,
  );
}

async function waitForPromptSettled(
  harness: TuiHarness,
  agentId: AgentId,
  priorHistoryLen: number,
  priorCurrentEntries: number,
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
      const currentHasOutput = (agent.currentTurn?.entries.length ?? 0) > priorCurrentEntries;
      const currentReplaced = agent.currentTurn !== null && agent.currentTurn.entries.length > 0;
      if (historyGrew && currentReplaced) return;
      if (!historyGrew && currentHasOutput) return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  const agent = harness.stateStore.getState().agents.get(agentId);
  throw new Error(
    `submitAndWaitForAgentIdle timed out after ${timeoutMs}ms for agent ${agentId} (status=${agent?.status}, history=${agent?.history.length}, curEntries=${agent?.currentTurn?.entries.length})`,
  );
}

export async function waitForTurnText(harness: TuiHarness, agentId: AgentId, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const agent = harness.stateStore.getState().agents.get(agentId);
      if (agent === undefined) return false;
      const current = agent.currentTurn;
      if (current === null) return false;
      return current.entries.some((e) => (e.kind === "text" || e.kind === "thinking") && e.text.includes(contains));
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
      return turns.some((t) => t.entries.some((e) => (e.kind === "text" || e.kind === "thinking") && e.text.includes(contains)));
    },
    timeoutMs,
    `agent ${agentId} conversation contains '${contains}'`,
  );
}

export async function waitForCompactionMarker(harness: TuiHarness, agentId: AgentId, summaryContains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const agent = harness.stateStore.getState().agents.get(agentId);
      if (agent === undefined) return false;
      return agent.compactionMarker !== null && agent.compactionMarker.summary.includes(summaryContains);
    },
    timeoutMs,
    `agent ${agentId} compaction marker summary contains '${summaryContains}'`,
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

export async function waitForHelpPanelVisible(harness: TuiHarness, timeoutMs = 60000): Promise<void> {
  await waitFor(() => harness.stateStore.getState().helpPanelVisible, timeoutMs, "help panel visible");
}

export async function waitForEditorText(harness: TuiHarness, expected: string, timeoutMs = 60000): Promise<void> {
  await waitFor(() => harness.stateStore.getState().editorText === expected, timeoutMs, `editorText === '${expected}'`);
}

export async function waitForAgentEffort(harness: TuiHarness, agentId: AgentId, effort: EffortLevel, timeoutMs = 60000): Promise<void> {
  await waitFor(() => harness.stateStore.getState().agents.get(agentId)?.model?.effort === effort, timeoutMs, `agent '${agentId}' model effort === '${effort}'`);
}

export async function waitForAgentModelId(harness: TuiHarness, agentId: AgentId, modelId: string, timeoutMs = 60000): Promise<void> {
  await waitFor(() => harness.stateStore.getState().agents.get(agentId)?.model?.id === modelId, timeoutMs, `agent '${agentId}' model id === '${modelId}'`);
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

export function textOfTurns(turns: ReadonlyArray<MessageTurn>): string {
  return turns
    .flatMap((t) => t.entries)
    .filter((e): e is { readonly kind: "text" | "thinking"; readonly text: string } => e.kind === "text" || e.kind === "thinking")
    .map((e) => e.text)
    .join("\n");
}

export function cardsOfTurns(turns: ReadonlyArray<MessageTurn>): MessageCard[] {
  return turns.flatMap((t) => t.entries).filter((e): e is MessageCard => e.kind === "toolCall" || e.kind === "toolResult");
}

function restoreLang(prevLang: string | undefined, prevLangAll: string | undefined): void {
  if (prevLang === undefined) delete process.env.LANG;
  else process.env.LANG = prevLang;
  if (prevLangAll === undefined) delete process.env.LC_ALL;
  else process.env.LC_ALL = prevLangAll;
}

export function cardsOfTurns(turns: ReadonlyArray<MessageTurn>): MessageCard[] {
  return turns.flatMap((turn) => turn.cards);
}
