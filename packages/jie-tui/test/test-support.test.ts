import { Container, Text } from "@earendil-works/pi-tui";
import { createTestTui, createTestTuiWithTerminal } from "./test-support";

describe("createTestTui", () => {
  test("createTestTui returns a TUI attached to an 80x24 VirtualTerminal", () => {
    const tui = createTestTui();
    expect(tui).toBeDefined();
    expect(tui.children).toEqual([]);
  });

  test("createTestTuiWithTerminal exposes both handle and terminal", async () => {
    const { tui, terminal } = createTestTuiWithTerminal(80, 30);
    expect(tui).toBeDefined();
    expect(terminal.columns).toBe(80);
    expect(terminal.rows).toBe(30);

    tui.addChild(new Container());
    tui.addChild(new Text("hello"));
    tui.start();
    await terminal.waitForRender();
    const viewport = terminal.getViewport();
    expect(viewport.length).toBe(30);
  });
});
