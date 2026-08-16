import type { StopReason } from "@earendil-works/pi-ai";
import type { Terminal } from "@earendil-works/pi-tui";
import {
  Events,
  type AnyEventEnvelope,
  type Command,
  type CommandResult,
  type EventEnvelope,
  type EventType,
  type JiePlatform,
  type QuestionAnswer,
  type QuestionItem,
  type TeamInfo,
} from "../../platform";
import { Actions } from "./actions";
import { EffectHandlerImpl, type EffectHandler } from "./effect-handler";
import { StateStoreImpl } from "./state-store";

const STOP_REASON: StopReason = "stop";
const TOOL_USE_REASON: StopReason = "toolUse";

class StubTerminal implements Terminal {
  columns = 80;
  rows = 30;
  writeCalls: string[] = [];
  clearScreenCalls = 0;
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve(); }
  write(data: string): void { this.writeCalls.push(data); }
  get kittyProtocolActive(): boolean { return false; }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void { this.clearScreenCalls += 1; }
  setTitle(): void {}
  setProgress(): void {}
}

interface PlatformHarness {
  readonly platform: JiePlatform;
  readonly execute: ReturnType<typeof vi.fn>;
  readonly prompt: ReturnType<typeof vi.fn>;
  readonly interrupt: ReturnType<typeof vi.fn>;
  readonly dequeuePrompt: ReturnType<typeof vi.fn>;
  readonly requeuePrompt: ReturnType<typeof vi.fn>;
  readonly handlers: Map<EventType, (env: AnyEventEnvelope) => void>;
  readonly executeCalls: Command[];
}

function makePlatform(board: CommandResult<"kanbanEdit"> = { board: [] }, soundEnabled = true): PlatformHarness {
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const executeCalls: Command[] = [];
  const execute = vi.fn(async (command: Command): Promise<unknown> => {
    executeCalls.push(command);
    if (command.name === "kanbanEdit" || command.name === "kanbanToggleTodo") return board;
    if (command.name === "getNotificationSoundEnabled") return soundEnabled;
    return null;
  });
  const prompt = vi.fn();
  const interrupt = vi.fn();
  const dequeuePrompt = vi.fn();
  const requeuePrompt = vi.fn();
  const platform: JiePlatform = {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as (env: AnyEventEnvelope) => void;
      handlers.set(topic, handler);
      return () => { handlers.delete(topic); };
    },
    prompt,
    interrupt,
    dequeuePrompt,
    requeuePrompt,
    execute: execute as JiePlatform["execute"],
    teams: () => [],
    shutdown: () => Promise.resolve(),
  };
  return { platform, execute, prompt, interrupt, dequeuePrompt, requeuePrompt, handlers, executeCalls };
}

function makeTeamInfo(teamId = "my-team", agentKey = "general-1"): TeamInfo {
  return {
    id: teamId,
    leaderKey: agentKey,
    sessionName: null,
    currentSessionId: null,
    kanbanCards: [],
    history: [],
    agents: [{ teamId, role: "general", agentKey, isLeader: true, tools: [], subscribe: [], skills: [], model: null, sessionUsage: null }],
  };
}

interface EffectHarness {
  readonly handler: EffectHandler;
  readonly stateStore: StateStoreImpl;
  readonly platform: PlatformHarness;
  readonly commandHandler: { handle: ReturnType<typeof vi.fn> };
  readonly terminal: StubTerminal;
  readonly screen: { requestRender: ReturnType<typeof vi.fn> };
  readonly quitTui: ReturnType<typeof vi.fn>;
}

function makeEffectHarness(platform: PlatformHarness, state: StateStoreImpl): EffectHarness {
  const commandHandler = { handle: vi.fn() };
  const terminal = new StubTerminal();
  const screen = { requestRender: vi.fn() };
  const quitTui = vi.fn();
  const handler = new EffectHandlerImpl(platform.platform, state, commandHandler, terminal, screen, quitTui);
  return { handler, stateStore: state, platform, commandHandler, terminal, screen, quitTui };
}

