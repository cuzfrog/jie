import type { Skill } from "./types";
import { formatSkillsForPrompt } from "./format-skills";

function skill(name: string, description: string, filePath = `/${name}/SKILL.md`): Skill {
  return { name, description, filePath, baseDir: `/${name}` };
}

describe("formatSkillsForPrompt", () => {
  test("empty list yields empty string", () => {
    expect(formatSkillsForPrompt([])).toBe("");
  });

  test("formats skills into an available_skills block", () => {
    const output = formatSkillsForPrompt([skill("deploy", "Deploys the app")]);
    expect(output).toContain("<available_skills>");
    expect(output).toContain("<name>deploy</name>");
    expect(output).toContain("<description>Deploys the app</description>");
    expect(output).toContain("<location>/deploy/SKILL.md</location>");
    expect(output).toContain("read_file");
  });

  test("dedupes skills by name", () => {
    const output = formatSkillsForPrompt([skill("deploy", "first"), skill("deploy", "second")]);
    expect(output.match(/<name>deploy<\/name>/g)).toHaveLength(1);
    expect(output).toContain("<description>first</description>");
  });

  test("escapes xml metacharacters", () => {
    const output = formatSkillsForPrompt([skill("deploy", "a < b & c > d")]);
    expect(output).toContain("a &lt; b &amp; c &gt; d");
  });
});
