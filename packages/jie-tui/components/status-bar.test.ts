import { createTestTuiWithTerminal } from "../../../tests/support";
import { StatusBar, type StatusBarContext, type StatusBarModel } from "./status-bar";

function makeModel(overrides: Partial<StatusBarModel> = {}): StatusBarModel {
  return {
    cwd: "/home/cuz/workspace/jie",
    git: { branch: "main", dirty: false, ahead: 0, behind: 0 },
    ...overrides,
  };
}

function makeContext(overrides: Partial<StatusBarContext> = {}): StatusBarContext {
  return {
    focusedStatus: "idle",
    focusedAgentKey: "general-1",
    teamId: "default",
    showRail: false,
    focusedModel: { provider: "openai", id: "gpt-4", effort: "high" },
    ...overrides,
  };
}

describe("StatusBar", () => {
  test("setModel updates cwdLine and hintLine text", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext());
    const rendered = bar.render(120);
    const flat = rendered.join("\n");
    expect(flat).toContain("/home/cuz/workspace/jie (main)");
    expect(flat).toContain("default:general-1");
  });

  test("renders the loader glyph when focused agent is busy", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.render(120).join("\n")).toContain("…");
  });

  test("omits the loader glyph when focused agent is idle", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    expect(bar.render(120).join("\n")).not.toContain("…");
  });

  test("renders two children when no focused agent", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: null, focusedAgentKey: null }));
    expect(bar.children.length).toBe(2);
  });

  test("switches loader on when status changes idle → busy", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    expect(bar.render(120).join("\n")).not.toContain("…");
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.render(120).join("\n")).toContain("…");
  });

  test("removes loader on busy → idle", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.render(120).join("\n")).toContain("…");
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    expect(bar.render(120).join("\n")).not.toContain("…");
  });

  test("hint text reflects rail visibility", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ showRail: false }));
    expect(bar.render(120).join("\n")).toContain("ctrl+left for agents");
    bar.setModel(makeModel(), makeContext({ showRail: true }));
    expect(bar.render(120).join("\n")).toContain("ctrl+left close agents");
  });

  test("model text shows em-dash when focusedModel is null", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedModel: null }));
    expect(bar.render(120).join("\n")).toContain("—");
  });

  test("model text shows provider, model id, and effort", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedModel: { provider: "openai", id: "gpt-4", effort: "high" } }));
    const flat = bar.render(120).join("\n");
    expect(flat).toContain("(openai) gpt-4");
    expect(flat).toContain("| high");
  });

  test("render delegates to container and does not mutate children", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    const before = bar.children.length;
    const lines = bar.render(120);
    expect(lines.length).toBeGreaterThan(0);
    expect(bar.children.length).toBe(before);
  });
});
