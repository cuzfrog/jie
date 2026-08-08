import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlatformCradle } from "../container";
import { registerSkillsModule } from "./module";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeJieDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jie-skills-module-"));
  tempDirs.push(dir);
  return dir;
}

function writeSkill(skillsDir: string, name: string, frontmatter: string): void {
  const dirPath = join(skillsDir, name);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, "SKILL.md"), `---\n${frontmatter}\n---\nbody\n`);
}

function bootedContainer(homeJieDir: string): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({ homeJieDir: asValue(homeJieDir), projectJieDir: asValue(null) });
  registerSkillsModule(container);
  return container;
}

describe("registerSkillsModule", () => {
  test("resolves a skillManager that sees skills under the cradle home dir", () => {
    const homeJieDir = makeJieDir();
    writeSkill(join(homeJieDir, "skills"), "deploy", "description: Deploys the app");
    const manager = bootedContainer(homeJieDir).resolve("skillManager");
    expect(manager.resolve("deploy").map((s) => s.name)).toEqual(["deploy"]);
  });

  test("invalid skills are skipped leniently and the manager still resolves", () => {
    const homeJieDir = makeJieDir();
    writeSkill(join(homeJieDir, "skills"), "Bad_Name", "description: nope");
    const manager = bootedContainer(homeJieDir).resolve("skillManager");
    expect(manager.resolve("*")).toEqual([]);
  });
});
