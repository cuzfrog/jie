import { Editor } from "./editor";
import { Actions, createStateStore } from "../../state";
import { renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Editor", () => {
  test("renders the placeholder when buffer is empty", () => {
    const store = createStateStore();
    const { lastFrame, unmount } = renderComponent(
      <Editor stateStore={store} onSubmit={() => undefined} />,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the placeholder when state.editorText is empty", () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("draft"));
    store.dispatch(Actions.setEditorText(""));
    const { lastFrame, unmount } = renderComponent(
      <Editor stateStore={store} onSubmit={() => undefined} />,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });
});