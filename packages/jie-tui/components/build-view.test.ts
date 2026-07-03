import { Container } from "@earendil-works/pi-tui";
import { createStateStore } from "../state";
import { createTestTuiWithTerminal } from "../../../tests/support";
import { buildView } from "./build-view";
import { AgentsRail } from "./agents-rail";
import { ChatPane } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { StatusBar } from "./status-bar";

const OPTS = { cwd: "" };

describe("buildView", () => {
  test("returns a Container root", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(createStateStore(), OPTS, tui);
    expect(result.root).toBeInstanceOf(Container);
  });

  test("exposes each component separately", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(createStateStore(), OPTS, tui);
    expect(result.rail).toBeInstanceOf(AgentsRail);
    expect(result.chatPane).toBeInstanceOf(ChatPane);
    expect(result.editor).toBeInstanceOf(EditorSlot);
    expect(result.statusBar).toBeInstanceOf(StatusBar);
  });

  test("root children include each exposed component by reference", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(createStateStore(), OPTS, tui);
    expect(result.root.children).toContain(result.rail);
    expect(result.root.children).toContain(result.chatPane);
    expect(result.root.children).toContain(result.editor);
    expect(result.root.children).toContain(result.statusBar);
  });
});
