import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistryImpl } from "./agent-registry";
import { TeamRegistryImpl } from "./registry";
import { JiePlatformError } from "../jie-platform-errors";

function createRegistry(homeJieDir: string, projectJieDir: string | null): TeamRegistryImpl {
  return new TeamRegistryImpl(homeJieDir, projectJieDir, new AgentRegistryImpl(homeJieDir, projectJieDir));
}

function writeTeam(rootDir: string, id: string, leader: string): void {
  const teamDir = join(rootDir, id);
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(
    join(teamDir, "TEAM.md"),
    `---\nleader: ${leader}\n---\n`,
  );
  writeFileSync(
    join(teamDir, `${leader}.md`),
    `---\ntools:\n  - bash\n---\nbody`,
  );
}

describe("TeamRegistryImpl", () => {
  let workspace: string;
  let homeJieDir: string;
  let projectJieDir: string | null;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-team-reg-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-team-reg-home-"));
    projectJieDir = null;
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("parseTeamManifest", () => {
    test("parseTeamManifest('setup-assistant') returns the built-in setup-assistant team", () => {
      const r = createRegistry(homeJieDir, projectJieDir);
      const team = r.parseTeamManifest("setup-assistant");
      expect(team.leaderRole).toBe("general");
      expect(team.roles).toHaveLength(1);
    });

    test("parseTeamManifest(undefined) returns the built-in setup-assistant team (fallback)", () => {
      const r = createRegistry(homeJieDir, projectJieDir);
      const team = r.parseTeamManifest();
      expect(team.leaderRole).toBe("general");
    });

    test("parseTeamManifest loads from project scope when present", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, "dev", "project-leader");
      const r = createRegistry(homeJieDir, projJie);
      const team = r.parseTeamManifest("dev");
      expect(team.leaderRole).toBe("project-leader");
    });

    test("parseTeamManifest loads from user scope when not in project scope", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "user-leader");
      const r = createRegistry(homeJieDir, projectJieDir);
      const team = r.parseTeamManifest("dev");
      expect(team.leaderRole).toBe("user-leader");
    });

    test("parseTeamManifest prefers project scope over user scope (project wins)", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "shared", "project-leader");
      writeTeam(userTeams, "shared", "user-leader");
      const r = createRegistry(homeJieDir, projJie);
      const team = r.parseTeamManifest("shared");
      expect(team.leaderRole).toBe("project-leader");
    });

    test("parseTeamManifest throws when a directory exists but has no TEAM.md", () => {
      const projJie = join(workspace, ".jie");
      mkdirSync(join(projJie, "teams", "broken"), { recursive: true });
      const r = createRegistry(homeJieDir, projJie);
      expect(() => r.parseTeamManifest("broken")).toThrow(/team 'broken' not found/);
    });

    test("parseTeamManifest throws invalid_team_id for an invalid id", () => {
      const r = createRegistry(homeJieDir, projectJieDir);
      expect(() => r.parseTeamManifest("bad id with spaces")).toThrow(JiePlatformError);
    });

    test("parseTeamManifest throws team_not_found when id is absent", () => {
      const r = createRegistry(homeJieDir, projectJieDir);
      expect(() => r.parseTeamManifest("ghost")).toThrow(JiePlatformError);
    });
  });

  describe("listInstalled", () => {
    test("includes 'setup-assistant' when nothing is installed", () => {
      const r = createRegistry(homeJieDir, projectJieDir);
      expect(r.listInstalled()).toEqual(["setup-assistant"]);
    });

    test("merges project and user teams, sorts, dedupes, includes 'setup-assistant'", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "alpha", "alpha-leader");
      writeTeam(projectTeams, "shared", "alpha-shared-leader");
      writeTeam(userTeams, "beta", "beta-leader");
      writeTeam(userTeams, "shared", "user-shared-leader");
      const r = createRegistry(homeJieDir, projJie);
      const list = r.listInstalled();
      expect(list).toEqual(["alpha", "beta", "setup-assistant", "shared"]);
    });

    test("skips hidden (dot-prefixed) entries", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, ".hidden", "hidden-leader");
      writeTeam(projectTeams, "visible", "visible-leader");
      const r = createRegistry(homeJieDir, projJie);
      const list = r.listInstalled();
      expect(list).toContain("visible");
      expect(list.some((t) => t.startsWith("."))).toBe(false);
    });

    test("skips team directories that lack TEAM.md", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, "complete", "complete-leader");
      mkdirSync(join(projectTeams, "incomplete"), { recursive: true });
      const r = createRegistry(homeJieDir, projJie);
      const list = r.listInstalled();
      expect(list).toContain("complete");
      expect(list).not.toContain("incomplete");
    });
  });

  describe("locate", () => {
    test.each([
      {
        name: "project team",
        setup: (): string | null => {
          const projJie = join(workspace, ".jie");
          writeTeam(join(projJie, "teams"), "dev", "leader");
          return projJie;
        },
        teamId: "dev",
        expected: "project",
      },
      {
        name: "user team",
        setup: (): string | null => {
          writeTeam(join(homeJieDir, "teams"), "dev", "leader");
          return null;
        },
        teamId: "dev",
        expected: "user",
      },
      {
        name: "setup-assistant team (shipped with the platform)",
        setup: (): string | null => null,
        teamId: "setup-assistant",
        expected: "builtin",
      },
      {
        name: "team in both scopes (project wins)",
        setup: (): string | null => {
          const projJie = join(workspace, ".jie");
          writeTeam(join(projJie, "teams"), "shared", "project-leader");
          writeTeam(join(homeJieDir, "teams"), "shared", "user-leader");
          return projJie;
        },
        teamId: "shared",
        expected: "project",
      },
    ])("returns '$expected' for $name", ({ setup, teamId, expected }) => {
      const projJie = setup();
      const r = createRegistry(homeJieDir, projJie);
      expect(r.locate(teamId)).toBe(expected);
    });

    test("returns null for an id not found anywhere", () => {
      const r = createRegistry(homeJieDir, projectJieDir);
      expect(r.locate("ghost")).toBeNull();
    });
  });

  describe("additional-agents", () => {
    function writeAgent(jieDir: string, id: string, content: string): void {
      const agentsDir = join(jieDir, "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, `${id}.md`), content, "utf-8");
    }

    test("resolves shared agents and merges them into roles", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "manager");
      writeAgent(homeJieDir, "explorer", "---\ntools:\n  - bash\n---\n");
      writeFileSync(
        join(userTeams, "dev", "TEAM.md"),
        "---\nleader: manager\nadditional-agents:\n  - explorer\n---\n",
        "utf-8",
      );
      const r = createRegistry(homeJieDir, projectJieDir);
      const team = r.parseTeamManifest("dev");
      expect(team.leaderRole).toBe("manager");
      expect(team.additionalAgentRefs).toEqual(["explorer"]);
      expect(team.roles.map((role) => role.role).sort()).toEqual(["explorer", "manager"]);
    });

    test("throws AGENT_NOT_FOUND when a shared agent ref cannot be resolved", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "manager");
      writeFileSync(
        join(userTeams, "dev", "TEAM.md"),
        "---\nleader: manager\nadditional-agents:\n  - ghost\n---\n",
        "utf-8",
      );
      const r = createRegistry(homeJieDir, projectJieDir);
      expect(() => r.parseTeamManifest("dev")).toThrow(
        expect.objectContaining({
          code: "AGENT_NOT_FOUND",
          detail: expect.stringContaining("team 'dev' references missing shared agent 'ghost'"),
        }),
      );
    });

    test("resolves shared agents even when there are no local roles", () => {
      const userTeams = join(homeJieDir, "teams");
      const devDir = join(userTeams, "dev");
      mkdirSync(devDir, { recursive: true });
      writeFileSync(join(devDir, "TEAM.md"), "---\nadditional-agents:\n  - explorer\n---\n", "utf-8");
      writeAgent(homeJieDir, "explorer", "---\ntools:\n  - bash\n---\n");
      const r = createRegistry(homeJieDir, projectJieDir);
      const team = r.parseTeamManifest("dev");
      expect(team.additionalAgentRefs).toEqual(["explorer"]);
      expect(team.roles.map((role) => role.role)).toEqual(["explorer"]);
      expect(team.leaderRole).toBeNull();
    });
  });
});
