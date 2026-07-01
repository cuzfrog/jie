import { Container, Text } from "@earendil-works/pi-tui";
import { createTestTuiWithTerminal } from "./test-support";

describe("createTestTuiWithTerminal", () => {
  test("exposes both handle and terminal", async () => {
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
