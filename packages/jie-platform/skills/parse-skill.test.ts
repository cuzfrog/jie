import { parseSkill, type ParseSkillInput } from "./parse-skill";

function input(content: string, overrides: Partial<ParseSkillInput> = {}): ParseSkillInput {
  return { dirName: "deploy", baseDir: "/skills/deploy", filePath: "/skills/deploy/SKILL.md", content, ...overrides };
}

function skillFile(frontmatter: string): string {
  return `---\n${frontmatter}\n---\nbody\n`;
}

describe("parseSkill", () => {
  test("a valid skill, name defaults to the directory name", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile("description: Deploys the app")));
    expect(diagnostic).toBeNull();
    expect(skill).toEqual({
      name: "deploy",
      description: "Deploys the app",
      filePath: "/skills/deploy/SKILL.md",
      baseDir: "/skills/deploy",
      body: "body",
    });
  });

  test("the body is the content after the frontmatter, trimmed", () => {
    const { skill } = parseSkill(input("---\ndescription: Deploys the app\n---\n\nstep one\nstep two\n\n"));
    expect(skill?.body).toBe("step one\nstep two");
  });

  test("a skill file with no content after the frontmatter has an empty body", () => {
    const { skill } = parseSkill(input("---\ndescription: Deploys the app\n---\n"));
    expect(skill?.body).toBe("");
  });

  test("an explicit name matching the directory is accepted", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile("name: deploy\ndescription: Deploys the app")));
    expect(diagnostic).toBeNull();
    expect(skill?.name).toBe("deploy");
  });

  test("content without frontmatter yields the missing-description diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input("just a body, no frontmatter"));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("description");
  });

  test("an explicit name mismatching the directory is a diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile("name: other\ndescription: nope")));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("match");
    expect(diagnostic).toContain("other");
  });

  test("missing description is a diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile("name: deploy")));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("description");
  });

  test("empty description is a diagnostic", () => {
    const { skill } = parseSkill(input(skillFile("description: '   '")));
    expect(skill).toBeNull();
  });

  test("description over 1024 chars is a diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile(`description: ${"x".repeat(1025)}`)));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("1024");
  });

  test("invalid directory name charset is a diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile("description: nope"), { dirName: "Deploy_Bad" }));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("Deploy_Bad");
  });

  test("name over 64 chars is a diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input(skillFile("description: nope"), { dirName: "a".repeat(65) }));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("64");
  });

  test("leading hyphen in name is a diagnostic", () => {
    const { skill } = parseSkill(input(skillFile("description: nope"), { dirName: "-deploy" }));
    expect(skill).toBeNull();
  });

  test("consecutive hyphens in name is a diagnostic", () => {
    const { skill } = parseSkill(input(skillFile("description: nope"), { dirName: "de--ploy" }));
    expect(skill).toBeNull();
  });

  test("malformed frontmatter yaml is a diagnostic", () => {
    const { skill, diagnostic } = parseSkill(input("---\n: : bad yaml\n  - x\n---\nbody\n"));
    expect(skill).toBeNull();
    expect(diagnostic).toContain("frontmatter");
  });
});
