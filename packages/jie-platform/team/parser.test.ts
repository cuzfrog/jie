import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidTeamId,
  loadDefaultSoloTeam,
  loadTeamFromDir,
  parseTeamFromManifests,
} from "./parser";
import type { JiePlatformErrorCode } from "../jie-platform-errors";

describe("loadDefaultSoloTeam", () => {
  test("returns one soul with role 'general' and leaderRole 'general'", () => {
    const bp = loadDefaultSoloTeam();
    expect(bp.leaderRole).toBe("general");
    expect(bp.roles).toHaveLength(1);
    expect(bp.roles[0]?.role).toBe("general");
  });

  test("the general soul has tools [bash, read_file, write_file, edit_file, memory_search] and empty subscribe", () => {
    const bp = loadDefaultSoloTeam();
    const soul = bp.roles[0]!;
    expect(soul.tools).toEqual(["bash", "read_file", "write_file", "edit_file", "memory_search"]);
    expect(soul.subscribe).toEqual([]);
  });

  test("the general soul has a non-empty system_prompt and no model pinned", () => {
    const bp = loadDefaultSoloTeam();
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

  test("agent with target_context_window_size stores the value", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\ntarget_context_window_size: 30000\n---\nsolo body`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.targetContextWindowSize).toBe(30000);
  });

  test("invalid target_context_window_size is rejected", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\ntarget_context_window_size: 0\n---\nsolo body`,
    );
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_FIELD_TYPE" }));
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
  });

  test("skills: with spec strings is accepted and stored", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\ntools:\n  - bash\nskills:\n  - deploy\n  - "test-*"\n---\nbody`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.skills).toEqual(["deploy", "test-*"]);
  });

  test("absent skills defaults to an empty list", () => {
    writeFileSync(join(dir, "general.md"), `---\ntools:\n  - bash\n---\nbody`);
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.skills).toEqual([]);
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
    expect(isValidTeamId("default-solo")).toBe(true);
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
      name: "tools list concatenated with sibling key is rejected (string tool name)",
      setup: () => setupFiles({ "general.md": "---\ntools:\n  - bashsubscribe:\n  - task\n---\n" }),
      act: () => loadTeamFromDir(dir),
      code: "INVALID_FIELD_TYPE",
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
      name: "invalid_field_type (skills not a list)",
      setup: () => setupFiles({ "general.md": "---\ntools:\n  - bash\nskills: deploy\n---\n" }),
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

describe("parseTeamFromManifests — lifecycle", () => {
  const roleFiles: Record<string, string> = {
    "manager.md": "---\ntools:\n  - notify\n---\nmanager",
    "researcher.md": "---\ntools:\n  - notify\n---\nresearcher",
    "architect.md": "---\ntools:\n  - notify\n---\narchitect",
    "planner.md": "---\ntools:\n  - notify\n---\nplanner",
    "implementer.md": "---\ntools:\n  - notify\n---\nimplementer",
    "reviewer.md": "---\ntools:\n  - notify\n---\nreviewer",
  };

  function parse(lifecycleYaml: string) {
    return parseTeamFromManifests(
      { ...roleFiles, "TEAM.md": `---\nleader: manager\n${lifecycleYaml}---\nProse.` },
      { teamId: "t" },
    );
  }

  test("absent lifecycle parses to null", () => {
    expect(parse("").lifecycle).toBeNull();
  });

  test("parses transitions, iteration flags, wildcards, and write gates", () => {
    const lifecycle = parse(
      `lifecycle:
  max_iterations: 3
  permanent_phases:
    - done
  transitions:
    - topic: task.recorded
      role: manager
      from: any
      phase: recorded
      iteration: reset
    - topic: task.planned
      role: planner
      from:
        - designed
        - review_failed
      phase: planned
      iteration: increment
    - topic: task.failed
      role: any
      from: any
      phase: failed
  write_gates:
    - pattern: "**/CONTEXT.md"
      roles:
        - architect
`,
    ).lifecycle;
    expect(lifecycle).toEqual({
      maxIterations: 3,
      permanentPhases: ["done"],
      transitions: [
        { topic: "task.recorded", role: "manager", fromPhases: "any", toPhase: "recorded", iteration: "reset" },
        { topic: "task.planned", role: "planner", fromPhases: ["designed", "review_failed"], toPhase: "planned", iteration: "increment" },
        { topic: "task.failed", role: "any", fromPhases: "any", toPhase: "failed", iteration: null },
      ],
      writeGates: [{ pattern: "**/CONTEXT.md", roles: ["architect"] }],
    });
  });

  test("max_iterations defaults to 5, permanent_phases and write_gates to empty", () => {
    const lifecycle = parse(
      `lifecycle:
  transitions:
    - topic: task.recorded
      role: manager
      from: any
      phase: recorded
`,
    ).lifecycle;
    expect(lifecycle?.maxIterations).toBe(5);
    expect(lifecycle?.permanentPhases).toEqual([]);
    expect(lifecycle?.writeGates).toEqual([]);
  });

  test("from: single string normalizes to a one-phase list", () => {
    const lifecycle = parse(
      `lifecycle:
  transitions:
    - topic: task.researched
      role: researcher
      from: recorded
      phase: researched
`,
    ).lifecycle;
    expect(lifecycle?.transitions[0]?.fromPhases).toEqual(["recorded"]);
  });

  test("lifecycle must be a mapping", () => {
    expect(() => parse("lifecycle: manager\n")).toThrow(expect.objectContaining({ code: "INVALID_FIELD_TYPE" }));
  });

  test("transition row requires topic, from, and phase", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - role: manager
      from: any
      phase: recorded
`),
    ).toThrow(expect.objectContaining({ code: "MISSING_REQUIRED_FIELD" }));
  });

  test("unknown role in a transition is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.recorded
      role: ghost
      from: any
      phase: recorded
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("unknown role in a write gate is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  write_gates:
    - pattern: "**/CONTEXT.md"
      roles:
        - ghost
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("empty from list is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.recorded
      role: manager
      from: []
      phase: recorded
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("invalid iteration value is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.recorded
      role: manager
      from: any
      phase: recorded
      iteration: double
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_FIELD_TYPE" }));
  });

  test("max_iterations must be a positive integer", () => {
    expect(() => parse("lifecycle:\n  max_iterations: 0\n")).toThrow(
      expect.objectContaining({ code: "INVALID_LIFECYCLE" }),
    );
    expect(() => parse("lifecycle:\n  max_iterations: many\n")).toThrow(
      expect.objectContaining({ code: "INVALID_FIELD_TYPE" }),
    );
  });

  test("duplicate transition for the same topic, role, and from-phase is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.planned
      role: planner
      from: designed
      phase: planned
    - topic: task.planned
      role: planner
      from: designed
      phase: planned
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("write gate requires pattern and roles", () => {
    expect(() =>
      parse(`lifecycle:
  write_gates:
    - roles:
        - architect
`),
    ).toThrow(expect.objectContaining({ code: "MISSING_REQUIRED_FIELD" }));
  });

  test("empty topic is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: ""
      role: manager
      from: any
      phase: recorded
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("empty phase is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.recorded
      role: manager
      from: any
      phase: ""
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("empty from phase is rejected as string and inside a list", () => {
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.recorded
      role: manager
      from: ""
      phase: recorded
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
    expect(() =>
      parse(`lifecycle:
  transitions:
    - topic: task.recorded
      role: manager
      from:
        - designed
        - ""
      phase: recorded
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });

  test("empty write gate pattern is rejected", () => {
    expect(() =>
      parse(`lifecycle:
  write_gates:
    - pattern: ""
      roles:
        - manager
`),
    ).toThrow(expect.objectContaining({ code: "INVALID_LIFECYCLE" }));
  });
});

describe("loadTeamFromDir — shipped default-coders blueprint", () => {
  const defaultCodersDir = join(import.meta.dir, "../../jie-team/default-coders");

  test("parses with the declared lifecycle", () => {
    const blueprint = loadTeamFromDir(defaultCodersDir);
    expect(blueprint.leaderRole).toBe("manager");
    expect(blueprint.lifecycle).toEqual({
      maxIterations: 5,
      permanentPhases: ["done"],
      transitions: [
        { topic: "task.recorded", role: "manager", fromPhases: "any", toPhase: "recorded", iteration: "reset" },
        { topic: "task.researched", role: "researcher", fromPhases: ["recorded"], toPhase: "researched", iteration: null },
        { topic: "task.designed", role: "architect", fromPhases: ["researched"], toPhase: "designed", iteration: null },
        { topic: "task.planned", role: "planner", fromPhases: ["designed"], toPhase: "planned", iteration: null },
        { topic: "task.planned", role: "planner", fromPhases: ["review_failed"], toPhase: "planned", iteration: "increment" },
        { topic: "task.implemented", role: "implementer", fromPhases: ["planned"], toPhase: "implemented", iteration: null },
        { topic: "task.review_passed", role: "reviewer", fromPhases: ["implemented"], toPhase: "review_passed", iteration: null },
        { topic: "task.review_failed", role: "reviewer", fromPhases: ["implemented"], toPhase: "review_failed", iteration: null },
        { topic: "task.done", role: "manager", fromPhases: ["review_passed"], toPhase: "done", iteration: null },
        { topic: "task.failed", role: "any", fromPhases: "any", toPhase: "failed", iteration: null },
      ],
      writeGates: [{ pattern: "**/CONTEXT.md", roles: ["architect"] }],
    });
  });
});
