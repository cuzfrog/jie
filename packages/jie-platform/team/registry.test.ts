import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamRegistry } from "./registry.ts";

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

describe("createTeamRegistry", () => {
  let workspace: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-team-reg-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-team-reg-home-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("loadTeam", () => {
    test("loadTeam('minimal') returns the built-in minimal team", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      const team = r.loadTeam("minimal");
      expect(team.leaderRole).toBe("general");
      expect(team.roles).toHaveLength(1);
    });

    test("loadTeam(undefined) returns the built-in minimal team (fallback)", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      const team = r.loadTeam();
      expect(team.leaderRole).toBe("general");
    });

    test("loadTeam loads from project scope when present", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      writeTeam(projectTeams, "dev", "project-leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      const team = r.loadTeam("dev");
      expect(team.leaderRole).toBe("project-leader");
    });

    test("loadTeam loads from user scope when not in project scope", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "user-leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      const team = r.loadTeam("dev");
      expect(team.leaderRole).toBe("user-leader");
    });

    test("loadTeam prefers project scope over user scope (project wins)", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "shared", "project-leader");
      writeTeam(userTeams, "shared", "user-leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      const team = r.loadTeam("shared");
      expect(team.leaderRole).toBe("project-leader");
    });

    test("loadTeam walks up from workspace to find the project root", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "jie-team-reg-walkup-"));
      try {
        writeTeam(join(projectRoot, ".jie", "teams"), "dev", "walkup-leader");
        const nested = join(projectRoot, "a", "b");
        mkdirSync(nested, { recursive: true });
        const r = createTeamRegistry({ workspace: nested, homeJieDir });
        const team = r.loadTeam("dev");
        expect(team.leaderRole).toBe("walkup-leader");
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    });

    test("loadTeam throws for an id not found in any scope", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(() => r.loadTeam("ghost")).toThrow(/team 'ghost' not found/);
    });

    test("loadTeam throws when a directory exists but has no TEAM.md", () => {
      mkdirSync(join(workspace, ".jie", "teams", "broken"), { recursive: true });
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(() => r.loadTeam("broken")).toThrow(/team 'broken' not found/);
    });
  });

  describe("isValidTeamId", () => {
    test("delegates to the team module's validator", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.isValidTeamId("team_1")).toBe(true);
      expect(r.isValidTeamId("a b")).toBe(false);
    });
  });

  describe("isInstalled", () => {
    test("returns true for 'minimal' (always available)", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.isInstalled("minimal")).toBe(true);
    });

    test("returns true for a project team with TEAM.md", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      writeTeam(projectTeams, "dev", "leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.isInstalled("dev")).toBe(true);
    });

    test("returns true for a user team with TEAM.md", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.isInstalled("dev")).toBe(true);
    });

    test("returns false for a missing team", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.isInstalled("ghost")).toBe(false);
    });

    test("returns false for a team directory without TEAM.md", () => {
      mkdirSync(join(workspace, ".jie", "teams", "incomplete"), { recursive: true });
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.isInstalled("incomplete")).toBe(false);
    });
  });

  describe("listInstalled", () => {
    test("includes 'minimal' when nothing is installed", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.listInstalled()).toEqual(["minimal"]);
    });

    test("merges project and user teams, sorts, dedupes, includes 'minimal'", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "alpha", "alpha-leader");
      writeTeam(projectTeams, "shared", "alpha-shared-leader");
      writeTeam(userTeams, "beta", "beta-leader");
      writeTeam(userTeams, "shared", "user-shared-leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      const list = r.listInstalled();
      expect(list).toEqual(["alpha", "beta", "minimal", "shared"]);
    });

    test("skips hidden (dot-prefixed) entries", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      writeTeam(projectTeams, ".hidden", "hidden-leader");
      writeTeam(projectTeams, "visible", "visible-leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      const list = r.listInstalled();
      expect(list).toContain("visible");
      expect(list.some((t) => t.startsWith("."))).toBe(false);
    });

    test("skips team directories that lack TEAM.md", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      writeTeam(projectTeams, "complete", "complete-leader");
      mkdirSync(join(projectTeams, "incomplete"), { recursive: true });
      const r = createTeamRegistry({ workspace, homeJieDir });
      const list = r.listInstalled();
      expect(list).toContain("complete");
      expect(list).not.toContain("incomplete");
    });
  });

  describe("locate", () => {
    test("returns 'project' for a project team", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      writeTeam(projectTeams, "dev", "leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.locate("dev")).toBe("project");
    });

    test("returns 'user' for a user team", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.locate("dev")).toBe("user");
    });

    test("returns 'user' for the minimal team (shipped with the platform)", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.locate("minimal")).toBe("user");
    });

    test("returns 'project' when the team is in both scopes (project wins)", () => {
      const projectTeams = join(workspace, ".jie", "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "shared", "project-leader");
      writeTeam(userTeams, "shared", "user-leader");
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.locate("shared")).toBe("project");
    });

    test("returns 'missing' for an id not found anywhere", () => {
      const r = createTeamRegistry({ workspace, homeJieDir });
      expect(r.locate("ghost")).toBe("missing");
    });
  });
});