async function runAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("EffectHandlerImpl", () => {
  test("forwards a bus event to the state store", () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    makeEffectHarness(platform, state);
    const team = makeTeamInfo("my-team", "general-1");
    const loadHandler = platform.handlers.get("system.team.loaded");
    expect(loadHandler).toBeDefined();
    loadHandler!(Events.teamLoaded({ kind: "system" }, team));
    const env = Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "stop");
    const handler = platform.handlers.get("agent.idle");
    expect(handler).toBeDefined();
    handler!(env);
    expect(state.getState().agents.get("my-team:general-1")?.status).toBe("idle");
  });

  test("SUBMIT_EDITOR_TEXT routes to the command handler", () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    const { commandHandler } = makeEffectHarness(platform, state);
    state.dispatch(Actions.submitEditorText("hello"));
    expect(commandHandler.handle).toHaveBeenCalledWith("hello");
  });

  test("REQUEST_INTERRUPT forwards to the platform", () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    makeEffectHarness(platform, state);
    state.dispatch(Actions.requestInterrupt("my-team", "general-1"));
    expect(platform.interrupt).toHaveBeenCalledWith("my-team", "general-1");
  });

  test("REQUEST_DEQUEUE and REQUEST_REQUEUE forward to the platform", () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    makeEffectHarness(platform, state);
    state.dispatch(Actions.requestDequeue("my-team", "general-1", "queued"));
    expect(platform.dequeuePrompt).toHaveBeenCalledWith("my-team", "general-1", "queued");
    state.dispatch(Actions.requestRequeue("my-team", "general-1", "abandoned"));
    expect(platform.requeuePrompt).toHaveBeenCalledWith("my-team", "general-1", "abandoned");
  });

  test("REQUEST_QUIT invokes the quit callback", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    const { quitTui } = makeEffectHarness(platform, state);
    state.dispatch(Actions.requestQuit());
    await runAsync();
    expect(quitTui).toHaveBeenCalled();
  });

  test("CLEAR_TUI_STATE clears the screen and scrollback and forces a render", () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    const { terminal, screen } = makeEffectHarness(platform, state);
    state.dispatch(Actions.clearTuiState());
    expect(terminal.clearScreenCalls).toBe(1);
    expect(terminal.writeCalls).toContain("\x1b[3J");
    expect(screen.requestRender).toHaveBeenCalledWith(true);
  });
});

describe("EffectHandlerImpl — saveKanbanEdit", () => {
  test("executes kanbanEdit and dispatches the returned board", async () => {
    const board = [{ id: "#1", content: "edited", status: "pending" as const }];
    const state = new StateStoreImpl();
    const platform = makePlatform({ board });
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    makeEffectHarness(platform, state);
    state.dispatch(Actions.saveKanbanEdit("#1", "edited", "content"));
    await runAsync();
    expect(platform.executeCalls.at(-1)).toEqual({ name: "kanbanEdit", teamId: "my-team", cardId: "#1", field: "content", text: "edited" });
    expect(state.getState().kanban.board).toEqual(board);
  });

  test("does not call the platform when no team is loaded", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] });
    makeEffectHarness(platform, state);
    state.dispatch(Actions.saveKanbanEdit("#1", "edited", "content"));
    await runAsync();
    expect(platform.executeCalls).toEqual([]);
  });

  test("surfaces platform errors as an error banner", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { execute } = platform;
    execute.mockRejectedValueOnce(new Error("duplicate"));
    makeEffectHarness(platform, state);
    state.dispatch(Actions.saveKanbanEdit("#1", "edited", "content"));
    await runAsync();
    expect(state.getState().errorBanner).toBe("kanban edit failed: duplicate");
  });

  test("ignores non-matching actions", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] });
    makeEffectHarness(platform, state);
    state.dispatch(Actions.cycleKanbanView());
    await runAsync();
    expect(platform.executeCalls).toEqual([]);
  });
});

describe("EffectHandlerImpl — toggleKanbanTodo", () => {
  test("executes kanbanToggleTodo and dispatches the returned board", async () => {
    const board = [{ id: "#1", content: "task", status: "pending" as const }];
    const state = new StateStoreImpl();
    const platform = makePlatform({ board });
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    makeEffectHarness(platform, state);
    state.dispatch(Actions.toggleKanbanTodo("#1", "one"));
    await runAsync();
    expect(platform.executeCalls.at(-1)).toEqual({ name: "kanbanToggleTodo", teamId: "my-team", cardId: "#1", todo: "one" });
    expect(state.getState().kanban.board).toEqual(board);
  });

  test("does not call the platform when no team is loaded", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] });
    makeEffectHarness(platform, state);
    state.dispatch(Actions.toggleKanbanTodo("#1", "one"));
    await runAsync();
    expect(platform.executeCalls).toEqual([]);
  });

  test("surfaces platform errors as an error banner", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { execute } = platform;
    execute.mockRejectedValueOnce(new Error("not found"));
    makeEffectHarness(platform, state);
    state.dispatch(Actions.toggleKanbanTodo("#1", "one"));
    await runAsync();
    expect(state.getState().errorBanner).toBe("kanban toggle failed: not found");
  });
});

