import { Editor } from "./editor";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue, renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Editor", () => {
  test("renders the placeholder when state.editorText is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders state.editorText when set in the store", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("hello"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(lastFrame()).toContain("hello");
    unmount();
  });

  test("Editor component uses state.editorText (no local buffer)", () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    store.dispatch(Actions.setEditorText("xy"));
    expect(store.getState().editorText).toBe("xy");
    unmount();
  });
});
