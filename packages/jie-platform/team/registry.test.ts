import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamRegistry } from "./registry";
import { JiePlatformError } from "../jie-platform-errors";

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

  describe("loadTeam", () => {
    test("loadTeam('minimal') returns the built-in minimal team", () => {
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      const team = r.parseTeamManifest("minimal");
      expect(team.leaderRole).toBe("general");
      expect(team.roles).toHaveLength(1);
    });

    test("loadTeam(undefined) returns the built-in minimal team (fallback)", () => {
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      const team = r.parseTeamManifest();
      expect(team.leaderRole).toBe("general");
    });

    test("loadTeam loads from project scope when present", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, "dev", "project-leader");
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      const team = r.parseTeamManifest("dev");
      expect(team.leaderRole).toBe("project-leader");
    });

    test("loadTeam loads from user scope when not in project scope", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "user-leader");
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      const team = r.parseTeamManifest("dev");
      expect(team.leaderRole).toBe("user-leader");
    });

    test("loadTeam prefers project scope over user scope (project wins)", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "shared", "project-leader");
      writeTeam(userTeams, "shared", "user-leader");
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      const team = r.parseTeamManifest("shared");
      expect(team.leaderRole).toBe("project-leader");
    });

    test("loadTeam uses the provided projectJieDir (no walk-up)", () => {
      const projectRoot = mkdtempSync(join(tmpdir(), "jie-team-reg-walkup-"));
      const projJie = join(projectRoot, ".jie");
      try {
        writeTeam(join(projJie, "teams"), "dev", "walkup-leader");
        const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
        const team = r.parseTeamManifest("dev");
        expect(team.leaderRole).toBe("walkup-leader");
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    });

    test("loadTeam throws when a directory exists but has no TEAM.md", () => {
      const projJie = join(workspace, ".jie");
      mkdirSync(join(projJie, "teams", "broken"), { recursive: true });
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      expect(() => r.parseTeamManifest("broken")).toThrow(/team 'broken' not found/);
    });

    test("loadTeam throws invalid_team_id for an invalid id", () => {
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      expect(() => r.parseTeamManifest("bad id with spaces")).toThrow(JiePlatformError);
    });

    test("loadTeam throws team_not_found when id is absent", () => {
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      expect(() => r.parseTeamManifest("ghost")).toThrow(JiePlatformError);
    });
  });

  describe("isInstalled", () => {
    test.each([
      {
        name: "'minimal' (always available)",
        setup: (): string | null => null,
        teamId: "minimal",
        expected: true,
      },
      {
        name: "a project team with TEAM.md",
        setup: (): string | null => {
          const projJie = join(workspace, ".jie");
          writeTeam(join(projJie, "teams"), "dev", "leader");
          return projJie;
        },
        teamId: "dev",
        expected: true,
      },
      {
        name: "a user team with TEAM.md",
        setup: (): string | null => {
          writeTeam(join(homeJieDir, "teams"), "dev", "leader");
          return null;
        },
        teamId: "dev",
        expected: true,
      },
    ])("returns true for $name", ({ setup, teamId, expected }) => {
      const projJie = setup();
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      expect(r.isInstalled(teamId)).toBe(expected);
    });

    test.each([
      {
        name: "missing team",
        setup: (): string | null => null,
        teamId: "ghost",
      },
      {
        name: "team directory without TEAM.md",
        setup: (): string | null => {
          const projJie = join(workspace, ".jie");
          mkdirSync(join(projJie, "teams", "incomplete"), { recursive: true });
          return projJie;
        },
        teamId: "incomplete",
      },
    ])("returns false for $name", ({ setup, teamId }) => {
      const projJie = setup();
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      expect(r.isInstalled(teamId)).toBe(false);
    });
  });

  describe("listInstalled", () => {
    test("includes 'minimal' when nothing is installed", () => {
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      expect(r.listInstalled()).toEqual(["minimal"]);
    });

    test("merges project and user teams, sorts, dedupes, includes 'minimal'", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      const userTeams = join(homeJieDir, "teams");
      writeTeam(projectTeams, "alpha", "alpha-leader");
      writeTeam(projectTeams, "shared", "alpha-shared-leader");
      writeTeam(userTeams, "beta", "beta-leader");
      writeTeam(userTeams, "shared", "user-shared-leader");
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      const list = r.listInstalled();
      expect(list).toEqual(["alpha", "beta", "minimal", "shared"]);
    });

    test("skips hidden (dot-prefixed) entries", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, ".hidden", "hidden-leader");
      writeTeam(projectTeams, "visible", "visible-leader");
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      const list = r.listInstalled();
      expect(list).toContain("visible");
      expect(list.some((t) => t.startsWith("."))).toBe(false);
    });

    test("skips team directories that lack TEAM.md", () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, "complete", "complete-leader");
      mkdirSync(join(projectTeams, "incomplete"), { recursive: true });
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
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
        name: "minimal team (shipped with the platform)",
        setup: (): string | null => null,
        teamId: "minimal",
        expected: "user",
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
      const r = createTeamRegistry({ homeJieDir, projectJieDir: projJie });
      expect(r.locate(teamId)).toBe(expected);
    });

    test("returns 'missing' for an id not found anywhere", () => {
      const r = createTeamRegistry({ homeJieDir, projectJieDir });
      expect(r.locate("ghost")).toBe("missing");
    });
  });
});
