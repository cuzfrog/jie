import { VirtualTerminal } from "./virtual-terminal";

describe("VirtualTerminal smoke", () => {
  test("viewport returns one line per row", async () => {
    const terminal = new VirtualTerminal(80, 30);
    await terminal.start(() => {}, () => {});
    await terminal.flush();
    const viewport = terminal.getViewport();
    expect(viewport.length).toBe(30);
  });

  test("resize changes rows", async () => {
    const terminal = new VirtualTerminal(80, 24);
    terminal.resize(80, 40);
    expect(terminal.rows).toBe(40);
  });
});
