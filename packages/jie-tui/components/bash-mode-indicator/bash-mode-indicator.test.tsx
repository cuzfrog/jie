import { render } from "../../test-renderer";
import { TuiContext } from "../context";
import { makeContextValue } from "../../test-support";
import { Actions, createStateStore } from "../../state";
import { BashModeIndicator, bashModeIndicatorHeight } from "./bash-mode-indicator";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function mountIndicator(editorText: string): { lastFrame: () => string; unmount: () => void } {
  const stateStore = createStateStore();
  stateStore.dispatch(Actions.setEditorText(editorText));
  const ctx = makeContextValue({ stateStore, state: stateStore.getState() });
  const out = render(
    <TuiContext.Provider value={ctx}>
      <BashModeIndicator />
    </TuiContext.Provider>,
  );
  return { lastFrame: () => out.lastFrame() ?? "", unmount: out.unmount };
}

describe("BashModeIndicator", () => {
  test("renders nothing for a plain prompt", () => {
    const { lastFrame, unmount } = mountIndicator("hello world");
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("renders nothing for an empty buffer", () => {
    const { lastFrame, unmount } = mountIndicator("");
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("renders nothing for a bare ! with no command", () => {
    const { lastFrame, unmount } = mountIndicator("!");
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("announces bash mode for a ! command", () => {
    const { lastFrame, unmount } = mountIndicator("!ls -la");
    const frame = lastFrame();
    expect(frame).toContain("! bash mode");
    expect(frame).toContain("kept in context");
    unmount();
  });

  test("announces context exclusion for a !! command", () => {
    const { lastFrame, unmount } = mountIndicator("!!ls -la");
    const frame = lastFrame();
    expect(frame).toContain("!! bash mode");
    expect(frame).toContain("excluded from context");
    unmount();
  });
});

describe("bashModeIndicatorHeight", () => {
  test("reports zero rows when the buffer is not a bash command", () => {
    expect(bashModeIndicatorHeight("")).toBe(0);
    expect(bashModeIndicatorHeight("plain prompt")).toBe(0);
    expect(bashModeIndicatorHeight("!")).toBe(0);
    expect(bashModeIndicatorHeight("!!")).toBe(0);
  });

  test("reports one row when the buffer parses as a bash command", () => {
    expect(bashModeIndicatorHeight("!ls")).toBe(1);
    expect(bashModeIndicatorHeight("!!ls")).toBe(1);
    expect(bashModeIndicatorHeight("  !ls")).toBe(1);
  });
});
