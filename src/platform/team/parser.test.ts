import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isValidTeamId,
  loadDefaultSoloTeam,
  loadTeamFromDir,
  parseAgentManifest,
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

  test("the general soul has tools [bash, read_file, write_file, edit_file, memory_add, memory_search] and empty subscribe", () => {
    const bp = loadDefaultSoloTeam();
    const soul = bp.roles[0]!;
    expect(soul.tools).toEqual(["bash", "read_file", "write_file", "edit_file", "memory_add", "memory_search"]);
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

  test("agent with a valid model alias is parsed", () => {
    writeFileSync(
      join(dir, "general.md"),
      `---\nmodel: large\ntools:\n  - bash\n---\nbody`,
    );
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.model).toBe("large");
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
      name: "invalid_model_alias",
      setup: () => setupFiles({ "general.md": "---\ntools:\n  - bash\nmodel: huge\n---\n" }),
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

describe("loadTeamFromDir — shipped default-dev-team blueprint", () => {
  const defaultCodersDir = join(import.meta.dir, "../../manifest/teams/default-dev-team");

  test("parses the shipped default-dev-team with manager as leader and six roles", () => {
    const blueprint = loadTeamFromDir(defaultCodersDir);
    expect(blueprint.leaderRole).toBe("manager");
    expect(blueprint.roles.map((r) => r.role).sort()).toEqual([
      "architect",
      "implementer",
      "manager",
      "planner",
      "researcher",
      "reviewer",
    ]);
  });

  test("role tool specs are carried through as raw strings", () => {
    const blueprint = loadTeamFromDir(defaultCodersDir);
    const manager = blueprint.roles.find((r) => r.role === "manager");
    expect(manager?.tools.some((spec) => spec.startsWith("notify("))).toBe(true);
  });

  test("default-dev-team carries no additional-agent refs", () => {
    const blueprint = loadTeamFromDir(defaultCodersDir);
    expect(blueprint.additionalAgentRefs).toEqual([]);
  });
});

describe("parseAgentManifest", () => {
  test("parses a shared-agent markdown into an AgentSoul", () => {
    const content = "---\ntools:\n  - bash\n  - read_file(**)\n---\nYou explore.";
    const soul = parseAgentManifest("explorer", content, "explorer.md");
    expect(soul.role).toBe("explorer");
    expect(soul.tools).toEqual(["bash", "read_file(**)"]);
    expect(soul.systemPrompt).toBe("You explore.");
    expect(soul.model).toBe("");
    expect(soul.subscribe).toEqual([]);
    expect(soul.skills).toEqual([]);
    expect(soul.targetContextWindowSize).toBeUndefined();
  });

  test("rejects a shared agent with missing frontmatter", () => {
    expect(() => parseAgentManifest("steward", "no frontmatter", "steward.md")).toThrow(
      expect.objectContaining({ code: "INVALID_FRONTMATTER" }),
    );
  });
});

describe("parseTeamFromManifests — additional-agents", () => {
  test("parses additional-agents into additionalAgentRefs", () => {
    const blueprint = parseTeamFromManifests(
      {
        "TEAM.md": "---\nleader: manager\nadditional-agents:\n  - explorer\n  - steward\n---\n",
        "manager.md": "---\ntools:\n  - bash\n---\n",
      },
      { teamId: "dev" },
    );
    expect(blueprint.leaderRole).toBe("manager");
    expect(blueprint.additionalAgentRefs).toEqual(["explorer", "steward"]);
  });

  test("rejects non-list additional-agents", () => {
    expect(() => parseTeamFromManifests(
      { "TEAM.md": "---\nadditional-agents: explorer\n---\n", "manager.md": "---\ntools:\n  - bash\n---\n" },
      { teamId: "dev" },
    )).toThrow(expect.objectContaining({ code: "INVALID_FIELD_TYPE" }));
  });

  test("rejects an invalid ref name", () => {
    expect(() => parseTeamFromManifests(
      { "TEAM.md": "---\nadditional-agents:\n  - bad id\n---\n", "manager.md": "---\ntools:\n  - bash\n---\n" },
      { teamId: "dev" },
    )).toThrow(expect.objectContaining({ code: "INVALID_AGENT_REF" }));
  });

  test("rejects a ref that collides with a local role", () => {
    expect(() => parseTeamFromManifests(
      {
        "TEAM.md": "---\nleader: manager\nadditional-agents:\n  - manager\n---\n",
        "manager.md": "---\ntools:\n  - bash\n---\n",
      },
      { teamId: "dev" },
    )).toThrow(expect.objectContaining({ code: "DUPLICATE_ROLE" }));
  });

  test("rejects a duplicate ref within the list", () => {
    expect(() => parseTeamFromManifests(
      {
        "TEAM.md": "---\nleader: manager\nadditional-agents:\n  - explorer\n  - explorer\n---\n",
        "manager.md": "---\ntools:\n  - bash\n---\n",
      },
      { teamId: "dev" },
    )).toThrow(expect.objectContaining({ code: "DUPLICATE_AGENT_REF" }));
  });

  test("rejects a leader that names a shared agent ref", () => {
    expect(() => parseTeamFromManifests(
      {
        "TEAM.md": "---\nleader: explorer\nadditional-agents:\n  - explorer\n---\n",
        "manager.md": "---\ntools:\n  - bash\n---\n",
      },
      { teamId: "dev" },
    )).toThrow(expect.objectContaining({ code: "LEADER_UNKNOWN" }));
  });

  test("single local role plus additional-agents auto-leads", () => {
    const blueprint = parseTeamFromManifests(
      {
        "TEAM.md": "---\nadditional-agents:\n  - explorer\n---\n",
        "manager.md": "---\ntools:\n  - bash\n---\n",
      },
      { teamId: "dev" },
    );
    expect(blueprint.leaderRole).toBe("manager");
    expect(blueprint.additionalAgentRefs).toEqual(["explorer"]);
  });
});

describe("replica parsing", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-team-replica-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("replica defaults to 1 when omitted", () => {
    writeFileSync(join(dir, "general.md"), "---\ntools:\n  - bash\n---\nbody");
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.replicas).toBe(1);
  });

  test("replica: 3 is parsed", () => {
    writeFileSync(join(dir, "TEAM.md"), "---\nleader: lead\n---\n");
    writeFileSync(join(dir, "lead.md"), "---\ntools:\n  - bash\n---\nlead");
    writeFileSync(join(dir, "worker.md"), "---\ntools:\n  - bash\nreplica: 3\n---\nworker");
    const bp = loadTeamFromDir(dir);
    const worker = bp.roles.find((s) => s.role === "worker");
    expect(worker?.replicas).toBe(3);
  });

  test("replica: 0 is rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\ntools:\n  - bash\nreplica: 0\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_FIELD_TYPE" }));
  });

  test("replica: 9 is rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\ntools:\n  - bash\nreplica: 9\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "REPLICA_LIMIT_EXCEEDED" }));
  });

  test("replica: two is rejected as invalid type", () => {
    writeFileSync(join(dir, "general.md"), "---\ntools:\n  - bash\nreplica: two\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_FIELD_TYPE" }));
  });

  test("leader with replica: 2 is rejected", () => {
    writeFileSync(join(dir, "TEAM.md"), "---\nleader: leader\n---\n");
    writeFileSync(join(dir, "leader.md"), "---\ntools:\n  - bash\nreplica: 2\n---\nleader");
    writeFileSync(join(dir, "worker.md"), "---\ntools:\n  - bash\n---\nworker");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "LEADER_REPLICA_FORBIDDEN" }));
  });
});

