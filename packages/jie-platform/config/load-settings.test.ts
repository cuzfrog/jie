import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMergedSettings } from "./load-settings";

function freshDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf-8");
}

describe("loadMergedSettings", () => {
  const tmpRoots: string[] = [];
  function track(path: string): string {
    tmpRoots.push(path);
    return path;
  }
  afterEach(() => {
    for (const path of tmpRoots) rmSync(path, { recursive: true, force: true });
    tmpRoots.length = 0;
  });

  test("returns {} when neither global nor project settings exist", () => {
    const home = track(freshDir("jie-home-"));
    const result = loadMergedSettings(home, null);
    expect(result).toEqual({});
  });

  test("loads global settings when only global exists", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), {
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-6",
    });
    const result = loadMergedSettings(home, null);
    expect(result).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-6",
    });
  });

  test("loads project settings when only project exists", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(project, "settings.json"), {
      defaultProvider: "openai",
      defaultModel: "gpt-5",
    });
    const result = loadMergedSettings(home, project);
    expect(result).toEqual({
      defaultProvider: "openai",
      defaultModel: "gpt-5",
    });
  });

  test("project settings override global on key conflict", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(home, "settings.json"), {
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-6",
    });
    writeJson(join(project, "settings.json"), {
      defaultModel: "claude-sonnet-4-6",
    });
    const result = loadMergedSettings(home, project);
    expect(result).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4-6",
    });
  });

  test("merges non-overlapping keys from both layers", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(home, "settings.json"), { defaultProvider: "anthropic" });
    writeJson(join(project, "settings.json"), { defaultModel: "claude-opus-4-6" });
    const result = loadMergedSettings(home, project);
    expect(result).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-6",
    });
  });

  test("ignores unknown fields silently", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), {
      defaultProvider: "anthropic",
      someUnknownField: "ignored",
    });
    const result = loadMergedSettings(home, null);
    expect(result).toEqual({ defaultProvider: "anthropic" });
  });

  test("accepts a valid defaultTeam", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { defaultTeam: "my-team-1" });
    const result = loadMergedSettings(home, null);
    expect(result.defaultTeam).toBe("my-team-1");
  });

  test.each([
    {
      name: "defaultTeam with invalid characters",
      field: "defaultTeam",
      value: "bad team!",
      match: /invalid defaultTeam/,
    },
    {
      name: "defaultTeam longer than 32 characters",
      field: "defaultTeam",
      value: "a".repeat(33),
      match: /invalid defaultTeam/,
    },
    {
      name: "non-string defaultProvider",
      field: "defaultProvider",
      value: 42,
      match: /defaultProvider must be a string/,
    },
    {
      name: "non-string defaultModel",
      field: "defaultModel",
      value: true,
      match: /defaultModel must be a string/,
    },
    {
      name: "non-string defaultTeam",
      field: "defaultTeam",
      value: 42,
      match: /defaultTeam must be a string/,
    },
  ])("rejects $name with code INVALID_CONFIG", ({ field, value, match }) => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { [field]: value });
    expect(() => loadMergedSettings(home, null)).toThrow(
      expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringMatching(match) }),
    );
  });
});
