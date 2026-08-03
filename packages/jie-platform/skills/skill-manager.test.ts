import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillManagerImpl } from "./skill-manager";

function writeSkill(root: string, dir: string, description: string): void {
  const dirPath = join(root, dir);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, "SKILL.md"), `---\ndescription: ${description}\n---\nbody\n`);
}

describe("SkillManagerImpl", () => {
  let homeSkillsDir: string;
  let projectSkillsDir: string;

  beforeEach(() => {
    homeSkillsDir = mkdtempSync(join(tmpdir(), "jie-skill-mgr-home-"));
    projectSkillsDir = mkdtempSync(join(tmpdir(), "jie-skill-mgr-project-"));
  });

  afterEach(() => {
    rmSync(homeSkillsDir, { recursive: true, force: true });
    rmSync(projectSkillsDir, { recursive: true, force: true });
  });

  test("loads the skills on disk at construction", () => {
    writeSkill(projectSkillsDir, "deploy", "Deploys the app");
    writeSkill(projectSkillsDir, "deploy-prod", "Deploys to prod");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("*").map((s) => s.name).sort()).toEqual(["deploy", "deploy-prod"]);
  });

  test("resolve exact name", () => {
    writeSkill(projectSkillsDir, "deploy", "Deploys the app");
    writeSkill(projectSkillsDir, "test-unit", "Runs unit tests");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("deploy").map((s) => s.name)).toEqual(["deploy"]);
  });

  test("resolve wildcard matches by prefix", () => {
    writeSkill(projectSkillsDir, "deploy", "Deploys the app");
    writeSkill(projectSkillsDir, "deploy-prod", "Deploys to prod");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("deploy-*").map((s) => s.name)).toEqual(["deploy-prod"]);
  });

  test("resolve no match returns empty", () => {
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("missing")).toEqual([]);
  });

  test("reload picks up a skill added after construction", () => {
    writeSkill(projectSkillsDir, "deploy", "Deploys the app");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("say-hello")).toEqual([]);
    writeSkill(projectSkillsDir, "say-hello", "Says hello");
    manager.reload();
    expect(manager.resolve("say-hello").map((s) => s.name)).toEqual(["say-hello"]);
  });

  test("reload drops a skill removed after construction", () => {
    writeSkill(projectSkillsDir, "deploy", "Deploys the app");
    writeSkill(projectSkillsDir, "say-hello", "Says hello");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("*")).toHaveLength(2);
    rmSync(join(projectSkillsDir, "say-hello"), { recursive: true, force: true });
    manager.reload();
    expect(manager.resolve("*").map((s) => s.name)).toEqual(["deploy"]);
  });

  test("reload replaces a skill's metadata with the edited frontmatter", () => {
    writeSkill(projectSkillsDir, "deploy", "old description");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("deploy")[0]?.description).toBe("old description");
    writeSkill(projectSkillsDir, "deploy", "new description");
    manager.reload();
    expect(manager.resolve("deploy")[0]?.description).toBe("new description");
  });

  test("an invalid skill file is skipped without breaking the load", () => {
    writeSkill(projectSkillsDir, "deploy", "Deploys the app");
    const dirPath = join(projectSkillsDir, "broken");
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, "SKILL.md"), "---\nname: other\ndescription: nope\n---\nbody\n");
    const manager = new SkillManagerImpl({ homeSkillsDir, projectSkillsDir });
    expect(manager.resolve("*").map((s) => s.name)).toEqual(["deploy"]);
  });
});
