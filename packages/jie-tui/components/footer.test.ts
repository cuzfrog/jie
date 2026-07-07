import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
import { Footer, type FooterContext, type FooterModel } from "./footer";

function makeModel(overrides: Partial<FooterModel> = {}): FooterModel {
  return {
    cwd: "/home/cuz/workspace/jie",
    git: { branch: "main", dirty: false, ahead: 0, behind: 0 },
    ...overrides,
  };
}

function makeContext(overrides: Partial<FooterContext> = {}): FooterContext {
  return {
    focusedStatus: "idle",
    focusedAgentKey: "general-1",
    teamId: "default",
    showRail: false,
    focusedModel: { provider: "openai", id: "gpt-4", effort: "high" },
    ...overrides,
  };
}

async function capture(footer: Footer, cols: number): Promise<string[]> {
  const terminal = new VirtualTerminal(cols, 60);
  terminal.start(() => {}, () => {});
  for (const line of footer.render(cols)) {
    terminal.write(line + "\n");
  }
  return terminal.flushAndGetViewport();
}

describe("Footer", () => {
  test("renders exactly two lines after setContext", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext());
    expect(footer.children.length).toBe(2);
    const viewport = await capture(footer, 120);
    expect(footer.children.length).toBe(2);
    void viewport;
  });

  test("identity line carries cwd (branch) on the left", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext());
    const viewport = await capture(footer, 120);
    expect(viewport.join("\n")).toContain("/home/cuz/workspace/jie (main)");
  });

  test("identity line shows teamId:focusedAgentKey on the right", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext({ teamId: "demo", focusedAgentKey: "general-1" }));
    const viewport = await capture(footer, 120);
    expect(viewport.join("\n")).toContain("demo:general-1");
  });

  test("state line carries the placeholder stats and the model reference", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext({
      focusedModel: { provider: "anthropic", id: "opus-4.8", effort: "max" },
    }));
    const viewport = await capture(footer, 120);
    const flat = viewport.join("\n");
    expect(flat).toContain("0%/200k");
    expect(flat).toContain("(anthropic) opus-4.8 | max");
  });

  test("hint text changes based on rail visibility", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext({ showRail: false }));
    const viewport1 = await capture(footer, 120);
    expect(viewport1.join("\n")).toContain("shift+left for agents");
    footer.setContext(makeModel(), makeContext({ showRail: true }));
    const viewport2 = await capture(footer, 120);
    expect(viewport2.join("\n")).toContain("shift+left close agents");
  });

  test("shows no-team fallback when teamId is null", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext({ teamId: null, focusedAgentKey: null }));
    const viewport = await capture(footer, 120);
    expect(viewport.join("\n")).toContain("no-team:");
  });

  test("dirty git branch shows a star suffix", async () => {
    const footer = new Footer({} as never);
    footer.setContext(
      makeModel({ git: { branch: "main", dirty: true, ahead: 0, behind: 0 } }),
      makeContext(),
    );
    const viewport = await capture(footer, 120);
    expect(viewport.join("\n")).toContain("(main*)");
  });

  test("model text shows em-dash when focusedModel is null", async () => {
    const footer = new Footer({} as never);
    footer.setContext(makeModel(), makeContext({ focusedModel: null }));
    const viewport = await capture(footer, 120);
    expect(viewport.join("\n")).toContain("—");
  });
});
