import { Container } from "@earendil-works/pi-tui";
import { createStateStore } from "../state";
import { createTestTuiWithTerminal } from "../../../tests/support";
import { buildView } from "./build-view";
import { AgentsRail } from "./agents-rail";
import { ChatPane } from "./chat-pane";
import { EditorSlot } from "./editor-slot";
import { Footer } from "./footer";
import { Actions } from "../state";

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
    expect(result.footer).toBeInstanceOf(Footer);
  });

  test("rail is in the body when showTeamRailPanel is true", () => {
    const store = createStateStore();
    store.dispatch(Actions.toggleTeamRail());
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(store, OPTS, tui);
    let found = false;
    const walk = (node: unknown): void => {
      if (node === result.rail) { found = true; return; }
      if (typeof node === "object" && node !== null && "children" in node) {
        const children = (node as { children: ReadonlyArray<unknown> }).children;
        for (const c of children) walk(c);
      }
    };
    walk(result.root);
    expect(found).toBe(true);
  });

  test("chat pane is always in the body", () => {
    const store = createStateStore();
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(store, OPTS, tui);
    let found = false;
    const walk = (node: unknown): void => {
      if (node === result.chatPane) { found = true; return; }
      if (typeof node === "object" && node !== null && "children" in node) {
        const children = (node as { children: ReadonlyArray<unknown> }).children;
        for (const c of children) walk(c);
      }
    };
    walk(result.root);
    expect(found).toBe(true);
  });

  test("editor and footer are direct children of root", () => {
    const { tui } = createTestTuiWithTerminal();
    const result = buildView(createStateStore(), OPTS, tui);
    expect(result.root.children).toContain(result.editor);
    expect(result.root.children).toContain(result.footer);
  });
});
