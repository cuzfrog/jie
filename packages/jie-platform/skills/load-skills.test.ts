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

  test("discovers a valid skill with its file and base paths", () => {
    const filePath = writeSkill(project, "deploy", "description: Deploys the app");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.diagnostics).toEqual([]);
    expect(result.skills).toEqual([
      { name: "deploy", description: "Deploys the app", filePath, baseDir: join(project, "deploy"), body: "body" },
    ]);
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

  test("missing skills directories contribute nothing", () => {
    const result = loadSkills({ homeSkillsDir: join(home, "absent"), projectSkillsDir: null });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("directory without SKILL.md is ignored silently", () => {
    mkdirSync(join(project, "empty"), { recursive: true });
    writeFileSync(join(project, "stray.md"), "not a skill");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("a parse diagnostic carries the SKILL.md path and the skill is skipped", () => {
    const filePath = writeSkill(project, "deploy", "name: other\ndescription: nope");
    const result = loadSkills({ homeSkillsDir: home, projectSkillsDir: project });
    expect(result.skills).toEqual([]);
    expect(result.diagnostics).toEqual([{ path: filePath, message: expect.stringContaining("match") }]);
  });
});
