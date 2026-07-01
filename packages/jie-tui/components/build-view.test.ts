import { Container } from "@earendil-works/pi-tui";
import { INITIAL_TUI_STATE } from "../state";
import { createTestTuiWithTerminal } from "../../../tests/support";
import { buildView } from "./build-view";
import { AgentsRail } from "./agents-rail";
import { ChatPane } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { StatusBar } from "./status-bar";
import { ConfirmExitOverlay } from "./confirm-exit-overlay";

const OPTS = { cwd: "", git: { branch: "", dirty: false, ahead: 0, behind: 0 } };

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

  test("root children include each exposed component by reference", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(INITIAL_TUI_STATE, OPTS, tui);
    expect(result.root.children).toContain(result.rail);
    expect(result.root.children).toContain(result.chatPane);
    expect(result.root.children).toContain(result.editor);
    expect(result.root.children).toContain(result.statusBar);
    expect(result.root.children).toContain(result.confirmExit);
  });
});
