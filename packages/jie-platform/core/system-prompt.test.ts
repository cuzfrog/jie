import type { Skill } from "../skills";
import { composeSystemPrompt } from "./system-prompt";

function skill(name: string, entry: string): Skill {
  return {
    name, description: `${name} description`, argumentHint: null, filePath: `/${name}/SKILL.md`, baseDir: `/${name}`, body: "body",
    expandInvocation: () => "",
    promptEntry: () => entry,
  };
}

describe("composeSystemPrompt", () => {
  test("role prompt alone is returned verbatim", () => {
    expect(composeSystemPrompt({ rolePrompt: "You are a worker." })).toBe("You are a worker.");
  });

  test("no skills leaves the role prompt unchanged", () => {
    expect(composeSystemPrompt({ rolePrompt: "You are a worker.", skills: [] })).toBe("You are a worker.");
  });

  test("appends the skills block after the role prompt", () => {
    const output = composeSystemPrompt({ rolePrompt: "You are a worker.", skills: [skill("deploy", "ENTRY-deploy")] });
    expect(output.startsWith("You are a worker.")).toBe(true);
    expect(output).toContain("<available_skills>");
    expect(output).toContain("ENTRY-deploy");
    expect(output).toContain("</available_skills>");
  });

  test("the skills block carries the progressive-disclosure header", () => {
    const output = composeSystemPrompt({ rolePrompt: "ROLE", skills: [skill("deploy", "ENTRY")] });
    expect(output).toContain("The following skills provide specialized instructions for specific tasks.");
    expect(output).toContain("read_file");
  });

  test("dedupes skills by name, first occurrence wins", () => {
    const output = composeSystemPrompt({ rolePrompt: "ROLE", skills: [skill("deploy", "ENTRY-first"), skill("deploy", "ENTRY-second")] });
    expect(output.match(/ENTRY-first/g)).toHaveLength(1);
    expect(output).not.toContain("ENTRY-second");
  });

  test("prepends the context block before the role prompt", () => {
    const output = composeSystemPrompt({ rolePrompt: "You are a worker.", contextBlock: "<context_files></context_files>" });
    expect(output).toBe("<context_files></context_files>\n\nYou are a worker.");
  });

  test("an empty context block leaves the role prompt unchanged", () => {
    expect(composeSystemPrompt({ rolePrompt: "You are a worker.", contextBlock: "" })).toBe("You are a worker.");
  });

  test("orders context, then role prose, then skills", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      contextBlock: "CONTEXT",
      skills: [skill("deploy", "ENTRY")],
    });
    expect(output.indexOf("CONTEXT")).toBeLessThan(output.indexOf("ROLE"));
    expect(output.indexOf("ROLE")).toBeLessThan(output.indexOf("<available_skills>"));
  });

  test("places the memory block between the context block and the role prose", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      contextBlock: "CONTEXT",
      memoryBlock: "<memory team=\"t1\">- [instruction] keep the build green</memory>",
    });
    expect(output).toBe(
      "CONTEXT\n\n<memory team=\"t1\">- [instruction] keep the build green</memory>\n\nROLE",
    );
  });

  test("an empty memory block leaves the rest unchanged", () => {
    expect(composeSystemPrompt({ rolePrompt: "ROLE", contextBlock: "CONTEXT", memoryBlock: "" })).toBe("CONTEXT\n\nROLE");
  });

  test("a memory block without a context block still precedes the role prose", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      memoryBlock: "<memory team=\"t1\">- [fact] sqlite over postgres</memory>",
    });
    expect(output).toBe("<memory team=\"t1\">- [fact] sqlite over postgres</memory>\n\nROLE");
  });
});