describe("model effort parsing", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-team-model-effort-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("model: <ref>(<effort>) splits into model and effort", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: openai/gpt-4o(low)\ntools:\n  - bash\n---\nbody");
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.model).toBe("openai/gpt-4o");
    expect(bp.roles[0]?.effort).toBe("low");
  });

  test("model: <alias>(<effort>) splits into alias and effort", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large(high)\ntools:\n  - bash\n---\nbody");
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.model).toBe("large");
    expect(bp.roles[0]?.effort).toBe("high");
  });

  test("model without effort leaves effort undefined", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large\ntools:\n  - bash\n---\nbody");
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.model).toBe("large");
    expect(bp.roles[0]?.effort).toBeUndefined();
  });

  test("model: (low) is rejected because base is empty", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: (low)\ntools:\n  - bash\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_MODEL_STRING" }));
  });

  test("empty effort suffix is rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large()\ntools:\n  - bash\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_MODEL_STRING" }));
  });

  test("invalid effort is rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large(extreme)\ntools:\n  - bash\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_MODEL_STRING" }));
  });

  test("cased effort is rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large(LOW)\ntools:\n  - bash\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_MODEL_STRING" }));
  });

  test("nested parens in base are rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large(low)(high)\ntools:\n  - bash\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_MODEL_STRING" }));
  });

  test("unbalanced parens are rejected", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large(low\ntools:\n  - bash\n---\nbody");
    expect(() => loadTeamFromDir(dir)).toThrow(expect.objectContaining({ code: "INVALID_MODEL_STRING" }));
  });

  test("whitespace around the suffix is tolerated", () => {
    writeFileSync(join(dir, "general.md"), "---\nmodel: large (low)\ntools:\n  - bash\n---\nbody");
    const bp = loadTeamFromDir(dir);
    expect(bp.roles[0]?.model).toBe("large");
    expect(bp.roles[0]?.effort).toBe("low");
  });
});
