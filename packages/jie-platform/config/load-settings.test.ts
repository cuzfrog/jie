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

  test("accepts a valid defaultEffort", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { defaultEffort: "high" });
    const result = loadMergedSettings(home, null);
    expect(result.defaultEffort).toBe("high");
  });

  test("accepts a valid modelFilters", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { modelFilters: ["qwen", "gpt"] });
    const result = loadMergedSettings(home, null);
    expect(result.modelFilters).toEqual(["qwen", "gpt"]);
  });

  test("accepts a valid compaction block", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), {
      compaction: { enabled: false, reserveTokens: 8192, keepRecentTokens: 10000 },
    });
    const result = loadMergedSettings(home, null);
    expect(result.compaction).toEqual({ enabled: false, reserveTokens: 8192, keepRecentTokens: 10000 });
  });

  test("accepts a partial compaction block and keeps unset fields absent", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { compaction: { enabled: false } });
    const result = loadMergedSettings(home, null);
    expect(result.compaction).toEqual({ enabled: false });
  });

  test("ignores unknown keys inside compaction", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { compaction: { enabled: true, foo: "bar" } });
    const result = loadMergedSettings(home, null);
    expect(result.compaction).toEqual({ enabled: true });
  });

  test("deep-merges compaction per field while other keys override shallowly", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(home, "settings.json"), {
      defaultProvider: "anthropic",
      compaction: { enabled: true, reserveTokens: 8192 },
    });
    writeJson(join(project, "settings.json"), {
      defaultProvider: "openai",
      compaction: { reserveTokens: 4096 },
    });
    const result = loadMergedSettings(home, project);
    expect(result).toEqual({
      defaultProvider: "openai",
      compaction: { enabled: true, reserveTokens: 4096 },
    });
  });

  test("project-only compaction passes through the merge", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(home, "settings.json"), { defaultProvider: "anthropic" });
    writeJson(join(project, "settings.json"), { compaction: { keepRecentTokens: 10000 } });
    const result = loadMergedSettings(home, project);
    expect(result).toEqual({
      defaultProvider: "anthropic",
      compaction: { keepRecentTokens: 10000 },
    });
  });

  test("rejects an unparseable settings file with code INVALID_CONFIG naming the file", () => {
    const home = track(freshDir("jie-home-"));
    writeFileSync(join(home, "settings.json"), "{ not json", "utf-8");
    expect(() => loadMergedSettings(home, null)).toThrow(
      expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringMatching(/settings\.json/) }),
    );
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
    {
      name: "defaultEffort not in the effort vocabulary",
      field: "defaultEffort",
      value: "extreme",
      match: /invalid defaultEffort/,
    },
    {
      name: "non-string defaultEffort",
      field: "defaultEffort",
      value: 42,
      match: /invalid defaultEffort/,
    },
    {
      name: "non-array modelFilters",
      field: "modelFilters",
      value: "qwen",
      match: /modelFilters must be an array of non-empty strings/,
    },
    {
      name: "modelFilters containing an empty string",
      field: "modelFilters",
      value: ["qwen", ""],
      match: /modelFilters must be an array of non-empty strings/,
    },
    {
      name: "modelFilters containing a non-string",
      field: "modelFilters",
      value: [42],
      match: /modelFilters must be an array of non-empty strings/,
    },
    {
      name: "non-object compaction",
      field: "compaction",
      value: "on",
      match: /compaction must be an object/,
    },
    {
      name: "array compaction",
      field: "compaction",
      value: [16384],
      match: /compaction must be an object/,
    },
    {
      name: "null compaction",
      field: "compaction",
      value: null,
      match: /compaction must be an object/,
    },
    {
      name: "non-boolean compaction.enabled",
      field: "compaction",
      value: { enabled: "yes" },
      match: /compaction\.enabled must be a boolean/,
    },
    {
      name: "non-number compaction.reserveTokens",
      field: "compaction",
      value: { reserveTokens: "8192" },
      match: /compaction\.reserveTokens must be a positive integer/,
    },
    {
      name: "non-integer compaction.reserveTokens",
      field: "compaction",
      value: { reserveTokens: 8192.5 },
      match: /compaction\.reserveTokens must be a positive integer/,
    },
    {
      name: "zero compaction.reserveTokens",
      field: "compaction",
      value: { reserveTokens: 0 },
      match: /compaction\.reserveTokens must be a positive integer/,
    },
    {
      name: "negative compaction.keepRecentTokens",
      field: "compaction",
      value: { keepRecentTokens: -1 },
      match: /compaction\.keepRecentTokens must be a positive integer/,
    },
  ])("rejects $name with code INVALID_CONFIG", ({ field, value, match }) => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "settings.json"), { [field]: value });
    expect(() => loadMergedSettings(home, null)).toThrow(
      expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringMatching(match) }),
    );
  });
});
