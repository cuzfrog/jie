import { asFunction, type AwilixContainer } from "awilix";
import { join } from "node:path";
import type { PlatformCradle } from "../container";
import { SkillManagerImpl } from "./skill-manager";

export function registerSkillsModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    skillManager: asFunction((homeJieDir: string, projectJieDir: string | null) =>
      new SkillManagerImpl({
        homeSkillsDir: join(homeJieDir, "skills"),
        projectSkillsDir: projectJieDir === null ? null : join(projectJieDir, "skills"),
      })
    ).singleton(),
  });
}
