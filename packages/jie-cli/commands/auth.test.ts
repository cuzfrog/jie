import { runApiKey, runLogin, runLogout } from "./auth";
import type { JiePlatform } from "@cuzfrog/jie-platform";

function makePlatform(): { platform: JiePlatform; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async (cmd: { name: string } & Record<string, unknown>) => {
    switch (cmd.name) {
      case "getDefaultModel":
        return null;
      case "login":
      case "logout":
      case "unsetDefaultTeam":
      default:
        return null;
    }
  });
  const platform = {
    team: { id: "minimal", agents: [] },
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute,
  };
  return { platform: platform as unknown as JiePlatform, execute };
}

describe("runLogin", () => {
  test("login --provider anthropic --api-key sk-test -> dispatches login and prints success", async () => {
    const { platform, execute } = makePlatform();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runLogin(
      { kind: "login", provider: "anthropic", apiKey: "sk-test" },
      platform,
    );
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: "sk-test" });
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("logged in to anthropic");
    logSpy.mockRestore();
  });

  test("login without flags -> exit 1, no execute calls", async () => {
    const { platform, execute } = makePlatform();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runLogin({ kind: "login" }, platform);
    expect(code).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("runLogout", () => {
  test("logout anthropic -> dispatches logout with provider", async () => {
    const { platform, execute } = makePlatform();
    await runLogout({ kind: "logout", provider: "anthropic" }, platform);
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
  });

  test("logout (no provider) -> dispatches logout with undefined provider", async () => {
    const { platform, execute } = makePlatform();
    await runLogout({ kind: "logout" }, platform);
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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runApiKey({ kind: "apiKey", apiKey: "sk-new" }, platform);
    expect(code).toBe(0);
    expect(execute).toHaveBeenNthCalledWith(1, { name: "getDefaultModel" });
    expect(execute).toHaveBeenNthCalledWith(2, { name: "login", provider: "anthropic", apiKey: "sk-new" });
    logSpy.mockRestore();
  });

  test("--api-key without defaultProvider -> exit 1", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce(null);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runApiKey({ kind: "apiKey", apiKey: "sk-new" }, platform);
    expect(code).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
