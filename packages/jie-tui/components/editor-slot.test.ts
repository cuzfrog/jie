import { EditorSlot } from "./editor-slot";
import { createTestTuiWithTerminal } from "../../../tests/support";

describe("EditorSlot", () => {
  test("setText then getText round-trips", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setText("hello world");
    expect(slot.getText()).toBe("hello world");
  });

  test("render reflects the typed text", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setText("a sample prompt");
    expect(slot.render(80).join("\n")).toContain("a sample prompt");
  });

  test("renders the queue indicator with the next-prompt preview when non-empty", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setQueueIndicator("2 prompts queued  > Also write me a haiku");
    const flat = slot.render(80).join("\n");
    expect(flat).toContain("2 prompts queued");
    expect(flat).toContain("Also write me a haiku");
  });

  test("clears the queue indicator when set to null", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    slot.setQueueIndicator("1 prompt queued  > alpha");
    slot.setQueueIndicator(null);
    const flat = slot.render(80).join("\n");
    expect(flat).not.toContain("queued");
  });
});
