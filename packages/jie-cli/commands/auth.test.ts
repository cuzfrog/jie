import { type Command, type CommandName, type CommandResult, type JiePlatform } from "@cuzfrog/jie-platform";
import { type Console } from "@cuzfrog/jie-utils";
import { runApiKey, runLogin, runLogout } from "./auth";

function makeConsoleMock(): Console {
  return {
    print: vi.fn(),
    error: vi.fn(),
    write: vi.fn(),
  };
}

function makePlatform(): { platform: JiePlatform; execute: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn(async <T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> => {
    if (command.name === "getDefaultModel") return null as CommandResult<T>;
    return null as CommandResult<T>;
  });
  const platform: JiePlatform = {
    settings: {},
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: dispatch,
    teams: () => [],
  };
  return { platform, execute: dispatch };
}

describe("runLogin", () => {
  test("login --provider anthropic --api-key sk-test -> dispatches login and prints success", async () => {
    const { platform, execute } = makePlatform();
    const consoleMock = makeConsoleMock();
    const code = await runLogin(
      { kind: "login", provider: "anthropic", apiKey: "sk-test" },
      platform,
      consoleMock,
    );
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: "sk-test" });
    expect(consoleMock.print).toHaveBeenCalledWith("logged in to anthropic");
  });

  test("login without flags -> exit 1, no execute calls", async () => {
    const { platform, execute } = makePlatform();
    const consoleMock = makeConsoleMock();
    const code = await runLogin({ kind: "login" }, platform, consoleMock);
    expect(code).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(consoleMock.error).toHaveBeenCalledWith("interactive login not implemented in v1; use --provider and --api-key");
  });
});

describe("runLogout", () => {
  test("logout anthropic -> dispatches logout with provider", async () => {
    const { platform, execute } = makePlatform();
    const consoleMock = makeConsoleMock();
    await runLogout({ kind: "logout", provider: "anthropic" }, platform, consoleMock);
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
  });

  test("logout (no provider) -> dispatches logout with undefined provider", async () => {
    const { platform, execute } = makePlatform();
    const consoleMock = makeConsoleMock();
    await runLogout({ kind: "logout" }, platform, consoleMock);
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: undefined });
  });
});

describe("runApiKey (top-level --api-key)", () => {
  test("--api-key sk-new with defaultProvider set -> dispatches getDefaultModel then login", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { name: string } & Record<string, unknown>) => {
      if (cmd.name === "getDefaultModel") return { provider: "anthropic", modelId: "claude-sonnet-4" };
      return null;
    });
    const consoleMock = makeConsoleMock();
    const code = await runApiKey({ kind: "apiKey", apiKey: "sk-new" }, platform, consoleMock);
    expect(code).toBe(0);
    expect(execute).toHaveBeenNthCalledWith(1, { name: "getDefaultModel" });
    expect(execute).toHaveBeenNthCalledWith(2, { name: "login", provider: "anthropic", apiKey: "sk-new" });
    expect(consoleMock.print).toHaveBeenCalledWith("logged in to anthropic");
  });

  test("--api-key without defaultProvider -> exit 1", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce(null);
    const consoleMock = makeConsoleMock();
    const code = await runApiKey({ kind: "apiKey", apiKey: "sk-new" }, platform, consoleMock);
    expect(code).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(consoleMock.error).toHaveBeenCalledWith(
      "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
    );
  });
});
