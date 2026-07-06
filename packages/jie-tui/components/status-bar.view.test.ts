import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
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
    focusedModel: { provider: "anthropic", id: "opus-4.8", effort: "max" },
    transientMessage: null,
    errorBanner: null,
    ...overrides,
  };
}

async function capture(bar: StatusBar, cols: number): Promise<string[]> {
  const terminal = new VirtualTerminal(cols, 60);
  terminal.start(() => {}, () => {});
  for (const line of bar.render(cols)) {
    terminal.write(line + "\n");
  }
  return terminal.flushAndGetViewport();
}

describe("StatusBar — view", () => {
  test("identity line shows cwd (branch) on the left", async () => {
    const bar = new StatusBar({} as never);
    bar.setModel(makeModel(), makeContext());
    const viewport = await capture(bar, 120);
    const flat = viewport.join("\n");
    expect(flat).toContain("/home/cuz/workspace/jie (main)");
  });

  test("identity line carries teamId:agentKey on the right", async () => {
    const bar = new StatusBar({} as never);
    bar.setModel(makeModel(), makeContext({ teamId: "demo", focusedAgentKey: "general-1" }));
    const viewport = await capture(bar, 120);
    const flat = viewport.join("\n");
    expect(flat).toContain("demo:general-1");
  });

  test("state line carries the placeholder stats and the model reference", async () => {
    const bar = new StatusBar({} as never);
    bar.setModel(makeModel(), makeContext({
      focusedModel: { provider: "anthropic", id: "opus-4.8", effort: "max" },
    }));
    const viewport = await capture(bar, 120);
    const flat = viewport.join("\n");
    expect(flat).toContain("0%/200k");
    expect(flat).toContain("(anthropic) opus-4.8 | max");
  });

  test("hint text changes based on rail visibility", async () => {
    const bar = new StatusBar({} as never);
    bar.setModel(makeModel(), makeContext({ showRail: false }));
    const viewport1 = await capture(bar, 120);
    expect(viewport1.join("\n")).toContain("ctrl+left for agents");
    bar.setModel(makeModel(), makeContext({ showRail: true }));
    const viewport2 = await capture(bar, 120);
    expect(viewport2.join("\n")).toContain("ctrl+left close agents");
  });

  test("shows no-team fallback when teamId is null", async () => {
    const bar = new StatusBar({} as never);
    bar.setModel(makeModel(), makeContext({ teamId: null, focusedAgentKey: null }));
    const viewport = await capture(bar, 120);
    const flat = viewport.join("\n");
    expect(flat).toContain("no-team:");
  });

  test("dirty git branch shows a star suffix", async () => {
    const bar = new StatusBar({} as never);
    bar.setModel(
      makeModel({ git: { branch: "main", dirty: true, ahead: 0, behind: 0 } }),
      makeContext(),
    );
    const viewport = await capture(bar, 120);
    const flat = viewport.join("\n");
    expect(flat).toContain("(main*)");
  });
});
