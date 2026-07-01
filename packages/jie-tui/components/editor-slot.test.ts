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
});

describe("editorSlotFromCommands", () => {
  test("constructs a slot with the given commands", () => {
    const { tui } = createTestTuiWithTerminal();
    const slot = editorSlotFromCommands(tui, process.cwd(), COMMANDS);
    slot.setText("/lo");
    expect(slot.render(80).join("\n")).toContain("/lo");
  });
});
