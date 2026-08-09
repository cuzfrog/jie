import { type Component, type Container } from "@earendil-works/pi-tui";
import { Actions, type AgentId, type AgentUiState, type MessageTurn, type StateStore, type TuiState } from "../state";
import { type AssistantMessageComponent, type ChatMessages, type UserMessageComponent } from "../components/chat";
import { makeAgentUiState, makeTuiState } from "../test";
import { ChatSyncImpl } from "./chat-sync";

const AGENT_ID: AgentId = "my-team:general-1";
const INERT_ACTION = Actions.setEnvironment("/tmp", "main", false, "");

function makeTurn(userPrompt: string, text: string | null = null, seq = 0): MessageTurn {
  return { userPrompt, cards: [], blocks: text === null ? [] : [{ kind: "text", text }], streamId: null, seq };
}

function teamState(agents: ReadonlyArray<AgentUiState>, focusedAgentId: AgentId | null): TuiState {
  const leader = agents.find((agent) => agent.isLeader) ?? null;
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: leader === null ? null : leader.agentId,
    focusedAgentId,
    agents: new Map(agents.map((agent) => [agent.agentId, agent] as const)),
  });
}

interface SyncHarness {
  readonly notify: (afterState: TuiState) => Promise<void>;
  readonly addChild: ReturnType<typeof vi.fn>;
  readonly removeChild: ReturnType<typeof vi.fn>;
  readonly clear: ReturnType<typeof vi.fn>;
  readonly requestRender: ReturnType<typeof vi.fn>;
  readonly createUserMessage: ReturnType<typeof vi.fn>;
  readonly createAssistantMessage: ReturnType<typeof vi.fn>;
  readonly createCompactionMarker: ReturnType<typeof vi.fn>;
  readonly userMessages: ReadonlyArray<UserMessageComponent>;
  readonly assistantMessages: ReadonlyArray<AssistantMessageComponent>;
  readonly compactionMarkers: ReadonlyArray<Component>;
}

function bootSync(): SyncHarness {
  const stateStore = vi.mocked<StateStore>({
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });
  const userMessages: UserMessageComponent[] = [];
  const assistantMessages: AssistantMessageComponent[] = [];
  const compactionMarkers: Component[] = [];
  const chatMessages = vi.mocked<ChatMessages>({
    createUserMessage: vi.fn(() => {
      const component: UserMessageComponent = { render: vi.fn(() => []), invalidate: vi.fn(), update: vi.fn() };
      userMessages.push(component);
      return component;
    }),
    createAssistantMessage: vi.fn(() => {
      const component: AssistantMessageComponent = { render: vi.fn(() => []), invalidate: vi.fn(), update: vi.fn() };
      assistantMessages.push(component);
      return component;
    }),
    createCompactionMarker: vi.fn(() => {
      const component: Component = { render: vi.fn(() => []), invalidate: vi.fn() };
      compactionMarkers.push(component);
      return component;
    }),
  });
  const chatContainer = vi.mocked<Container>({
    children: [],
    addChild: vi.fn(),
    removeChild: vi.fn(),
    clear: vi.fn(),
    invalidate: vi.fn(),
    render: vi.fn(() => []),
  });
  const requestRender = vi.fn();
  const chatSync = new ChatSyncImpl(stateStore, chatMessages, chatContainer, requestRender);
  chatSync.start();
  const listener = stateStore.subscribe.mock.calls[0]![0];
  return {
    notify: (afterState: TuiState) => {
      stateStore.getState.mockReturnValue(afterState);
      return listener(INERT_ACTION, afterState, afterState);
    },
    addChild: chatContainer.addChild,
    removeChild: chatContainer.removeChild,
    clear: chatContainer.clear,
    requestRender,
    createUserMessage: chatMessages.createUserMessage,
    createAssistantMessage: chatMessages.createAssistantMessage,
    createCompactionMarker: chatMessages.createCompactionMarker,
    userMessages,
    assistantMessages,
    compactionMarkers,
  };
}

