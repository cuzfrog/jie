import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeAuthStore, makeSettingsStore } from "@cuzfrog/jie-platform/config";
import { runApiKey, runLogin, runLogout } from "./auth.ts";

describe("runLogin", () => {
  let homeDir: string;
  let auth: ReturnType<typeof makeAuthStore>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-login-"));
    auth = makeAuthStore(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("login --provider anthropic --api-key sk-test writes auth.json and prints success", async () => {
    const code = await runLogin(
      { kind: "login", provider: "anthropic", apiKey: "sk-test" },
      auth,
    );
    expect(code).toBe(0);
    const path = join(homeDir, ".jie", "auth.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      anthropic: { type: "api_key", key: "sk-test" },
    });
  });

  test("login without flags -> exit 1, no auth.json written", async () => {
    const code = await runLogin({ kind: "login" }, auth);
    expect(code).toBe(1);
    expect(existsSync(join(homeDir, ".jie", "auth.json"))).toBe(false);
  });

  test("login merges with existing entries (preserves prior providers)", async () => {
    auth.write({ openai: { type: "api_key", key: "sk-o" } });
    const code = await runLogin(
      { kind: "login", provider: "anthropic", apiKey: "sk-a" },
      auth,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "auth.json"), "utf-8"))).toEqual({
      openai: { type: "api_key", key: "sk-o" },
      anthropic: { type: "api_key", key: "sk-a" },
    });
  });
});

describe("runLogout", () => {
  let homeDir: string;
  let auth: ReturnType<typeof makeAuthStore>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-logout-"));
    auth = makeAuthStore(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("logout anthropic removes only the anthropic entry", async () => {
    auth.write({
      anthropic: { type: "api_key", key: "sk-a" },
      openai: { type: "api_key", key: "sk-o" },
    });
    const code = await runLogout({ kind: "logout", provider: "anthropic" }, auth);
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "auth.json"), "utf-8"))).toEqual({
      openai: { type: "api_key", key: "sk-o" },
    });
  });

  test("logout (no provider) clears all entries", async () => {
    auth.write({ anthropic: { type: "api_key", key: "sk-a" } });
    const code = await runLogout({ kind: "logout" }, auth);
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "auth.json"), "utf-8"))).toEqual({});
  });

  test("logout a missing provider is a no-op (no error)", async () => {
    auth.write({ openai: { type: "api_key", key: "sk-o" } });
    const code = await runLogout({ kind: "logout", provider: "ghost" }, auth);
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "auth.json"), "utf-8"))).toEqual({
      openai: { type: "api_key", key: "sk-o" },
    });
  });
});

describe("runApiKey (top-level --api-key)", () => {
  let homeDir: string;
  let cwd: string;
  let auth: ReturnType<typeof makeAuthStore>;
  let settings: ReturnType<typeof makeSettingsStore>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-apikey-"));
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-apikey-cwd-"));
    auth = makeAuthStore(homeDir);
    settings = makeSettingsStore(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("--api-key sk-new writes auth.json for defaultProvider and exits 0", async () => {
    mkdirSync(join(cwd, ".jie"), { recursive: true });
    writeFileSync(
      join(cwd, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" }),
    );
    const code = await runApiKey(
      { kind: "apiKey", apiKey: "sk-new" },
      cwd,
      settings,
      auth,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "auth.json"), "utf-8"))).toEqual({
      anthropic: { type: "api_key", key: "sk-new" },
    });
  });

  test("--api-key without defaultProvider -> exit 1, no auth.json written", async () => {
    const code = await runApiKey(
      { kind: "apiKey", apiKey: "sk-new" },
      cwd,
      settings,
      auth,
    );
    expect(code).toBe(1);
    expect(existsSync(join(homeDir, ".jie", "auth.json"))).toBe(false);
  });
});
