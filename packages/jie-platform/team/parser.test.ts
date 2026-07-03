import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidTeamId,
  loadMinimalTeam,
  loadTeamFromDir,
  parseTeamFromManifests,
} from "./parser";
import type { JiePlatformErrorCode } from "../types";

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

describe("loadTeamFromDir — typed error codes", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-loader-codes-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function expectCode(fn: () => unknown, code: JiePlatformErrorCode): void {
    expect(fn).toThrow(
      expect.objectContaining({ code }),
    );
  }

  function setupFiles(files: Record<string, string>): void {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  }

  test.each([
    {
      name: "invalid_team_id",
      setup: () => undefined,
      act: () => parseTeamFromManifests({}, { teamId: "bad id!" }),
      code: "INVALID_TEAM_ID",
    },
    {
      name: "invalid_role (filename has space)",
      setup: () => setupFiles({ "bad role.md": "---\ntools:\n  - bash\n---\n" }),
      act: () => loadTeamFromDir(dir),
      code: "INVALID_ROLE",
    },
    {
      name: "invalid_frontmatter (missing ---)",
      setup: () => setupFiles({ "general.md": "no frontmatter here\n" }),
      act: () => loadTeamFromDir(dir),
      code: "INVALID_FRONTMATTER",
    },
    {
      name: "missing_required_field (no tools)",
      setup: () => setupFiles({ "general.md": "---\nrole: general\n---\n" }),
      act: () => loadTeamFromDir(dir),
      code: "MISSING_REQUIRED_FIELD",
    },
    {
      name: "invalid_field_type (tools not a list)",
      setup: () => setupFiles({ "general.md": "---\ntools: bash\n---\n" }),
      act: () => loadTeamFromDir(dir),
      code: "INVALID_FIELD_TYPE",
    },
    {
      name: "subscribe_rejects_platform_topic",
      setup: () => setupFiles({
        "general.md": "---\ntools:\n  - bash\nsubscribe:\n  - agent.stream.chunk\n---\n",
      }),
      act: () => loadTeamFromDir(dir),
      code: "SUBSCRIBE_REJECTS_PLATFORM_TOPIC",
    },
    {
      name: "invalid_model_string (no slash)",
      setup: () => setupFiles({ "general.md": "---\ntools:\n  - bash\nmodel: no-slash\n---\n" }),
      act: () => loadTeamFromDir(dir),
      code: "INVALID_MODEL_STRING",
    },
    {
      name: "leader_required (multi-agent, empty leader)",
      setup: () => setupFiles({
        "a.md": "---\ntools:\n  - bash\n---\n",
        "b.md": "---\ntools:\n  - bash\n---\n",
        "TEAM.md": "---\nleader: \"\"\n---\n",
      }),
      act: () => loadTeamFromDir(dir),
      code: "LEADER_REQUIRED",
    },
    {
      name: "team_file_required (no TEAM.md, parseTeamFromManifests)",
      setup: () => undefined,
      act: () => parseTeamFromManifests(
        { "a.md": "---\ntools:\n  - bash\n---\n", "b.md": "---\ntools:\n  - bash\n---\n" },
        { teamId: "t" },
      ),
      code: "TEAM_FILE_REQUIRED",
    },
    {
      name: "leader_unknown (TEAM.md leader refers to missing role)",
      setup: () => setupFiles({
        "TEAM.md": "---\nleader: ghost\n---\n",
        "a.md": "---\ntools:\n  - bash\n---\n",
        "b.md": "---\ntools:\n  - bash\n---\n",
      }),
      act: () => loadTeamFromDir(dir),
      code: "LEADER_UNKNOWN",
    },
    {
      name: "leader_mismatch (single-agent, TEAM.md leader differs)",
      setup: () => setupFiles({
        "TEAM.md": "---\nleader: wrong\n---\n",
        "general.md": "---\ntools:\n  - bash\n---\n",
      }),
      act: () => loadTeamFromDir(dir),
      code: "LEADER_MISMATCH",
    },
  ])("$name", ({ setup, act, code }) => {
    setup();
    expectCode(act, code);
  });
});
