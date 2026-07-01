import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidTeamId,
  loadMinimalTeam,
  loadTeamFromDir,
  parseTeamFromManifests,
} from "./loader";
import { JiePlatformError, type JiePlatformErrorCode } from "../types";

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
    expect(soul.systemPrompt.length).toBeGreaterThan(0);
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
    expect(bp.roles[0]?.systemPrompt).toBe("First line.\nSecond line.\n");
  });

  test("empty team directory returns an empty blueprint with null leader", () => {
    const bp = loadTeamFromDir(dir);
    expect(bp.roles).toEqual([]);
    expect(bp.leaderRole).toBeNull();
  });
});

describe("parseTeamFromManifests", () => {});

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

describe("loadTeamFromDir — typed error codes (issue #65)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-loader-codes-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function expectCode(fn: () => unknown, code: JiePlatformErrorCode): void {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(JiePlatformError);
      expect((error as JiePlatformError).code).toBe(code);
      return;
    }
    throw new Error(`expected throw with code '${code}', got no throw`);
  }

  test("invalid_team_id", () => {
    expectCode(
      () => parseTeamFromManifests({}, { teamId: "bad id!" }),
      "INVALID_TEAM_ID",
    );
  });

  test("invalid_role", () => {
    writeFileSync(join(dir, "bad role.md"), "---\ntools:\n  - bash\n---\n");
    expectCode(() => loadTeamFromDir(dir), "INVALID_ROLE");
  });

  test("invalid_frontmatter", () => {
    writeFileSync(join(dir, "general.md"), "no frontmatter here\n");
    expectCode(() => loadTeamFromDir(dir), "INVALID_FRONTMATTER");
  });

  test("missing_required_field", () => {
    writeFileSync(join(dir, "general.md"), "---\nrole: general\n---\n");
    expectCode(() => loadTeamFromDir(dir), "MISSING_REQUIRED_FIELD");
  });

  test("invalid_field_type (tools not a list)", () => {
    writeFileSync(join(dir, "general.md"), "---\ntools: bash\n---\n");
    expectCode(() => loadTeamFromDir(dir), "INVALID_FIELD_TYPE");
  });

  test("subscribe_rejects_platform_topic", () => {
    writeFileSync(
      join(dir, "general.md"),
      "---\ntools:\n  - bash\nsubscribe:\n  - agent.stream.chunk\n---\n",
    );
    expectCode(() => loadTeamFromDir(dir), "SUBSCRIBE_REJECTS_PLATFORM_TOPIC");
  });

  test("invalid_model_string", () => {
    writeFileSync(
      join(dir, "general.md"),
      "---\ntools:\n  - bash\nmodel: no-slash\n---\n",
    );
    expectCode(() => loadTeamFromDir(dir), "INVALID_MODEL_STRING");
  });

  test("leader_required (multi-agent, no TEAM.md leader)", () => {
    writeFileSync(join(dir, "a.md"), "---\ntools:\n  - bash\n---\n");
    writeFileSync(join(dir, "b.md"), "---\ntools:\n  - bash\n---\n");
    writeFileSync(
      join(dir, "TEAM.md"),
      "---\nleader: \"\"\n---\n",
    );
    expectCode(() => loadTeamFromDir(dir), "LEADER_REQUIRED");
  });

  test("team_file_required (multi-agent, no TEAM.md via parseTeamFromManifests)", () => {
    expectCode(
      () => parseTeamFromManifests(
        { "a.md": "---\ntools:\n  - bash\n---\n", "b.md": "---\ntools:\n  - bash\n---\n" },
        { teamId: "t" },
      ),
      "TEAM_FILE_REQUIRED",
    );
  });

  test("leader_unknown (TEAM.md leader refers to missing role, multi-agent)", () => {
    writeFileSync(join(dir, "TEAM.md"), "---\nleader: ghost\n---\n");
    writeFileSync(join(dir, "a.md"), "---\ntools:\n  - bash\n---\n");
    writeFileSync(join(dir, "b.md"), "---\ntools:\n  - bash\n---\n");
    expectCode(() => loadTeamFromDir(dir), "LEADER_UNKNOWN");
  });

  test("leader_mismatch (single-agent, TEAM.md leader differs)", () => {
    writeFileSync(join(dir, "TEAM.md"), "---\nleader: wrong\n---\n");
    writeFileSync(join(dir, "general.md"), "---\ntools:\n  - bash\n---\n");
    expectCode(() => loadTeamFromDir(dir), "LEADER_MISMATCH");
  });
});
