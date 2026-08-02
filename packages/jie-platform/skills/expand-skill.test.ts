import { expandSkillInvocation } from "./expand-skill";
import type { Skill } from "./types";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "say-hello",
    description: "greet the user",
    filePath: "/skills/say-hello/SKILL.md",
    baseDir: "/skills/say-hello",
    body: "Greet the user warmly.",
    ...overrides,
  };
}

describe("expandSkillInvocation", () => {
  test("expands a bare invocation to the skill block", () => {
    const result = expandSkillInvocation("/skill:say-hello", [makeSkill()]);
    expect(result).toBe(
      '<skill name="say-hello" location="/skills/say-hello/SKILL.md">\n'
      + "References are relative to /skills/say-hello.\n\n"
      + "Greet the user warmly.\n"
      + "</skill>",
    );
  });

  test("appends the arguments after the skill block", () => {
    const result = expandSkillInvocation("/skill:say-hello Cause", [makeSkill()]);
    expect(result).toBe(
      '<skill name="say-hello" location="/skills/say-hello/SKILL.md">\n'
      + "References are relative to /skills/say-hello.\n\n"
      + "Greet the user warmly.\n"
      + "</skill>\n\nCause",
    );
  });

  test("trims the arguments", () => {
    const result = expandSkillInvocation("/skill:say-hello   Cause  ", [makeSkill()]);
    expect(result).toContain("</skill>\n\nCause");
  });

  test("selects the matching skill among several", () => {
    const skills = [makeSkill(), makeSkill({ name: "deploy", baseDir: "/skills/deploy", filePath: "/skills/deploy/SKILL.md", body: "Run the deploy." })];
    const result = expandSkillInvocation("/skill:deploy now", skills);
    expect(result).toContain("Run the deploy.");
    expect(result).toContain('location="/skills/deploy/SKILL.md"');
    expect(result).not.toContain("Greet");
  });

  test("separates the name from the args on any whitespace", () => {
    expect(expandSkillInvocation("/skill:say-hello\nCause", [makeSkill()])).toContain("</skill>\n\nCause");
    expect(expandSkillInvocation("/skill:say-hello\tCause", [makeSkill()])).toContain("</skill>\n\nCause");
  });

  test("does not match a name prefix", () => {
    expect(expandSkillInvocation("/skill:say", [makeSkill()])).toBeNull();
  });

  test("returns null for an invocation embedded mid-text", () => {
    expect(expandSkillInvocation("please /skill:say-hello", [makeSkill()])).toBeNull();
  });

  test("returns null for an unknown skill name", () => {
    expect(expandSkillInvocation("/skill:nope", [makeSkill()])).toBeNull();
  });

  test("returns null for text that is not a skill invocation", () => {
    expect(expandSkillInvocation("hello world", [makeSkill()])).toBeNull();
    expect(expandSkillInvocation("/team alpha", [makeSkill()])).toBeNull();
  });

  test("returns null for an empty skill name", () => {
    expect(expandSkillInvocation("/skill:", [makeSkill()])).toBeNull();
    expect(expandSkillInvocation("/skill: args", [makeSkill()])).toBeNull();
  });

  test("returns null when no skills are configured", () => {
    expect(expandSkillInvocation("/skill:say-hello", [])).toBeNull();
  });
});
