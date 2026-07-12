// e2e test do not wait for intermediate state, it's not reliable. Check the eventual state.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createJiePlatform, type JiePlatform } from "@cuzfrog/jie-platform";
import { type CreateTUIOptions, type Tui, createTui } from "@cuzfrog/jie-tui";
import { writeModelsJsonTo, writeSettingsJson } from "../_fixture.ts";

type AgentId = `${string}:${string}`;

const LANG_DEFAULT = "en_US.UTF-8";
const POLL_INTERVAL_MS = 10;

export interface TuiHarness {
  readonly dir: string;
  readonly tui: Tui;
  readonly platform: JiePlatform;
  readonly stdin: PassThrough;
  readonly stdout: PassThrough;
}

export interface StartTuiOptions {
  readonly rows?: number;
  readonly cwd?: string;
}

class TestWritable extends PassThrough {
  columns = 80;
  rows = 30;
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
  const dir = mkdtempSync(join(tmpdir(), "jie-tui-e2e-"));
  writeModelsJsonTo(dir);
  writeSettingsJson(dir);
  const prevLang = process.env.LANG;
  process.env.LANG = LANG_DEFAULT;
  const prevLangAll = process.env.LC_ALL;
  process.env.LC_ALL = LANG_DEFAULT;
  let platform: JiePlatform;
  try {
    platform = await createJiePlatform({ cwd: dir, homeJieDir: dir, projectJieDir: dir });
  } catch (err) {
    restoreLang(prevLang, prevLangAll);
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  const stdin = new TestReadable();
  const stdout = new TestWritable();
  stdout.rows = opts.rows ?? 30;
  const tuiOptions: CreateTUIOptions = { cwd: opts.cwd ?? dir, rows: opts.rows ?? 30 };
  const tui = createTui(tuiOptions, {
    platform,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    gitBranch: "main",
    gitDirty: false,
  });
  void tui.start();
  return { dir, tui, platform, stdin, stdout };
}

export async function stopTui(harness: TuiHarness): Promise<void> {
  harness.tui.stop();
  await harness.platform.execute({ name: "stop" });
  rmSync(harness.dir, { recursive: true, force: true });
}

export function sendCmd(stdin: PassThrough, text: string): void {
  stdin.write(text);
}

export function sendEnter(stdin: PassThrough): void {
  stdin.write("\r");
}

export function sendLine(stdin: PassThrough, text: string): void {
  stdin.write(text);
  stdin.write("\r");
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for: ${label}`);
}

export async function waitForTeam(tui: Tui, teamId: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => tui.state.teamId === teamId,
    timeoutMs,
    `team ${teamId}`,
  );
}

export async function waitForAgentIdle(tui: Tui, agentId: AgentId, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => tui.state.agents.get(agentId)?.status === "idle",
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
  const before = harness.tui.state.agents.get(agentId);
  const priorHistoryLen = before?.history.length ?? 0;
  const priorCurrentBlocks = before?.currentTurn?.blocks.length ?? 0;
  const priorCurrentCards = before?.currentTurn?.cards.length ?? 0;
  sendLine(harness.stdin, prompt);
  await waitForPromptSettled(
    harness.tui,
    agentId,
    priorHistoryLen,
    priorCurrentBlocks,
    priorCurrentCards,
    timeoutMs,
  );
}

async function waitForPromptSettled(
  tui: Tui,
  agentId: AgentId,
  priorHistoryLen: number,
  priorCurrentBlocks: number,
  priorCurrentCards: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const agent = tui.state.agents.get(agentId);
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
  const agent = tui.state.agents.get(agentId);
  throw new Error(
    `submitAndWaitForAgentIdle timed out after ${timeoutMs}ms for agent ${agentId} (status=${agent?.status}, history=${agent?.history.length}, curBlocks=${agent?.currentTurn?.blocks.length}, curCards=${agent?.currentTurn?.cards.length})`,
  );
}

export async function waitForTurnText(tui: Tui, agentId: AgentId, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => {
      const agent = tui.state.agents.get(agentId);
      if (agent === undefined) return false;
      const current = agent.currentTurn;
      if (current === null) return false;
      return current.blocks.some((b) => b.text.includes(contains));
    },
    timeoutMs,
    `agent ${agentId} blocks contain '${contains}'`,
  );
}

export async function waitForErrorBanner(tui: Tui, contains: string, timeoutMs = 60000): Promise<void> {
  await waitFor(
    () => tui.state.errorBanner !== null && tui.state.errorBanner.includes(contains),
    timeoutMs,
    `errorBanner contains '${contains}'`,
  );
}

export async function waitForNoErrorBanner(tui: Tui, timeoutMs = 60000): Promise<void> {
  await waitFor(() => tui.state.errorBanner === null, timeoutMs, "errorBanner cleared");
}

function restoreLang(prevLang: string | undefined, prevLangAll: string | undefined): void {
  if (prevLang === undefined) delete process.env.LANG;
  else process.env.LANG = prevLang;
  if (prevLangAll === undefined) delete process.env.LC_ALL;
  else process.env.LC_ALL = prevLangAll;
}
