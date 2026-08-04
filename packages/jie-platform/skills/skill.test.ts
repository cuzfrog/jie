import { createSkill, type SkillFields } from "./skill";

function makeFields(overrides: Partial<SkillFields> = {}): SkillFields {
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

describe("Skill.expandInvocation", () => {
  test("a bare invocation renders the skill block", () => {
    const result = createSkill(makeFields()).expandInvocation("");
    expect(result).toBe(
      '<skill name="say-hello" location="/skills/say-hello/SKILL.md">\n'
      + "References are relative to /skills/say-hello.\n\n"
      + "Greet the user warmly.\n"
      + "</skill>",
    );
  });

  test("args are appended after the block when the body has no placeholders", () => {
    const result = createSkill(makeFields()).expandInvocation("Cause");
    expect(result).toBe(
      '<skill name="say-hello" location="/skills/say-hello/SKILL.md">\n'
      + "References are relative to /skills/say-hello.\n\n"
      + "Greet the user warmly.\n"
      + "</skill>\n\nCause",
    );
  });

  test("interpolates $ARGUMENTS with all arguments", () => {
    const skill = createSkill(makeFields({ body: "Greet $ARGUMENTS warmly." }));
    expect(skill.expandInvocation("Alice and Bob")).toContain("Greet Alice and Bob warmly.");
  });

  test("interpolates positional $1 and $2 with individual arguments", () => {
    const skill = createSkill(makeFields({ body: "Greet $1 on behalf of $2." }));
    expect(skill.expandInvocation("Alice Bob")).toContain("Greet Alice on behalf of Bob.");
  });

  test("a missing positional interpolates to the empty string", () => {
    const skill = createSkill(makeFields({ body: "Greet $1 on behalf of $2." }));
    expect(skill.expandInvocation("Alice")).toContain("Greet Alice on behalf of .");
  });

  test("a bare invocation of a placeholder skill interpolates empty args", () => {
    const skill = createSkill(makeFields({ body: "Greet $ARGUMENTS." }));
    expect(skill.expandInvocation("")).toContain("Greet .");
  });

  test("placeholders suppress the trailing args append", () => {
    const skill = createSkill(makeFields({ body: "Greet $ARGUMENTS." }));
    expect(skill.expandInvocation("Alice").endsWith("</skill>")).toBe(true);
  });

  test("$10 refers to the tenth argument, not $1 followed by 0", () => {
    const skill = createSkill(makeFields({ body: "arg: $10" }));
    expect(skill.expandInvocation("a b c d e f g h i j")).toContain("arg: j");
  });

  test("args with replacement-pattern text like $& and $$ are inserted verbatim", () => {
    const skill = createSkill(makeFields({ body: "Execute: $ARGUMENTS" }));
    expect(skill.expandInvocation("a $& b $$5")).toContain("Execute: a $& b $$5");
  });

  test("placeholder-looking tokens inside the args are not re-expanded", () => {
    const skill = createSkill(makeFields({ body: "Execute: $ARGUMENTS" }));
    expect(skill.expandInvocation("echo $1")).toContain("Execute: echo $1");
  });

  test("a body mixing $ARGUMENTS and positionals interpolates each in one pass", () => {
    const skill = createSkill(makeFields({ body: "Greet $1, all: $ARGUMENTS" }));
    expect(skill.expandInvocation("Alice Bob")).toContain("Greet Alice, all: Alice Bob");
  });
});

describe("Skill.promptEntry", () => {
  test("renders the available_skills entry for one skill", () => {
    const entry = createSkill(makeFields({ name: "deploy", description: "Deploys the app", filePath: "/deploy/SKILL.md" })).promptEntry();
    expect(entry).toBe(
      "  <skill>\n"
      + "    <name>deploy</name>\n"
      + "    <description>Deploys the app</description>\n"
      + "    <location>/deploy/SKILL.md</location>\n"
      + "  </skill>",
    );
  });

  test("escapes xml metacharacters", () => {
    const entry = createSkill(makeFields({ description: "a < b & c > d \" e ' f" })).promptEntry();
    expect(entry).toContain("a &lt; b &amp; c &gt; d &quot; e &apos; f");
  });
});
