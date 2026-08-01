import type { Skill } from "./types";
import { InMemorySkillManager } from "./skill-manager";

function skill(name: string): Skill {
  return { name, description: `${name} description`, filePath: `/${name}/SKILL.md`, baseDir: `/${name}` };
}

describe("InMemorySkillManager", () => {
  const manager = new InMemorySkillManager([skill("deploy"), skill("deploy-prod"), skill("test-unit")]);

  test("resolve exact name", () => {
    expect(manager.resolve("deploy").map((s) => s.name)).toEqual(["deploy"]);
  });

  test("resolve wildcard matches by prefix", () => {
    expect(manager.resolve("deploy-*").map((s) => s.name)).toEqual(["deploy-prod"]);
  });

  test("resolve star matches all", () => {
    expect(manager.resolve("*").map((s) => s.name).sort()).toEqual(["deploy", "deploy-prod", "test-unit"]);
  });

  test("resolve no match returns empty", () => {
    expect(manager.resolve("missing")).toEqual([]);
  });
});
