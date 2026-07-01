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

  test("drainInput(maxMs: 0) returns immediately", async () => {
    const terminal = new VirtualTerminal(80, 24);
    await terminal.start(() => {}, () => {});
    const start = Date.now();
    await terminal.drainInput(0);
    const elapsed = Date.now() - start;
    expect(elapsed < 5).toBe(true);
  });

  test("drainInput(maxMs) honors the bound", async () => {
    const terminal = new VirtualTerminal(80, 24);
    await terminal.start(() => {}, () => {});
    const start = Date.now();
    await terminal.drainInput(40);
    const elapsed = Date.now() - start;
    expect(elapsed >= 35 && elapsed < 200).toBe(true);
  });
});
