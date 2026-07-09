import { render } from "ink-testing-library";
import { GlobalKeyBindings } from "./global-keys";
import { TuiContext } from "./context";
import { createStateStore } from "../state";
import { makeContextValue } from "../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("GlobalKeyBindings", () => {
  test("renders nothing (returns null)", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <GlobalKeyBindings />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("accepts a custom now() clock", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { unmount } = render(
      <TuiContext.Provider value={ctx}>
        <GlobalKeyBindings now={() => 12345} />
      </TuiContext.Provider>,
    );
    unmount();
  });
});