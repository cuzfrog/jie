export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly filePath: string;
  readonly baseDir: string;
}

export interface SkillDiagnostic {
  readonly path: string;
  readonly message: string;
}

export interface LoadSkillsResult {
  readonly skills: ReadonlyArray<Skill>;
  readonly diagnostics: ReadonlyArray<SkillDiagnostic>;
}

export interface SkillManager {
  resolve(spec: string): Skill[];
  list(): Skill[];
}
