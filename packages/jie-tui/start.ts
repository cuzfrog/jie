import type { EventEnvelope, EventManager } from "@cuzfrog/jie-platform/event";
import { Events } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";
import { type AgentId, type TuiState, initialState, reduce } from "./state";
import { render, type RenderOptions } from "./renderer";

export interface StartTUIOptions {
  bus: EventManager;
  artifacts: ArtifactStore;
  roles: string[];
  cwd?: string;
  branch?: string;
  cols?: number;
  rows?: number;
  provider?: string;
  modelId?: string;
  effort?: string;
}

export interface Tui {
  getState: () => TuiState;
  frame: () => string[];
  submit: (text: string) => void;
  injectKey: (data: string) => void;
  stop: () => void;
}

const STATIC_SUBSCRIBE_TOPICS: ReadonlyArray<string> = [
  "system.teams",
  "agent.turn.start",
  "agent.idle",
  "agent.stream.chunk",
  "agent.stream.end",
  "agent.tool.call",
  "agent.tool.result",
  "agent.queue.update",
  "ui.rail.toggle",
  "ui.agent.cycle",
  "ui.thinking.toggle",
  "ui.tool.toggle",
  "ui.clear",
  "ui.transient",
  "ui.transient.clear",
  "ui.error",
  "ui.error.clear",
];

const promptTopicFor = (teamId: string, agentKey: string): string => `system.teams.${teamId}.agent.${agentKey}.prompt`;

const DEFAULT_COLS = 80;
const MIN_COLS = 60;

const detectBranch = (cwd: string): string => {
  try {
    const out = Bun.spawnSync({ cmd: ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], stdout: "pipe", stderr: "pipe" });
    if (out.exitCode !== 0) return "";
    return new TextDecoder().decode(out.stdout).trim();
  } catch {
    return "";
  }
};

const isUtf8 = (): boolean => /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");

const teamNotInstalledReply = (arg: string): string =>
  `team '${arg}' is not installed; checked .jie/teams/${arg}/ and ~/.jie/teams/${arg}/`;

const replyForSlashCommand = (text: string): string | null => {
  const parts = text.split(/\s+/);
  const cmd = parts[0]!;
  switch (cmd) {
    case "/help":
      return "type a prompt...  /clear /help /exit /team /model /login /logout";
    case "/login":
      return "/login: provider picker not wired in v0.2.0 MVP. Use `jie login --provider <id> --api-key <key>` then restart.";
    case "/logout":
      return "/logout: not wired in v0.2.0 MVP. Use `jie logout [<provider>].";
    case "/model":
      return "/model: not wired in v0.2.0 MVP. Use `jie model <provider>/<modelId>`.";
    case "/team": {
      const arg = parts[1];
      if (arg === undefined) return "/team <id>: picker not wired in v0.2.0 MVP. Use `jie team <id>` then restart.";
      if (arg === "--unset") return "/team --unset: not wired in v0.2.0 MVP. Use `jie team --unset`.";
      return teamNotInstalledReply(arg);
    }
    default:
      return null;
  }
};

