import type { Skill } from "../skills";
import { composeSystemPrompt } from "./compose";

function skill(name: string, description: string): Skill {
  return { name, description, filePath: `/${name}/SKILL.md`, baseDir: `/${name}` };
}

describe("composeSystemPrompt", () => {
  test("role prompt alone is returned verbatim", () => {
    expect(composeSystemPrompt({ rolePrompt: "You are a worker." })).toBe("You are a worker.");
  });

  test("no skills leaves the role prompt unchanged", () => {
    expect(composeSystemPrompt({ rolePrompt: "You are a worker.", skills: [] })).toBe("You are a worker.");
  });

  test("appends the skills block after the role prompt", () => {
    const output = composeSystemPrompt({ rolePrompt: "You are a worker.", skills: [skill("deploy", "Deploys")] });
    expect(output.startsWith("You are a worker.")).toBe(true);
    expect(output).toContain("<available_skills>");
    expect(output).toContain("<name>deploy</name>");
  });
});
