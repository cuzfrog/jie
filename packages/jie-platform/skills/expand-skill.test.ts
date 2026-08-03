import { expandSkillInvocation } from "./expand-skill";
import type { Skill } from "./types";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "say-hello",
    description: "greet the user",
    argumentHint: null,
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

  test("interpolates $ARGUMENTS with all arguments", () => {
    const skill = makeSkill({ body: "Greet $ARGUMENTS warmly." });
    expect(expandSkillInvocation("/skill:say-hello Alice and Bob", [skill])).toContain("Greet Alice and Bob warmly.");
  });

  test("interpolates positional $1 and $2 with individual arguments", () => {
    const skill = makeSkill({ body: "Greet $1 on behalf of $2." });
    expect(expandSkillInvocation("/skill:say-hello Alice Bob", [skill])).toContain("Greet Alice on behalf of Bob.");
  });

  test("a missing positional interpolates to the empty string", () => {
    const skill = makeSkill({ body: "Greet $1 on behalf of $2." });
    expect(expandSkillInvocation("/skill:say-hello Alice", [skill])).toContain("Greet Alice on behalf of .");
  });

  test("a bare invocation of a placeholder skill interpolates empty args", () => {
    const skill = makeSkill({ body: "Greet $ARGUMENTS." });
    expect(expandSkillInvocation("/skill:say-hello", [skill])).toContain("Greet .");
  });

  test("placeholders suppress the trailing args append", () => {
    const skill = makeSkill({ body: "Greet $ARGUMENTS." });
    expect(expandSkillInvocation("/skill:say-hello Alice", [skill])?.endsWith("</skill>")).toBe(true);
  });

  test("$10 refers to the tenth argument, not $1 followed by 0", () => {
    const skill = makeSkill({ body: "arg: $10" });
    expect(expandSkillInvocation("/skill:say-hello a b c d e f g h i j", [skill])).toContain("arg: j");
  });

  test("args with replacement-pattern text like $& and $$ are inserted verbatim", () => {
    const skill = makeSkill({ body: "Execute: $ARGUMENTS" });
    expect(expandSkillInvocation("/skill:say-hello a $& b $$5", [skill])).toContain("Execute: a $& b $$5");
  });

  test("placeholder-looking tokens inside the args are not re-expanded", () => {
    const skill = makeSkill({ body: "Execute: $ARGUMENTS" });
    expect(expandSkillInvocation("/skill:say-hello echo $1", [skill])).toContain("Execute: echo $1");
  });

  test("a body mixing $ARGUMENTS and positionals interpolates each in one pass", () => {
    const skill = makeSkill({ body: "Greet $1, all: $ARGUMENTS" });
    expect(expandSkillInvocation("/skill:say-hello Alice Bob", [skill])).toContain("Greet Alice, all: Alice Bob");
  });
});
