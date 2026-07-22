import { Events } from "@cuzfrog/jie-platform";
import { visibleWidth } from "@earendil-works/pi-tui";
import { Actions, createStateStore, type StateStore } from "../state";
import { KeyHints } from "./key-hints";

const AGENT_SENDER = { kind: "agent", teamId: "my-team", agentKey: "general-1" } as const;

function emptyStore(): StateStore {
  const store = createStateStore();
  store.dispatch(Actions.setEnvironment("/repo", "dev", false));
  return store;
}

function storeWithTeam(): StateStore {
  const store = emptyStore();
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "my-team",
    leaderKey: "general-1",
    history: [],
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  return store;
}

function storeWithTurn(): StateStore {
  const store = storeWithTeam();
  store.dispatch(Actions.receiveEvent(Events.agentTurnStart(AGENT_SENDER)));
  return store;
}

describe("KeyHints", () => {
  test("renders hint lines while there is no conversation", () => {
    const text = new KeyHints(emptyStore()).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("enter send");
    expect(text).toContain("tab complete");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+d quit");
  });

  test("still shows the hints once a team is loaded but idle", () => {
    const lines = new KeyHints(storeWithTeam()).render(200);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map(stripAnsi).join("\n")).toContain("enter send");
  });

  test("hides the hints once a turn is in progress", () => {
    expect(new KeyHints(storeWithTurn()).render(200)).toEqual([]);
  });

  test("lays the hints out on a single line when the width is ample", () => {
    expect(new KeyHints(emptyStore()).render(300).length).toBe(1);
  });

  test("wraps the hints across more lines as the width narrows", () => {
    const wide = new KeyHints(emptyStore()).render(300).length;
    const narrow = new KeyHints(emptyStore()).render(60).length;
    expect(narrow).toBeGreaterThan(wide);
  });

  test("every hint line fits the given width", () => {
    const hints = new KeyHints(emptyStore());
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of hints.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