export function startTUI(options: StartTUIOptions): Tui {
  if (process.stdin.isTTY !== true) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if ((options.cols ?? DEFAULT_COLS) < MIN_COLS) {
    throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${options.cols ?? 0}`);
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }

  let state: TuiState = initialState();
  let stopped = false;
  const cwd = options.cwd ?? process.cwd();
  const branch = options.branch ?? detectBranch(cwd);
  const cols = options.cols ?? DEFAULT_COLS;
  const rows = options.rows ?? 30;
  const renderOpts: RenderOptions = {
    cols, rows, cwd, branch,
    provider: options.provider, modelId: options.modelId, effort: options.effort,
  };

  const applyUiEnvelope = (topic: string, payload: unknown): void => {
    const env: EventEnvelope = {
      version: 1, topic, sender: { kind: "tui" }, timestamp: new Date().toISOString(), payload: payload as EventEnvelope["payload"],
    };
    state = reduce(state, env);
    reconcilePromptSubscriptions(state);
  };

  const emitTransient = (text: string): void => applyUiEnvelope("ui.transient", { text, shownAt: Date.now() });
  const emitError = (text: string): void => applyUiEnvelope("ui.error", { text, shownAt: Date.now() });

  const handleSlashCommand = (text: string): boolean => {
    applyUiEnvelope("ui.transient.clear", null);
    const parts = text.split(/\s+/);
    const cmd = parts[0]!;
    if (cmd === "/clear") {
      applyUiEnvelope("ui.clear", null);
      return true;
    }
    if (cmd === "/exit") {
      stopped = true;
      return true;
    }
    const reply = replyForSlashCommand(text);
    if (reply === null) {
      emitError(`unknown slash command: ${cmd}`);
      return true;
    }
    emitTransient(reply);
    return true;
  };

  const publishPrompt = (text: string): void => {
    if (state.teamId === null || state.focusedAgentId === null) {
      emitError("No team loaded; run `/team <id>` to load a team.");
      return;
    }
    const focused = state.agents.get(state.focusedAgentId);
    const targetKey = focused?.agentKey ?? (state.leaderAgentId !== null ? state.agents.get(state.leaderAgentId)?.agentKey : undefined);
    if (targetKey === undefined || state.teamId === null) {
      emitError("No focused agent; press <- <- to reveal the rail.");
      return;
    }
    options.bus.publish(Events.userPrompt({ kind: "tui" }, state.teamId, text, targetKey));
  };

  const handleSubmit = (text: string): void => {
    applyUiEnvelope("ui.transient.clear", null);
    applyUiEnvelope("ui.error.clear", null);
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed);
      return;
    }
    publishPrompt(trimmed);
  };

  const promptUnsubs = new Map<AgentId, () => void>();

  const reconcilePromptSubscriptions = (current: TuiState): void => {
    if (stopped) return;
    const seen = new Set<AgentId>();
    if (current.teamId !== null) {
      for (const [agentId, agent] of current.agents) {
        if (agent.teamId !== current.teamId) continue;
        seen.add(agentId);
        if (promptUnsubs.has(agentId)) continue;
        const topic = promptTopicFor(current.teamId, agent.agentKey);
        const unsub = options.bus.subscribe(topic, (env) => {
          if (stopped) return;
          state = reduce(state, env);
          reconcilePromptSubscriptions(state);
        });
        promptUnsubs.set(agentId, unsub);
      }
    }
    for (const [agentId, unsub] of promptUnsubs) {
      if (seen.has(agentId)) continue;
      unsub();
      promptUnsubs.delete(agentId);
    }
  };

  for (const topic of STATIC_SUBSCRIBE_TOPICS) {
    options.bus.subscribe(topic, (env) => {
      if (stopped) return;
      state = reduce(state, env);
      reconcilePromptSubscriptions(state);
    });
  }

  let leftArrowCount = 0;

  const handleOneKey = (data: string): void => {
    if (stopped) return;
    if (data === "\x04") {
      stopped = true;
      return;
    }
    if (data === "\x1b[D") {
      leftArrowCount += 1;
      if (leftArrowCount >= 2) {
        leftArrowCount = 0;
        applyUiEnvelope("ui.rail.toggle", null);
      }
      return;
    }
    leftArrowCount = 0;
    if (data === "\x1b[1;5A") {
      applyUiEnvelope("ui.agent.cycle", { direction: -1 });
      return;
    }
    if (data === "\x1b[1;5B") {
      applyUiEnvelope("ui.agent.cycle", { direction: 1 });
      return;
    }
    if (data === "\x14") {
      applyUiEnvelope("ui.thinking.toggle", null);
      return;
    }
    if (data === "\x0f") {
      applyUiEnvelope("ui.tool.toggle", null);
      return;
    }
  };

  const injectKey = (data: string): void => {
    if (stopped) return;
    let i = 0;
    while (i < data.length) {
      if (data[i] === "\x1b" && i + 1 < data.length && data[i + 1] === "[") {
        const match = data.slice(i).match(/^\x1b\[[0-9;]*[A-Za-z]/);
        if (match !== null) {
          handleOneKey(match[0]);
          i += match[0].length;
          continue;
        }
      }
      handleOneKey(data[i]!);
      i += 1;
    }
  };

  return {
    getState: (): TuiState => state,
    frame: (): string[] => render(state, renderOpts).lines,
    submit: (text: string): void => handleSubmit(text),
    injectKey,
    stop: (): void => {
      stopped = true;
    },
  };
}