import {
  createTuiCommandHandler,
  type CommandHandlerDeps,
  type TuiCommandHandler,
} from "./command-handler";
import { Actions, createStateStore, type StateStore, type TuiState } from "./state";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import type { CommandDispatcher } from "@cuzfrog/jie-platform/command";

function makePlatform(): { platform: JiePlatform; command: ReturnType<typeof vi.fn> } {
  const command = vi.fn();
  const platform = {
    team: { id: "minimal", agents: [] },
    loadTeam: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    getDefaultTeam: vi.fn<() => string | null>(() => null),
    getDefaultModel: vi.fn<() => { provider: string; modelId: string } | null>(() => null),
    listInstalledTeams: vi.fn<() => ReadonlyArray<string>>(() => []),
    getGitStatus: vi.fn(() => ({ branch: "", dirty: false, ahead: 0, behind: 0 })),
    command: command as unknown as CommandDispatcher,
  };
  return { platform: platform as unknown as JiePlatform, command };
}

interface DepsHandle {
  deps: CommandHandlerDeps;
  getState: () => TuiState;
  dispatch: ReturnType<typeof vi.fn>;
}

function makeDeps(platform: JiePlatform): DepsHandle {
  const baseStore = createStateStore();
  let current: TuiState = baseStore.getState();
  const dispatch = vi.fn((action: Parameters<StateStore["dispatch"]>[0]) => {
    baseStore.dispatch(action);
    current = baseStore.getState();
  });
  const stateStore: StateStore = {
    getState: () => current,
    dispatch: (action) => { dispatch(action); },
    subscribe: vi.fn(() => (): void => undefined),
    getFocusedAgent: () => {
      if (current.focusedAgentId === null) return null;
      return current.agents.get(current.focusedAgentId) ?? null;
    },
    isBusy: () => {
      for (const agent of current.agents.values()) {
        if (agent.status === "busy") return true;
      }
      return false;
    },
  };
  const deps: CommandHandlerDeps = {
    stateStore,
    platform,
  };
  return { deps, getState: () => current, dispatch };
}

describe("createTuiCommandHandler", () => {
  test("handle('/help') clears banners then sets a reply message", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler: TuiCommandHandler = createTuiCommandHandler(deps);
    handler.handle("/help");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("/clear")));
  });

  test("handle('/clear') dispatches clearTuiState", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/clear");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTuiState());
  });

  test("handle('/exit') dispatches requestQuit", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/exit");
    expect(dispatch).toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("handle('/nope') sets an error message", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/nope");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/nope")));
  });

  test("handle clears banners before each invocation", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/help");
    expect(dispatch.mock.calls[0]?.[0]).toEqual(Actions.clearBanners());
  });

  test("handle awaits intercept for slash commands", async () => {
    const { platform, command } = makePlatform();
    command.mockResolvedValue({ kind: "ok" });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic sk-test");
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(command).toHaveBeenCalledWith("login", { provider: "anthropic", apiKey: "sk-test" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged in to anthropic")));
  });

  test("intercept errors surface as error messages", async () => {
    const { platform, command } = makePlatform();
    command.mockResolvedValue({ kind: "error", message: "auth failed" });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic sk-test");
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login failed")));
  });
});
