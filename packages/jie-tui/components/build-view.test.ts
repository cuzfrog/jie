import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { INITIAL_TUI_STATE } from "../state";
import { createTestTuiWithTerminal } from "../test";
import { buildView } from "./build-view";
import { AgentsRail } from "./agents-rail";
import { ChatPane } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { StatusBar } from "./status-bar";
import { ConfirmExitOverlay } from "./confirm-exit-overlay";

const OPTS = { cwd: "", branch: "", provider: "", modelId: "", effort: "" };

describe("buildView", () => {
  test("returns a Container root", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(INITIAL_TUI_STATE, OPTS, tui);
    expect(result.root).toBeInstanceOf(Container);
  });

  test("exposes each component separately", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(INITIAL_TUI_STATE, OPTS, tui);
    expect(result.rail).toBeInstanceOf(AgentsRail);
    expect(result.chatPane).toBeInstanceOf(ChatPane);
    expect(result.editor).toBeInstanceOf(EditorSlot);
    expect(result.statusBar).toBeInstanceOf(StatusBar);
    expect(result.confirmExit).toBeInstanceOf(ConfirmExitOverlay);
  });

  test("rail + chat + editor + statusBar + confirmExit are children of root", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(INITIAL_TUI_STATE, OPTS, tui);
    const classes = result.root.children.map((c) => c.constructor.name);
    expect(classes).toContain(AgentsRail.name);
    expect(classes).toContain(ChatPane.name);
    expect(classes).toContain(EditorSlot.name);
    expect(classes).toContain(StatusBar.name);
    expect(classes).toContain(ConfirmExitOverlay.name);
    expect(classes).toContain(Spacer.name);
    expect(classes).toContain(Text.name);
  });
});
