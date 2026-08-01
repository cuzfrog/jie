import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSkills } from "./load-skills";

describe("loadSkills", () => {
  let home: string;
  let project: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "jie-skills-home-"));
    project = mkdtempSync(join(tmpdir(), "jie-skills-project-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });

  function writeSkill(root: string, dir: string, frontmatter: string): string {
    const dirPath = join(root, dir);
    mkdirSync(dirPath, { recursive: true });
    const filePath = join(dirPath, "SKILL.md");
    writeFileSync(filePath, `---\n${frontmatter}\n---\nbody\n`);
    return filePath;
  }

  test("discovers a valid skill, name defaults to directory name", () => {
    const filePath = writeSkill(project, "deploy", "description: Deploys the app");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toEqual([
      { name: "deploy", description: "Deploys the app", filePath, baseDir: join(project, "deploy") },
    ]);
  });

  test("explicit name matching the directory is accepted", () => {
    writeSkill(project, "deploy", "name: deploy\ndescription: Deploys the app");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills.map((s) => s.name)).toEqual(["deploy"]);
  });

  test("merges home and project skills", () => {
    writeSkill(home, "global-skill", "description: from home");
    writeSkill(project, "project-skill", "description: from project");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills.map((s) => s.name).sort()).toEqual(["global-skill", "project-skill"]);
  });

  test("project skill overrides home skill of the same name", () => {
    writeSkill(home, "deploy", "description: home version");
    const projectPath = writeSkill(project, "deploy", "description: project version");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.description).toBe("project version");
    expect(result.skills[0]?.filePath).toBe(projectPath);
  });

  test("null projectSkillsDir loads home skills only", () => {
    writeSkill(home, "global-skill", "description: from home");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: null });
    expect(result.skills.map((s) => s.name)).toEqual(["global-skill"]);
  });

  test("missing description is a diagnostic, skill skipped", () => {
    writeSkill(project, "deploy", "name: deploy");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("description");
  });

  test("empty description is a diagnostic", () => {
    writeSkill(project, "deploy", "description: '   '");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  test("description over 1024 chars is a diagnostic", () => {
    writeSkill(project, "deploy", `description: ${"x".repeat(1025)}`);
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("1024");
  });

  test("invalid directory name charset is a diagnostic", () => {
    writeSkill(project, "Deploy_Bad", "description: nope");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("Deploy_Bad");
  });

  test("name over 64 chars is a diagnostic", () => {
    const longName = "a".repeat(65);
    writeSkill(project, longName, "description: nope");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("64");
  });

  test("leading hyphen in name is a diagnostic", () => {
    writeSkill(project, "-deploy", "description: nope");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  test("consecutive hyphens in name is a diagnostic", () => {
    writeSkill(project, "de--ploy", "description: nope");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });

  test("explicit name mismatching the directory is a diagnostic", () => {
    writeSkill(project, "deploy", "name: other\ndescription: nope");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain("match");
  });

  test("directory without SKILL.md is ignored silently", () => {
    mkdirSync(join(project, "empty"), { recursive: true });
    writeFileSync(join(project, "stray.md"), "not a skill");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("malformed frontmatter is a diagnostic", () => {
    const dirPath = join(project, "deploy");
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, "SKILL.md"), "---\n: : bad yaml\n  - x\n---\nbody\n");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
  });
});
