import { type AgentId, type AgentUiState, type MessageTurn, type StateStore, type TuiState } from "../../state";
import { type AssistantMessageComponent, type ChatMessages, type CompactionMarkerComponent, type UserMessageComponent } from ".";
import { makeAgentUiState, makeTuiState } from "../../test";
import { ChatSyncImpl, type ChatSync } from "./chat-sync";

type CompactionMarker = NonNullable<AgentUiState["compactionMarker"]>;

const AGENT_ID: AgentId = "my-team:general-1";

function makeTurn(userPrompt: string, text: string | null = null, seq = 0): MessageTurn {
  return { userPrompt, cards: [], blocks: text === null ? [] : [{ kind: "text", text }], streamId: null, seq };
}

function teamState(agents: ReadonlyArray<AgentUiState>, focusedAgentId: AgentId | null, overrides: Partial<TuiState> = {}): TuiState {
  const leader = agents.find((agent) => agent.isLeader) ?? null;
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: leader === null ? null : leader.agentId,
    focusedAgentId,
    agents: new Map(agents.map((agent) => [agent.agentId, agent] as const)),
    ...overrides,
  });
}

interface SyncHarness {
  readonly chatSync: ChatSync;
  readonly stateStore: StateStore;
  readonly chatMessages: ChatMessages;
  readonly createUserMessage: ReturnType<typeof vi.fn>;
  readonly createAssistantMessage: ReturnType<typeof vi.fn>;
  readonly createCompactionMarker: ReturnType<typeof vi.fn>;
  readonly userMessages: UserMessageComponent[];
  readonly assistantMessages: AssistantMessageComponent[];
  readonly compactionMarkers: CompactionMarkerComponent[];
  readonly update: (state: TuiState) => boolean;
  readonly render: (width: number) => string[];
}

function bootSync(): SyncHarness {
  const stateStore = vi.mocked<StateStore>({
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });
  const userMessages: UserMessageComponent[] = [];
  const assistantMessages: AssistantMessageComponent[] = [];
  const compactionMarkers: CompactionMarkerComponent[] = [];
  const createUserMessage = vi.fn((prompt: string) => {
    const component: UserMessageComponent = {
      render: vi.fn(() => [`USER:${prompt}`]),
      invalidate: vi.fn(),
      update: vi.fn(),
    };
    userMessages.push(component);
    return component;
  });
  const createAssistantMessage = vi.fn((turn: MessageTurn | null) => {
    const component: AssistantMessageComponent = {
      render: vi.fn(() => [`ASSISTANT:${turn === null ? -1 : turn.seq}`]),
      invalidate: vi.fn(),
      update: vi.fn(),
    };
    assistantMessages.push(component);
    return component;
  });
  const createCompactionMarker = vi.fn((marker: CompactionMarker) => {
    const component: CompactionMarkerComponent = {
      render: vi.fn(() => [`MARKER:${marker.turnsBefore}`]),
      invalidate: vi.fn(),
      update: vi.fn(),
    };
    compactionMarkers.push(component);
    return component;
  });
  const chatMessages: ChatMessages = {
    createUserMessage,
    createAssistantMessage,
    createCompactionMarker,
  };
  const chatSync = new ChatSyncImpl(stateStore, chatMessages);
  const update = (state: TuiState): boolean => {
    stateStore.getState.mockReturnValue(state);
    return chatSync.update();
  };
  const render = (width: number): string[] => chatSync.render(width);
  return {
    chatSync,
    stateStore,
    chatMessages,
    createUserMessage,
    createAssistantMessage,
    createCompactionMarker,
    userMessages,
    assistantMessages,
    compactionMarkers,
    update,
    render,
  };
}

