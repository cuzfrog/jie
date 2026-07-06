import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
import { createTestTuiWithTerminal } from "../../../tests/support";
import { EditorSlot } from "./editor-slot";

async function capture(slot: EditorSlot, cols: number): Promise<string[]> {
  const terminal = new VirtualTerminal(cols, 30);
  terminal.start(() => {}, () => {});
  for (const line of slot.render(cols)) {
    terminal.write(line.slice(0, cols) + "\n");
  }
  return terminal.flushAndGetViewport();
}

describe("EditorSlot — view", () => {
  test("renders the typed text in the viewport", async () => {
    const { tui } = createTestTuiWithTerminal(80, 30);
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setText("a sample prompt");
    const viewport = await capture(slot, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("prompt");
  });

  test("renders the placeholder when editor is empty", async () => {
    const { tui } = createTestTuiWithTerminal(80, 30);
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    const viewport = await capture(slot, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("type a prompt");
  });

  test("border lines wrap the prompt", async () => {
    const { tui } = createTestTuiWithTerminal(80, 30);
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setText("hello");
    const viewport = await capture(slot, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("─");
  });

  test("queue indicator surfaces in the viewport when set", async () => {
    const { tui } = createTestTuiWithTerminal(80, 30);
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setQueueIndicator("2 prompts queued  > also write a haiku");
    const viewport = await capture(slot, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("2 prompts queued");
    expect(flat).toContain("also write a haiku");
  });
});
