import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidTeamId,
  loadMinimalTeam,
  loadTeamFromDir,
  parseTeamFromManifests,
} from "./loader.ts";

describe("loadMinimalTeam", () => {
  test("returns one soul with role 'general' and leaderRole 'general'", () => {
    const bp = loadMinimalTeam();
    expect(bp.leaderRole).toBe("general");
    expect(bp.roles).toHaveLength(1);
    expect(bp.roles[0]?.role).toBe("general");
  });

  test("the general soul has tools [bash, read_file, write_file] and empty subscribe", () => {
    const bp = loadMinimalTeam();
    const soul = bp.roles[0]!;
    expect(soul.tools).toEqual(["bash", "read_file", "write_file"]);
    expect(soul.subscribe).toEqual([]);
    expect(soul.subscriptions).toEqual([]);
  });

  test("the general soul has a non-empty system_prompt and no model pinned", () => {
    const bp = loadMinimalTeam();
    const soul = bp.roles[0]!;
    expect(soul.system_prompt.length).toBeGreaterThan(0);
    expect(soul.model).toBe("");
  });
});

describe("loadTeamFromDir", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-team-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("single-agent team without TEAM.md: implicit leader", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\n---\nsolo body`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles).toHaveLength(1);
    expect(bp.roles[0]?.role).toBe("general");
    expect(bp.leaderRole).toBe("general");
  });

  test("multi-agent team with TEAM.md: leader from TEAM.md", () => {
    writeFileSync(
      join(dir, "TEAM.md"),
      `---\nleader: leader\n---\n`,
    );
    writeFileSync(
      join(dir, "leader.md"),
      `---\ntools:\n  - bash\n---\nleader body`,
    );
    writeFileSync(
      join(dir, "worker.md"),
      `---\ntools:\n  - bash\n---\nworker body`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles.map((r) => r.role)).toEqual(["leader", "worker"]);
    expect(bp.leaderRole).toBe("leader");
  });

  test("TEAM.md leader references unknown role: hard fail", () => {
    writeFileSync(
      join(dir, "TEAM.md"),
      `---\nleader: ghost\n---\n`,
    );
    writeFileSync(
      join(dir, "leader.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    writeFileSync(
      join(dir, "worker.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(
      /TEAM\.md 'leader' field references unknown role 'ghost'/,
    );
  });

  test("TEAM.md missing for multi-agent: hard fail", () => {
    writeFileSync(
      join(dir, "leader.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    writeFileSync(
      join(dir, "worker.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(
      /TEAM\.md is required for multi-agent teams/,
    );
  });

  test("TEAM.md with empty leader and multi-agent: hard fail", () => {
    writeFileSync(join(dir, "TEAM.md"), `---\nleader:\n---\n`);
    writeFileSync(
      join(dir, "leader.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    writeFileSync(
      join(dir, "worker.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(
      /TEAM\.md 'leader' field is required/,
    );
  });

  test("single-agent team with TEAM.md: leader must match", () => {
    writeFileSync(
      join(dir, "TEAM.md"),
      `---\nleader: wrong\n---\n`,
    );
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(
      /does not match the single agent role/,
    );
  });

  test("duplicate role stem detection is defensive (the OS prevents exact-name duplicates)", () => {
    // The duplicate-stem check is defensive code. A case-sensitive
    // filesystem prevents two files with the same name in one
    // directory, so `loadTeamFromDir` cannot produce a duplicate
    // stem in practice. The check exists to guard against future
    // input methods or case-insensitive filesystems (e.g. macOS).
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles.map((r) => r.role)).toEqual(["general"]);
  });

  test("invalid team_id (spaces): hard fail", () => {
    const bad = join(tmpdir(), "bad team id with spaces");
    mkdirSync(bad, { recursive: true });
    writeFileSync(
      join(bad, "general.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    try {
      expect(() => loadTeamFromDir(bad)).toThrow(/invalid team_id/);
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
  });

  test("invalid role stem (spaces): hard fail", () => {
    writeFileSync(
      join(dir, "bad role.md"),
      `---\ntools:\n  - bash\n---\n`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(/invalid role: bad role/);
  });

  test("missing 'tools' field: hard fail", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\nmodel: anthropic/claude\n---\nbody`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(
      /missing required field 'tools'/,
    );
  });

  test("subscribe: with platform topic (agent. prefix) is rejected", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\nsubscribe:\n  - agent.idle\n---\nbody`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(
      /subscribe_rejects_platform_topic/,
    );
  });

  test("subscribe: with domain topic is accepted and stored", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\nsubscribe:\n  - task.recorded\n---\nbody`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.subscribe).toEqual(["task.recorded"]);
    expect(bp.roles[0]?.subscriptions).toEqual(["task.recorded"]);
  });

  test("agent with model field is parsed; model format validated", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\nmodel: anthropic/claude-sonnet-4\ntools:\n  - bash\n---\nbody`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.model).toBe("anthropic/claude-sonnet-4");
  });

  test("agent with malformed model (no /) is rejected", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\nmodel: not-a-model\ntools:\n  - bash\n---\nbody`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(/invalid model string/);
  });

  test("system_prompt is the verbatim prose body after the closing frontmatter", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\n---\nFirst line.\nSecond line.\n`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.system_prompt).toBe("First line.\nSecond line.\n");
  });

  test("empty team directory returns an empty blueprint with null leader", () => {
    const bp = loadTeamFromDir(dir);
    expect(bp.roles).toEqual([]);
    expect(bp.leaderRole).toBeNull();
  });
});

describe("parseTeamFromManifests", () => {
  test("delegates to the same parser used for user teams (no special-casing)", () => {
    const bp = parseTeamFromManifests(
      {
        "TEAM.md": `---\nleader: general\n---\n`,
        "general.md": `---\ntools:\n  - bash\n---\nbody`,
      },
      { teamId: "minimal" },
    );
    expect(bp.leaderRole).toBe("general");
    expect(bp.roles[0]?.role).toBe("general");
  });
});

describe("isValidTeamId", () => {
  test("accepts the v1 charset: [A-Za-z0-9_-]{1,32}", () => {
    expect(isValidTeamId("a")).toBe(true);
    expect(isValidTeamId("team")).toBe(true);
    expect(isValidTeamId("team_1")).toBe(true);
    expect(isValidTeamId("team-1")).toBe(true);
    expect(isValidTeamId("minimal")).toBe(true);
    expect(isValidTeamId("ABCxyz0123")).toBe(true);
    expect(isValidTeamId("a".repeat(32))).toBe(true);
  });

  test("rejects empty string", () => {
    expect(isValidTeamId("")).toBe(false);
  });

  test("rejects strings longer than 32 chars", () => {
    expect(isValidTeamId("a".repeat(33))).toBe(false);
    expect(isValidTeamId("a".repeat(64))).toBe(false);
  });

  test("rejects characters outside [A-Za-z0-9_-]", () => {
    expect(isValidTeamId("a b")).toBe(false);
    expect(isValidTeamId("a.b")).toBe(false);
    expect(isValidTeamId("a/b")).toBe(false);
    expect(isValidTeamId("a:b")).toBe(false);
    expect(isValidTeamId("a@b")).toBe(false);
  });
});