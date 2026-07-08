import { Editor } from "./editor";
import { TuiContext } from "../context";
import { createStateStore } from "../../state";
import { makeContextValue, renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Editor", () => {
  test("renders the placeholder when buffer is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the placeholder when state.editorText is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });
});