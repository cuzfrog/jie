import { asFunction, type AwilixContainer } from "awilix";
import { join } from "node:path";
import { logger } from "@cuzfrog/jie-utils";
import type { PlatformCradle } from "../container";
import { loadSkills } from "./load-skills";
import { InMemorySkillManager } from "./skill-manager";

const log = logger.getSubLogger({ name: "jie.platform.skills" });

export function registerSkillsModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    skillManager: asFunction((homeJieDir: string, projectJieDir: string | null) => {
      const result = loadSkills({
        homeSkillsDir: join(homeJieDir, "skills"),
        projectSkillsDir: projectJieDir === null ? null : join(projectJieDir, "skills"),
      });
      for (const diagnostic of result.diagnostics) {
        log.warn(`skill at ${diagnostic.path} skipped: ${diagnostic.message}`);
      }
      return new InMemorySkillManager(result.skills);
    }).singleton(),
  });
}
