import type { Skill, SkillManager } from "./types";

export class InMemorySkillManager implements SkillManager {
  private readonly skills: Map<string, Skill>;
  private readonly globs = new Map<string, Bun.Glob>();

  constructor(skills: ReadonlyArray<Skill>) {
    this.skills = new Map(skills.map((skill) => [skill.name, skill]));
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
