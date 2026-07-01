import { EditorSlot, editorSlotFromCommands } from "./editor-slot";
import { createTestTuiWithTerminal } from "../test";
import type { SlashCommand } from "@earendil-works/pi-tui";

const COMMANDS: SlashCommand[] = [
  { name: "/login", description: "log in" },
  { name: "/logout", description: "log out" },
  { name: "/model", description: "set model" },
  { name: "/team", description: "set team" },
  { name: "/clear", description: "clear chat" },
  { name: "/help", description: "show help" },
  { name: "/exit", description: "exit" },
];

describe("EditorSlot", () => {
  test("renders editor with empty text", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    const lines = slot.render(80);
    expect(lines.length).toBeGreaterThan(0);
  });

  test("getText returns empty string initially", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = new EditorSlot(tui, { basePath: process.cwd() });
    expect(slot.getText()).toBe("");
  });

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

  test("onSubmit fires with submitted text", () => {
    const { tui } = createTestTuiWithTerminal();
    let captured: string | null = null;
    const slot = new EditorSlot(tui, {
      basePath: process.cwd(),
      onSubmit: (text) => { captured = text; },
    });
    slot.setText("submit me");
    if (slot["editor"].onSubmit !== undefined) {
      slot["editor"].onSubmit("submit me");
    }
    expect(captured === "submit me").toBe(true);
  });

  test("onChange fires with new text", () => {
    const { tui } = createTestTuiWithTerminal();
    let captured: string | null = null;
    const slot = new EditorSlot(tui, {
      basePath: process.cwd(),
      onChange: (text) => { captured = text; },
    });
    if (slot["editor"].onChange !== undefined) {
      slot["editor"].onChange("changed");
    }
    expect(captured === "changed").toBe(true);
  });
});

describe("editorSlotFromCommands", () => {
  test("constructs a slot with the given commands", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = editorSlotFromCommands(tui, process.cwd(), COMMANDS);
    slot.setText("/lo");
    expect(slot.render(80).join("\n")).toContain("/lo");
  });
});