describe("EffectHandlerImpl — notification sound", () => {
  test("agent.idle for the focused agent with a sound stop reason rings the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, true);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.idle");
    handler!(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, STOP_REASON));
    await runAsync();
    expect(platform.executeCalls.some((command) => command.name === "getNotificationSoundEnabled")).toBe(true);
    expect(terminal.writeCalls).toContain("\x07");
  });

  test("agent.idle with sound disabled does not ring the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, false);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.idle");
    handler!(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, STOP_REASON));
    await runAsync();
    expect(terminal.writeCalls).not.toContain("\x07");
  });

  test("agent.idle for a non-focused agent does not ring the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, true);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.idle");
    handler!(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "other-1" }, STOP_REASON));
    await runAsync();
    expect(terminal.writeCalls).not.toContain("\x07");
  });

  test("agent.idle with a non-sound stop reason does not ring the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, true);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.idle");
    handler!(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, TOOL_USE_REASON));
    await runAsync();
    expect(terminal.writeCalls).not.toContain("\x07");
  });

  test("agent.question.ask for the focused agent rings the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, true);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.question.ask");
    handler!(Events.agentQuestionAsk({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "req-1", QUESTIONS));
    await runAsync();
    expect(platform.executeCalls.some((command) => command.name === "getNotificationSoundEnabled")).toBe(true);
    expect(terminal.writeCalls).toContain("\x07");
  });

  test("agent.question.ask for another team does not ring the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, true);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.question.ask");
    handler!(Events.agentQuestionAsk({ kind: "agent", teamId: "other-team", agentKey: "general-1" }, "req-1", QUESTIONS));
    await runAsync();
    expect(terminal.writeCalls).not.toContain("\x07");
  });

  test("agent.question.ask with sound disabled does not ring the terminal", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform({ board: [] }, false);
    const team = makeTeamInfo("my-team", "general-1");
    state.dispatch(Actions.switchTeam(team));
    const { terminal } = makeEffectHarness(platform, state);
    const handler = platform.handlers.get("agent.question.ask");
    handler!(Events.agentQuestionAsk({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "req-1", QUESTIONS));
    await runAsync();
    expect(terminal.writeCalls).not.toContain("\x07");
  });
});

const QUESTIONS: QuestionItem[] = [{
  question: "Which approach?",
  header: "Approach",
  options: [{ label: "A", description: "approach a" }],
  multiSelect: false,
}];

function loadTeamWithQuestion(state: StateStoreImpl): void {
  const team = makeTeamInfo("my-team", "general-1");
  state.dispatch(Actions.switchTeam(team));
  state.dispatch(Actions.showQuestions("req-1", "my-team:general-1", QUESTIONS));
}

describe("EffectHandlerImpl — question answer", () => {
  test("SUBMIT_QUESTION_ANSWERS executes answerUserQuestion with the answers", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    makeEffectHarness(platform, state);
    loadTeamWithQuestion(state);
    const answers: QuestionAnswer[] = [{ header: "Approach", selected: ["A"], other: null }];
    state.dispatch(Actions.submitQuestionAnswers("req-1", answers));
    await runAsync();
    expect(platform.executeCalls.at(-1)).toEqual({ name: "answerUserQuestion", teamId: "my-team", agentKey: "general-1", requestId: "req-1", cancelled: false, answers });
  });

  test("CANCEL_QUESTION executes answerUserQuestion as cancelled", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    makeEffectHarness(platform, state);
    loadTeamWithQuestion(state);
    state.dispatch(Actions.cancelQuestion("req-1"));
    await runAsync();
    expect(platform.executeCalls.at(-1)).toEqual({ name: "answerUserQuestion", teamId: "my-team", agentKey: "general-1", requestId: "req-1", cancelled: true });
  });

  test("surfaces answer errors as an error banner", async () => {
    const state = new StateStoreImpl();
    const platform = makePlatform();
    const { execute } = platform;
    execute.mockRejectedValueOnce(new Error("no pending question"));
    makeEffectHarness(platform, state);
    loadTeamWithQuestion(state);
    state.dispatch(Actions.cancelQuestion("req-1"));
    await runAsync();
    expect(state.getState().errorBanner).toBe("answer question failed: no pending question");
  });
});
