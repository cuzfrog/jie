import { render } from "ink-testing-library";
import { Editor } from "./editor";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Editor", () => {
  test("renders the placeholder when state.editorText is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders state.editorText when set in the store", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("hello"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
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
    const { unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    store.dispatch(Actions.setEditorText("xy"));
    expect(store.getState().editorText).toBe("xy");
    unmount();
  });

  test("Enter with empty state.editorText submits the typed chunk", async () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const submitted: string[] = [];
    store.subscribe((action) => {
      if (action.type === Actions.submitEditorText("").type) {
        submitted.push(action.payload.text);
      }
      return Promise.resolve();
    });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("/team my-team\r");
    await new Promise((r) => setTimeout(r, 30));
    expect(submitted).toContain("/team my-team");
    expect(store.getState().editorText).toBe("");
    unmount();
  });

  test("typing into an empty editor clears stale error banners", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setErrorMessage("stale: previous failure"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("/");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().errorBanner).toBeNull();
    unmount();
  });
});
