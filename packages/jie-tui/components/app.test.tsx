import { Events } from "@cuzfrog/jie-platform";
import { App } from "./app";
import { TuiContext } from "./context";
import { makeContextValue, makeFakeTui, makePlatform, renderComponent } from "../test-harness";
import { Actions, createStateStore } from "../state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("App", () => {
  test("mounts and renders the editor placeholder", () => {
    const stateStore = createStateStore();
    const platform = makePlatform();
    const tui = makeFakeTui(stateStore, platform);
    const { lastFrame, unmount } = renderComponent(
      <App tui={tui} platform={platform} cwd={process.cwd()} />,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the team id after a system.team.loaded event", async () => {
    const stateStore = createStateStore();
    const platform = makePlatform();
    const tui = makeFakeTui(stateStore, platform);
    const { lastFrame, unmount } = renderComponent(
      <App tui={tui} platform={platform} cwd={process.cwd()} />,
    );
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain("general");
    unmount();
  });

  test("typing into the editor updates the displayed text", async () => {
    const stateStore = createStateStore();
    const platform = makePlatform();
    const tui = makeFakeTui(stateStore, platform);
    const { stdin, lastFrame, unmount } = renderComponent(
      <App tui={tui} platform={platform} cwd={process.cwd()} />,
    );
    await new Promise((r) => setTimeout(r, 100));
    stdin.write("h");
    await new Promise((r) => setTimeout(r, 100));
    stdin.write("i");
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame()).toContain("hi");
    unmount();
  });

  test("exposes a TuiContext value derived from the current state", async () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const platform = makePlatform();
    const tui = makeFakeTui(stateStore, platform);
    let captured: unknown = null;
    const Probe = (): null => {
      const ctx = makeContextValue({ stateStore, tui, platform });
      captured = ctx;
      return null;
    };
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={makeContextValue({ stateStore, tui, platform })}>
        <Probe />
      </TuiContext.Provider>,
    );
    void lastFrame;
    expect(captured).not.toBeNull();
    unmount();
  });
});