import { GlobalKeyBindings } from "./global-keys";
import { createStateStore } from "../state";
import { makePlatform, renderComponent } from "../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("GlobalKeyBindings", () => {
  test("renders nothing (returns null)", () => {
    const store = createStateStore();
    const platform = makePlatform();
    const { lastFrame, unmount } = renderComponent(
      <GlobalKeyBindings
        stateStore={store}
        platform={platform}
        onToggleThinking={() => undefined}
        onToggleToolCards={() => undefined}
      />,
    );
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("accepts a custom now() clock", () => {
    const store = createStateStore();
    const platform = makePlatform();
    const { unmount } = renderComponent(
      <GlobalKeyBindings
        stateStore={store}
        platform={platform}
        onToggleThinking={() => undefined}
        onToggleToolCards={() => undefined}
        now={() => 12345}
      />,
    );
    unmount();
  });
});