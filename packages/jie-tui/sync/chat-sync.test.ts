import { Container } from "@earendil-works/pi-tui";
import { Events } from "@cuzfrog/jie-platform";
import { Actions, createStateStore, type StateStore } from "../state";
import { createChatSync } from "./chat-sync";

const SYSTEM_SENDER = { kind: "system" } as const;
const AGENT_SENDER = { kind: "agent", teamId: "my-team", agentKey: "general-1" } as const;

function singleAgentTeam(store: StateStore): void {
  store.dispatch(Actions.receiveEvent(Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey: "general-1",
    history: [],
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
}

function twoAgentTeam(store: StateStore): void {
  store.dispatch(Actions.receiveEvent(Events.teamLoaded(SYSTEM_SENDER, {
    id: "my-team",
    leaderKey: "manager-1",
    history: [],
    agents: [
      { teamId: "my-team", role: "manager", agentKey: "manager-1", isLeader: true, model: null },
      { teamId: "my-team", role: "worker", agentKey: "worker-1", isLeader: false, model: null },
    ],
  })));
}

interface SyncHarness {
  readonly store: StateStore;
  readonly container: Container;
  readonly renders: number;
}

function bootSync(): SyncHarness {
  const store = createStateStore();
  const container = new Container();
  const counter = { value: 0 };
  createChatSync(store, container, () => { counter.value += 1; });
  return { store, container, get renders(): number { return counter.value; } };
}

describe("createChatSync", () => {
  test("starts empty and requests a render on every action", () => {
    const { store, container } = bootSync();
    singleAgentTeam(store);
    expect(container.children.length).toBe(0);
  });

  test("appends a user+assistant pair when a prompt arrives", () => {
    const { store, container } = bootSync();
    singleAgentTeam(store);
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "tell me a story", "general-1")));
    expect(container.children.length).toBe(2);
    expect(container.children[0]!.render(80)[0]).toContain("tell me a story");
  });

  test("streaming chunks update the existing pair in place", () => {
    const { store, container } = bootSync();
    singleAgentTeam(store);
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "q", "general-1")));
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(AGENT_SENDER)));
    store.dispatch(Actions.receiveEvent(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "once upon a time")));
    expect(container.children.length).toBe(2);
    const assistantLines = container.children[1]!.render(80).join(" ");
    expect(assistantLines).toContain("once upon a time");
  });

  test("turn rotation appends a new pair and keeps the completed turn", () => {
    const { store, container } = bootSync();
    singleAgentTeam(store);
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "q1", "general-1")));
    store.dispatch(Actions.receiveEvent(Events.agentTurnStart(AGENT_SENDER)));
    store.dispatch(Actions.receiveEvent(Events.agentStreamChunk(AGENT_SENDER, 1, 1, "text", "a1")));
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "q2", "general-1")));
    expect(container.children.length).toBe(4);
    expect(container.children[0]!.render(80)[0]).toContain("q1");
    expect(container.children[2]!.render(80)[0]).toContain("q2");
  });

  test("switching the focused agent rebuilds the container from that agent's turns", () => {
    const { store, container } = bootSync();
    twoAgentTeam(store);
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "manager task", "manager-1")));
    expect(container.children.length).toBe(2);
    store.dispatch(Actions.switchCycleAgent(1));
    expect(container.children.length).toBe(0);
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "worker task", "worker-1")));
    expect(container.children.length).toBe(2);
    expect(container.children[0]!.render(80)[0]).toContain("worker task");
    store.dispatch(Actions.switchCycleAgent(1));
    expect(container.children.length).toBe(2);
    expect(container.children[0]!.render(80)[0]).toContain("manager task");
  });

  test("clearing the tui state empties the container", () => {
    const { store, container } = bootSync();
    singleAgentTeam(store);
    store.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "my-team", "q", "general-1")));
    expect(container.children.length).toBe(2);
    store.dispatch(Actions.clearTuiState());
    expect(container.children.length).toBe(0);
  });
});