describe("ChatSyncImpl", () => {
  test("starts empty and is not dirty when state is unchanged", () => {
    const { update, render, createUserMessage } = bootSync();
    expect(update(makeTuiState())).toBe(false);
    expect(render(80)).toEqual([]);
    expect(createUserMessage).not.toHaveBeenCalled();
  });

  test("appends a user+assistant pair when a prompt arrives", () => {
    const { update, render, createUserMessage, createAssistantMessage, userMessages, assistantMessages } = bootSync();
    const turn = makeTurn("tell me a story", null, 0);
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: turn });
    expect(update(teamState([agent], AGENT_ID))).toBe(true);
    expect(createUserMessage).toHaveBeenCalledWith("tell me a story");
    expect(createAssistantMessage).toHaveBeenCalledWith(turn);
    expect(userMessages[0]!.update).not.toHaveBeenCalled();
    expect(assistantMessages[0]!.update).not.toHaveBeenCalled();
    expect(render(80)).toEqual(["USER:tell me a story", "ASSISTANT:0"]);
  });

  test("streaming chunks update the existing pair in place", () => {
    const { update, createUserMessage, createAssistantMessage, userMessages, assistantMessages } = bootSync();
    const streamed = makeTurn("q", "once upon a time", 0);
    const agent1 = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: makeTurn("q", null, 0) });
    expect(update(teamState([agent1], AGENT_ID))).toBe(true);
    const agent2 = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: streamed });
    expect(update(teamState([agent2], AGENT_ID))).toBe(true);
    expect(createUserMessage).toHaveBeenCalledTimes(1);
    expect(createAssistantMessage).toHaveBeenCalledTimes(1);
    expect(userMessages[0]!.update).toHaveBeenCalledWith(streamed);
    expect(assistantMessages[0]!.update).toHaveBeenCalledWith(streamed);
  });

  test("turn rotation appends a new pair and keeps the completed turn", () => {
    const { update, render, createUserMessage, userMessages, assistantMessages } = bootSync();
    const first = makeTurn("q1", null, 0);
    const second = makeTurn("q2", null, 1);
    const agent1 = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: first });
    expect(update(teamState([agent1], AGENT_ID))).toBe(true);
    const agent2 = makeAgentUiState(AGENT_ID, { isLeader: true, history: [first], currentTurn: second });
    expect(update(teamState([agent2], AGENT_ID))).toBe(true);
    expect(createUserMessage).toHaveBeenCalledTimes(2);
    expect(userMessages[0]!.update).toHaveBeenCalledWith(first);
    expect(assistantMessages[0]!.update).toHaveBeenCalledWith(first);
    expect(createUserMessage.mock.calls).toEqual([["q1"], ["q2"]]);
    expect(render(80)).toEqual(["USER:q1", "ASSISTANT:0", "USER:q2", "ASSISTANT:1"]);
  });

  test("switching the focused agent rebuilds the chat from that agent's turns", () => {
    const { update, render, createUserMessage, userMessages } = bootSync();
    const managerId: AgentId = "my-team:manager-1";
    const workerId: AgentId = "my-team:worker-1";
    const manager = makeAgentUiState(managerId, {
      isLeader: true,
      role: "manager",
      currentTurn: makeTurn("manager task", null, 0),
    });
    const worker = makeAgentUiState(workerId, { role: "worker" });
    expect(update(teamState([manager, worker], managerId))).toBe(true);
    expect(render(80)).toEqual(["USER:manager task", "ASSISTANT:0"]);
    const busyWorker = makeAgentUiState(workerId, { role: "worker", currentTurn: makeTurn("worker task", null, 0) });
    expect(update(teamState([manager, busyWorker], workerId))).toBe(true);
    expect(render(80)).toEqual(["USER:worker task", "ASSISTANT:0"]);
    expect(update(teamState([manager, busyWorker], managerId))).toBe(true);
    expect(render(80)).toEqual(["USER:manager task", "ASSISTANT:0"]);
    expect(createUserMessage.mock.calls).toEqual([["manager task"], ["worker task"], ["manager task"]]);
    expect(userMessages).toHaveLength(3);
  });

  test("clearing the tui state empties the chat", () => {
    const { update, render, createUserMessage } = bootSync();
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: makeTurn("q", null, 0) });
    expect(update(teamState([agent], AGENT_ID))).toBe(true);
    expect(createUserMessage).toHaveBeenCalledTimes(1);
    expect(update(makeTuiState())).toBe(true);
    expect(render(80)).toEqual([]);
    expect(createUserMessage).toHaveBeenCalledTimes(1);
  });

  test("a compaction marker renders before the turns that follow it", () => {
    const { update, render, createCompactionMarker } = bootSync();
    const marker: CompactionMarker = { turnsBefore: 0, summary: "the summary", tokensBefore: 500 };
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, compactionMarker: marker, currentTurn: makeTurn("kept", null, 1) });
    expect(update(teamState([agent], AGENT_ID))).toBe(true);
    expect(createCompactionMarker).toHaveBeenCalledWith(marker);
    expect(render(80)).toEqual(["MARKER:0", "USER:kept", "ASSISTANT:1"]);
  });

  test("an unchanged compaction marker is not re-created on the next action", () => {
    const { update, createCompactionMarker } = bootSync();
    const agent = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { turnsBefore: 0, summary: "s", tokensBefore: 1 },
      currentTurn: makeTurn("kept", null, 1),
    });
    const state = teamState([agent], AGENT_ID);
    expect(update(state)).toBe(true);
    expect(update(state)).toBe(false);
    expect(createCompactionMarker).toHaveBeenCalledTimes(1);
  });

  test("a re-compaction moves the marker and keeps the turn lines intact", () => {
    const { update, render, createCompactionMarker, createUserMessage, createAssistantMessage } = bootSync();
    const kept = makeTurn("kept", null, 1);
    const live = makeTurn("live", null, 2);
    const before = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { turnsBefore: 0, summary: "first", tokensBefore: 100 },
      history: [kept],
      currentTurn: live,
    });
    expect(update(teamState([before], AGENT_ID))).toBe(true);
    expect(render(80)).toEqual(["MARKER:0", "USER:kept", "ASSISTANT:1", "USER:live", "ASSISTANT:2"]);
    const after = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { turnsBefore: 1, summary: "second", tokensBefore: 200 },
      history: [kept],
      currentTurn: live,
    });
    expect(update(teamState([after], AGENT_ID))).toBe(true);
    expect(render(80)).toEqual(["USER:kept", "ASSISTANT:1", "MARKER:1", "USER:live", "ASSISTANT:2"]);
    expect(createCompactionMarker).toHaveBeenCalledTimes(2);
    expect(createUserMessage).toHaveBeenCalledTimes(4);
    expect(createAssistantMessage).toHaveBeenCalledTimes(4);
  });

  test("a same-position marker update calls update on the existing component", () => {
    const { update, createCompactionMarker, compactionMarkers } = bootSync();
    const agent1 = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { turnsBefore: 0, summary: "first", tokensBefore: 100 },
      currentTurn: makeTurn("kept", null, 1),
    });
    expect(update(teamState([agent1], AGENT_ID))).toBe(true);
    const agent2 = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { turnsBefore: 0, summary: "second", tokensBefore: 200 },
      currentTurn: makeTurn("kept", null, 1),
    });
    expect(update(teamState([agent2], AGENT_ID))).toBe(true);
    expect(createCompactionMarker).toHaveBeenCalledTimes(1);
    expect(compactionMarkers[0]!.update).toHaveBeenCalledWith(agent2.compactionMarker);
  });

  test("toggling thinking or tool-card expansion is dirty without changing the message list", () => {
    const { update, render } = bootSync();
    const turn = makeTurn("q", "text", 0);
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: turn });
    const base = teamState([agent], AGENT_ID);
    expect(update(base)).toBe(true);
    const withThinking = teamState([agent], AGENT_ID, { thinkingExpanded: true });
    expect(update(withThinking)).toBe(true);
    expect(update(withThinking)).toBe(false);
    const withToolCards = teamState([agent], AGENT_ID, { thinkingExpanded: true, toolCardsExpanded: true });
    expect(update(withToolCards)).toBe(true);
    expect(render(80)).toEqual(["USER:q", "ASSISTANT:0"]);
  });

  test("an unchanged message list is not dirty when the focused agent's unwatched fields change", () => {
    const { update } = bootSync();
    const sharedHistory: MessageTurn[] = [];
    const turn = makeTurn("q", null, 0);
    const agent = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      currentTurn: turn,
      queue: [{ text: "a", source: "user", chained: false }],
      history: sharedHistory,
    });
    expect(update(teamState([agent], AGENT_ID))).toBe(true);
    const updated = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      currentTurn: turn,
      queue: [{ text: "b", source: "user", chained: false }],
      history: sharedHistory,
    });
    expect(update(teamState([updated], AGENT_ID))).toBe(false);
  });
});
