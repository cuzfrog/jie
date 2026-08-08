import { asClass, type AwilixContainer } from "awilix";
import { join } from "node:path";
import type { PlatformCradle } from "../container";
import { SkillManagerImpl } from "./skill-manager";

export function registerSkillsModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    skillManager: asClass(SkillManagerImpl).singleton().inject((c) => ({
      homeSkillsDir: join(c.resolve("homeJieDir"), "skills"),
      projectSkillsDir: c.resolve("projectJieDir") === null ? null : join(c.resolve("projectJieDir"), "skills"),
    })),
  });
}