describe("ChatSyncImpl", () => {
  test("starts empty and requests a render on every action", async () => {
    const { notify, addChild, requestRender } = bootSync();
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true });
    await notify(teamState([agent], AGENT_ID));
    expect(addChild).not.toHaveBeenCalled();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  test("appends a user+assistant pair when a prompt arrives", async () => {
    const { notify, addChild, createUserMessage, createAssistantMessage } = bootSync();
    const turn = makeTurn("tell me a story");
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: turn });
    await notify(teamState([agent], AGENT_ID));
    expect(addChild).toHaveBeenCalledTimes(2);
    expect(createUserMessage).toHaveBeenCalledWith("tell me a story");
    expect(createAssistantMessage).toHaveBeenCalledWith(turn);
  });

  test("streaming chunks update the existing pair in place", async () => {
    const { notify, addChild, userMessages, assistantMessages } = bootSync();
    const streamed = makeTurn("q", "once upon a time");
    await notify(teamState([makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: makeTurn("q") })], AGENT_ID));
    await notify(teamState([makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: streamed })], AGENT_ID));
    expect(addChild).toHaveBeenCalledTimes(2);
    expect(userMessages[0]!.update).toHaveBeenCalledWith(streamed);
    expect(assistantMessages[0]!.update).toHaveBeenCalledWith(streamed);
  });

  test("turn rotation appends a new pair and keeps the completed turn", async () => {
    const { notify, addChild, removeChild, createUserMessage, userMessages, assistantMessages } = bootSync();
    const first = makeTurn("q1");
    const second = makeTurn("q2");
    await notify(teamState([makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: first })], AGENT_ID));
    await notify(teamState([makeAgentUiState(AGENT_ID, { isLeader: true, history: [first], currentTurn: second })], AGENT_ID));
    expect(addChild).toHaveBeenCalledTimes(4);
    expect(removeChild).not.toHaveBeenCalled();
    expect(userMessages[0]!.update).toHaveBeenCalledWith(first);
    expect(assistantMessages[0]!.update).toHaveBeenCalledWith(first);
    expect(createUserMessage.mock.calls).toEqual([["q1"], ["q2"]]);
  });

  test("switching the focused agent rebuilds the container from that agent's turns", async () => {
    const { notify, addChild, removeChild, clear, createUserMessage } = bootSync();
    const managerId: AgentId = "my-team:manager-1";
    const workerId: AgentId = "my-team:worker-1";
    const manager = makeAgentUiState(managerId, { isLeader: true, role: "manager", currentTurn: makeTurn("manager task") });
    const worker = makeAgentUiState(workerId, { role: "worker" });
    await notify(teamState([manager, worker], managerId));
    expect(addChild).toHaveBeenCalledTimes(2);
    await notify(teamState([manager, worker], workerId));
    expect(clear).toHaveBeenCalledTimes(2);
    expect(addChild).toHaveBeenCalledTimes(2);
    const busyWorker = makeAgentUiState(workerId, { role: "worker", currentTurn: makeTurn("worker task") });
    await notify(teamState([manager, busyWorker], workerId));
    expect(addChild).toHaveBeenCalledTimes(4);
    await notify(teamState([manager, busyWorker], managerId));
    expect(clear).toHaveBeenCalledTimes(3);
    expect(addChild).toHaveBeenCalledTimes(6);
    expect(removeChild).not.toHaveBeenCalled();
    expect(createUserMessage.mock.calls).toEqual([["manager task"], ["worker task"], ["manager task"]]);
  });

  test("clearing the tui state empties the container", async () => {
    const { notify, addChild, clear } = bootSync();
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, currentTurn: makeTurn("q") });
    await notify(teamState([agent], AGENT_ID));
    expect(addChild).toHaveBeenCalledTimes(2);
    await notify(makeTuiState());
    expect(clear).toHaveBeenCalledTimes(2);
    expect(addChild).toHaveBeenCalledTimes(2);
  });

  test("a compaction marker renders before the turns that follow it", async () => {
    const { notify, addChild, createCompactionMarker, userMessages, assistantMessages, compactionMarkers } = bootSync();
    const marker = { seq: 0, summary: "the summary", tokensBefore: 500 };
    const agent = makeAgentUiState(AGENT_ID, { isLeader: true, compactionMarker: marker, currentTurn: makeTurn("kept", null, 1) });
    await notify(teamState([agent], AGENT_ID));
    expect(createCompactionMarker).toHaveBeenCalledWith(marker);
    expect(addChild.mock.calls.map((call) => call[0])).toEqual([compactionMarkers[0], userMessages[0], assistantMessages[0]]);
  });

  test("an unchanged compaction marker is not re-created on the next action", async () => {
    const { notify, createCompactionMarker } = bootSync();
    const agent = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { seq: 0, summary: "s", tokensBefore: 1 },
      currentTurn: makeTurn("kept", null, 1),
    });
    const state = teamState([agent], AGENT_ID);
    await notify(state);
    await notify(state);
    expect(createCompactionMarker).toHaveBeenCalledTimes(1);
  });

  test("a re-compaction replaces the marker and the renumbered turns", async () => {
    const { notify, addChild, removeChild, createCompactionMarker } = bootSync();
    const before = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { seq: 0, summary: "first", tokensBefore: 100 },
      history: [makeTurn("kept", null, 1)],
      currentTurn: makeTurn("live", null, 2),
    });
    await notify(teamState([before], AGENT_ID));
    expect(addChild).toHaveBeenCalledTimes(5);
    const after = makeAgentUiState(AGENT_ID, {
      isLeader: true,
      compactionMarker: { seq: 3, summary: "second", tokensBefore: 200 },
      currentTurn: makeTurn("live", null, 4),
    });
    await notify(teamState([after], AGENT_ID));
    expect(removeChild).toHaveBeenCalledTimes(5);
    expect(addChild).toHaveBeenCalledTimes(8);
    expect(createCompactionMarker).toHaveBeenCalledTimes(2);
  });
});
