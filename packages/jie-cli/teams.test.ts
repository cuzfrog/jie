import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_MINIMAL_TEAM_ID, makeTeamsRepo } from "./teams.ts";

describe("TeamsRepo.isInstalled", () => {
  let homeDir: string;
  let repo: ReturnType<typeof makeTeamsRepo>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-teams-"));
    repo = makeTeamsRepo(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("the built-in minimal team is always installed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      expect(repo.isInstalled(BUILTIN_MINIMAL_TEAM_ID, cwd)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a team with a manifest under ~/.jie/teams/<id>/ is installed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "");
      expect(repo.isInstalled("dev", cwd)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a team with a manifest under {cwd}/.jie/teams/<id>/ is installed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", "dev", "TEAM.md"), "");
      expect(repo.isInstalled("dev", cwd)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a missing team is not installed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      expect(repo.isInstalled("ghost", cwd)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a team directory without TEAM.md is not installed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(homeDir, ".jie", "teams", "broken"), { recursive: true });
      expect(repo.isInstalled("broken", cwd)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("isInstalled walks up from cwd to the discovered project root", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-proj-"));
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(join(projectRoot, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(projectRoot, ".jie", "teams", "dev", "TEAM.md"), "");
      mkdirSync(nested, { recursive: true });
      expect(repo.isInstalled("dev", nested)).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("TeamsRepo.locate", () => {
  let homeDir: string;
  let repo: ReturnType<typeof makeTeamsRepo>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-locate-"));
    repo = makeTeamsRepo(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("returns 'project' for a team under {cwd}/.jie/teams/<id>/", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", "dev", "TEAM.md"), "");
      expect(repo.locate("dev", cwd)).toBe("project");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns 'global' for a team under ~/.jie/teams/<id>/", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "");
      expect(repo.locate("dev", cwd)).toBe("global");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns 'project' when the team is in both project and global (project wins)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", "dev", "TEAM.md"), "");
      mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
      writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "");
      expect(repo.locate("dev", cwd)).toBe("project");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns 'global' for the built-in minimal team", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      expect(repo.locate(BUILTIN_MINIMAL_TEAM_ID, cwd)).toBe("global");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns 'missing' for a team that is not installed anywhere", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      expect(repo.locate("ghost", cwd)).toBe("missing");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("TeamsRepo.listInstalled", () => {
  let homeDir: string;
  let repo: ReturnType<typeof makeTeamsRepo>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-teams-list-"));
    repo = makeTeamsRepo(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("returns just the built-in minimal team when no teams are installed", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      expect(repo.listInstalled(cwd)).toEqual([BUILTIN_MINIMAL_TEAM_ID]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("dedupes project + global teams and sorts alphabetically", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie", "teams", "alpha"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", "alpha", "TEAM.md"), "");
      mkdirSync(join(homeDir, ".jie", "teams", "beta"), { recursive: true });
      writeFileSync(join(homeDir, ".jie", "teams", "beta", "TEAM.md"), "");
      // alpha also under global — should be deduped.
      mkdirSync(join(homeDir, ".jie", "teams", "alpha"), { recursive: true });
      writeFileSync(join(homeDir, ".jie", "teams", "alpha", "TEAM.md"), "");
      const list = repo.listInstalled(cwd);
      // 'alpha' appears once, then 'beta', then the built-in 'minimal'.
      expect(list).toEqual(["alpha", "beta", BUILTIN_MINIMAL_TEAM_ID]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("skips team directories that lack TEAM.md", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie", "teams", "incomplete"), { recursive: true });
      mkdirSync(join(cwd, ".jie", "teams", "complete"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", "complete", "TEAM.md"), "");
      const list = repo.listInstalled(cwd);
      expect(list).toEqual(["complete", BUILTIN_MINIMAL_TEAM_ID]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("skips hidden entries (dot-prefixed)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie", "teams", ".hidden"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", ".hidden", "TEAM.md"), "");
      mkdirSync(join(cwd, ".jie", "teams", "visible"), { recursive: true });
      writeFileSync(join(cwd, ".jie", "teams", "visible", "TEAM.md"), "");
      const list = repo.listInstalled(cwd);
      // 'minimal' (built-in) sorts before 'visible' alphabetically.
      expect(list).toEqual([BUILTIN_MINIMAL_TEAM_ID, "visible"]);
      expect(list.some((t) => t.startsWith("."))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
