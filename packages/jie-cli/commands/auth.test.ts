import type { AuthStore, SettingsStore } from "@cuzfrog/jie-platform/config";
import { runApiKey, runLogin, runLogout } from "./auth";

type AuthJson = Record<string, { type: "api_key"; key: string }>;

const auth = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const settings = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

describe("runLogin", () => {
  beforeEach(() => {
    auth.load.mockReturnValue({});
    auth.setProvider.mockImplementation(
      (current: AuthJson, provider: string, key: string): AuthJson => ({
        ...current,
        [provider]: { type: "api_key", key },
      }),
    );
  });

  test("login --provider anthropic --api-key sk-test calls load -> setProvider -> write with the right args and prints success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runLogin(
      { kind: "login", provider: "anthropic", apiKey: "sk-test" },
      auth,
    );
    expect(code).toBe(0);
    expect(auth.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-test");
    expect(auth.saveAuthConfig).toHaveBeenCalledWith({ anthropic: { type: "api_key", key: "sk-test" } });
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("logged in to anthropic");
    logSpy.mockRestore();
  });

  test("login without flags -> exit 1, no load/setProvider/write calls", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runLogin({ kind: "login" }, auth);
    expect(code).toBe(1);
    expect(auth.load).not.toHaveBeenCalled();
    expect(auth.setProvider).not.toHaveBeenCalled();
    expect(auth.saveAuthConfig).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test("login merges with existing entries (passes the loaded auth to setProvider)", async () => {
    const existing: AuthJson = { openai: { type: "api_key", key: "sk-o" } };
    auth.load.mockReturnValueOnce(existing);
    const code = await runLogin(
      { kind: "login", provider: "anthropic", apiKey: "sk-a" },
      auth,
    );
    expect(code).toBe(0);
    expect(auth.setProvider).toHaveBeenCalledWith(existing, "anthropic", "sk-a");
    expect(auth.saveAuthConfig).toHaveBeenCalledWith({
      openai: { type: "api_key", key: "sk-o" },
      anthropic: { type: "api_key", key: "sk-a" },
    });
  });
});

describe("runLogout", () => {
  beforeEach(() => {
    auth.load.mockReturnValue({});
  });

  test("logout anthropic removes only the anthropic entry", async () => {
    const initial: AuthJson = {
      anthropic: { type: "api_key", key: "sk-a" },
      openai: { type: "api_key", key: "sk-o" },
    };
    auth.load.mockReturnValueOnce(initial);
    auth.removeProvider.mockImplementation(
      (current: AuthJson, provider: string): AuthJson => {
        const next = { ...current };
        delete next[provider as keyof typeof next];
        return next as AuthJson;
      },
    );
    const code = await runLogout({ kind: "logout", provider: "anthropic" }, auth);
    expect(code).toBe(0);
    expect(auth.removeProvider).toHaveBeenCalledWith(initial, "anthropic");
    expect(auth.saveAuthConfig).toHaveBeenCalledWith({ openai: { type: "api_key", key: "sk-o" } });
  });

  test("logout (no provider) clears all entries", async () => {
    auth.clear.mockReturnValue({});
    const code = await runLogout({ kind: "logout" }, auth);
    expect(code).toBe(0);
    expect(auth.clear).toHaveBeenCalled();
    expect(auth.saveAuthConfig).toHaveBeenCalledWith({});
  });

  test("logout a missing provider is a no-op on the result but still writes", async () => {
    const initial: AuthJson = { openai: { type: "api_key", key: "sk-o" } };
    auth.load.mockReturnValueOnce(initial);
    auth.removeProvider.mockImplementation(
      (current: AuthJson, provider: string): AuthJson => {
        const next = { ...current };
        delete next[provider as keyof typeof next];
        return next as AuthJson;
      },
    );
    const code = await runLogout({ kind: "logout", provider: "ghost" }, auth);
    expect(code).toBe(0);
    expect(auth.removeProvider).toHaveBeenCalledWith(initial, "ghost");
    expect(auth.saveAuthConfig).toHaveBeenCalledWith({ openai: { type: "api_key", key: "sk-o" } });
  });
});

describe("runApiKey (top-level --api-key)", () => {
  beforeEach(() => {
    auth.load.mockReturnValue({});
    auth.setProvider.mockImplementation(
      (current: AuthJson, provider: string, key: string): AuthJson => ({
        ...current,
        [provider]: { type: "api_key", key },
      }),
    );
  });

  test("--api-key sk-new writes auth.json for defaultProvider and exits 0", async () => {
    settings.load.mockReturnValueOnce({ defaultProvider: "anthropic" });
    const code = await runApiKey({ kind: "apiKey", apiKey: "sk-new" }, settings, auth);
    expect(code).toBe(0);
    expect(settings.load).toHaveBeenCalled();
    expect(auth.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-new");
    expect(auth.saveAuthConfig).toHaveBeenCalledWith({ anthropic: { type: "api_key", key: "sk-new" } });
  });

  test("--api-key without defaultProvider -> exit 1, no auth.json written", async () => {
    settings.load.mockReturnValueOnce({});
    const code = await runApiKey({ kind: "apiKey", apiKey: "sk-new" }, settings, auth);
    expect(code).toBe(1);
    expect(auth.saveAuthConfig).not.toHaveBeenCalled();
  });
});
