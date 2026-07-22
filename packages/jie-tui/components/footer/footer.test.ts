import { Events } from "@cuzfrog/jie-platform";
import { visibleWidth } from "@earendil-works/pi-tui";
import { Actions, createStateStore, type StateStore } from "../../state";
import { Footer } from "./footer";

function seededStore(dirty: boolean): StateStore {
  const store = createStateStore();
  store.dispatch(Actions.setEnvironment("/repo", "dev", dirty));
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "my-team",
    leaderKey: "general-1",
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  return store;
}

function seededStoreWithModel(): StateStore {
  const store = seededStore(false);
  store.dispatch(Actions.receiveEvent(Events.agentModelAssigned(
    { kind: "agent", teamId: "my-team", agentKey: "general-1" },
    "anthropic",
    "claude-opus-4",
    "high",
  )));
  return store;
}

describe("Footer", () => {
  test("renders two lines: identity with cwd/branch left and team:agent right", () => {
    const lines = new Footer(seededStore(false)).render(80);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("/repo (dev)");
    expect(lines[0]).toContain("my-team:general-1");
  });

  test("marks a dirty worktree with a star after the branch", () => {
    const lines = new Footer(seededStore(true)).render(80);
    expect(lines[0]).toContain("(dev*)");
  });

  test("falls back to main when no branch is known and to no-team without a team", () => {
    const store = createStateStore();
    store.dispatch(Actions.setEnvironment("/repo", "", false));
    const lines = new Footer(store).render(80);
    expect(lines[0]).toContain("/repo (main)");
    expect(lines[0]).toContain("no-team:—");
  });

  test("line two reports placeholders when no model is assigned", () => {
    const lines = new Footer(seededStore(false)).render(80);
    expect(lines[1]).toContain("—");
  });

  test("line two keeps context on the left and right-aligns the model segment at the right edge", () => {
    const lines = new Footer(seededStoreWithModel()).render(80);
    const plain = stripAnsi(lines[1]);
    expect(visibleWidth(lines[1])).toBe(80);
    expect(plain.endsWith("(anthropic) claude-opus-4 | high")).toBe(true);
    expect(plain).toMatch(/\S {2,}\(anthropic\) claude-opus-4 \| high$/);
    expect(plain.trimStart().startsWith("(anthropic)")).toBe(false);
  });

  test("every line fits the given width", () => {
    const lines = new Footer(seededStore(true)).render(60);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(60);
    }
  });

  test("never renders a line wider than the given width with over-long identity (doRender guard)", () => {
    const longTeam = "x".repeat(300);
    const store = createStateStore();
    store.dispatch(Actions.setEnvironment(`/${longTeam}`, "中文🎉".repeat(40), true));
    store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: longTeam,
      leaderKey: "general-1",
      agents: [{ teamId: longTeam, role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    store.dispatch(Actions.receiveEvent(Events.agentModelAssigned(
      { kind: "agent", teamId: longTeam, agentKey: "general-1" },
      "provider",
      "y".repeat(300),
      "high",
    )));
    const footer = new Footer(store);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of footer.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
