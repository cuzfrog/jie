import { logger } from "@cuzfrog/jie-utils";
import { type LoadSkillsOptions, loadSkills } from "./load-skills";
import type { Skill, SkillManager } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.skills" });

export class SkillManagerImpl implements SkillManager {
  private skills = new Map<string, Skill>();
  private readonly globs = new Map<string, Bun.Glob>();

  constructor(private readonly options: LoadSkillsOptions) {
    this.reload();
  }

  reload(): void {
    const result = loadSkills(this.options);
    for (const diagnostic of result.diagnostics) {
      log.warn(`skill at ${diagnostic.path} skipped: ${diagnostic.message}`);
    }
    this.skills = new Map(result.skills.map((skill) => [skill.name, skill]));
  }

  resolve(spec: string): Skill[] {
    let glob = this.globs.get(spec);
    if (glob === undefined) {
      glob = new Bun.Glob(spec);
      this.globs.set(spec, glob);
    }
    const matched: Skill[] = [];
    for (const [name, skill] of this.skills) {
      if (glob.match(name)) matched.push(skill);
    }
    return matched;
  }
}
