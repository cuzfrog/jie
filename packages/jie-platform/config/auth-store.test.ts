import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeAuthStore } from "./auth-store";

describe("AuthStore", () => {
  let homeDir: string;
  let homeJieDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-auth-"));
    homeJieDir = join(homeDir, ".jie");
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("load() on missing auth.json returns {}", () => {
    const store = makeAuthStore(homeJieDir);
    expect(store.load()).toEqual({});
  });

  test("write() creates ~/.jie/auth.json with mode 0o600 and valid JSON", () => {
    const store = makeAuthStore(homeJieDir);
    const auth = { anthropic: { type: "api_key" as const, key: "sk-test" } };
    store.write(auth);

    const path = join(homeJieDir, "auth.json");
    expect(existsSync(path)).toBe(true);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual(auth);
  });

  test("write() then load() round-trips", () => {
    const store = makeAuthStore(homeJieDir);
    store.write({ anthropic: { type: "api_key", key: "sk-a" } });
    expect(store.load()).toEqual({ anthropic: { type: "api_key", key: "sk-a" } });
  });

  test("setProvider() returns a new auth with the provider entry added", () => {
    const store = makeAuthStore(homeJieDir);
    const next = store.setProvider({}, "anthropic", "sk-1");
    expect(next).toEqual({ anthropic: { type: "api_key", key: "sk-1" } });
  });

  test("setProvider() is immutable — does not mutate input", () => {
    const store = makeAuthStore(homeJieDir);
    const before: ReturnType<typeof store.load> = {};
    const next = store.setProvider(before, "anthropic", "sk-1");
    expect(before).toEqual({});
    expect(next).not.toBe(before);
  });

  test("removeProvider() returns a new auth without the provider entry", () => {
    const store = makeAuthStore(homeJieDir);
    const next = store.removeProvider(
      { anthropic: { type: "api_key", key: "sk-a" }, openai: { type: "api_key", key: "sk-o" } },
      "anthropic",
    );
    expect(next).toEqual({ openai: { type: "api_key", key: "sk-o" } });
  });

  test("removeProvider() is immutable — does not mutate input", () => {
    const store = makeAuthStore(homeJieDir);
    const before = { anthropic: { type: "api_key" as const, key: "sk-a" } };
    store.removeProvider(before, "anthropic");
    expect(before).toEqual({ anthropic: { type: "api_key", key: "sk-a" } });
  });

  test("clear() returns an empty auth", () => {
    const store = makeAuthStore(homeJieDir);
    expect(store.clear()).toEqual({});
  });
});