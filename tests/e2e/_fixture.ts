import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Settings } from "../../src/platform";

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "models.json");

export interface Fixture {
  readonly provider: string;
  readonly modelId: string;
  readonly baseUrl: string;
  readonly raw: string;
}

export const FIXTURE: Fixture = (() => {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as {
    providers: Record<string, { baseUrl: string; models: Array<{ id: string }> }>;
  };
  const providerId = Object.keys(parsed.providers)[0]!;
  const provider = parsed.providers[providerId]!;
  const modelId = provider.models[0]?.id;
  if (modelId === undefined) throw new Error(`e2e fixture models.json has no models for provider '${providerId}'`);
  return {
    provider: providerId,
    modelId,
    baseUrl: provider.baseUrl,
    raw,
  };
})();

export function writeModelsJsonTo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "models.json"), FIXTURE.raw);
}

export function writeSettingsJson(
  dir: string,
  settings: { defaultProvider?: string; defaultModel?: string; defaultTeam?: string; compaction?: NonNullable<Settings["compaction"]> } = {},
): void {
  mkdirSync(dir, { recursive: true });
  const merged: Record<string, unknown> = {
    defaultProvider: settings.defaultProvider ?? FIXTURE.provider,
    defaultModel: settings.defaultModel ?? FIXTURE.modelId,
  };
  if (settings.defaultTeam !== undefined) merged.defaultTeam = settings.defaultTeam;
  if (settings.compaction !== undefined) merged.compaction = settings.compaction;
  writeFileSync(join(dir, "settings.json"), JSON.stringify(merged, null, 2));
}

export interface SeedRole {
  readonly role: string;
  readonly systemPrompt: string;
  readonly tools?: ReadonlyArray<string>;
  readonly model?: string;
  readonly targetContextWindowSize?: number;
  readonly subscribe?: ReadonlyArray<string>;
  readonly skills?: ReadonlyArray<string>;
}

export function seedTeam(jieDir: string, teamId: string, leaderRole: string, roles: ReadonlyArray<SeedRole>): void {
  const teamsDir = join(jieDir, "teams", teamId);
  mkdirSync(teamsDir, { recursive: true });
  writeFileSync(
    join(teamsDir, "TEAM.md"),
    `---\nleader: ${leaderRole}\n---\n`,
  );
  for (const role of roles) {
    const tools = role.tools ?? [];
    const toolsYaml = tools.length === 0 ? "tools: []" : `tools:\n${tools.map((t) => `  - ${t}`).join("\n")}`;
    const modelLine = role.model !== undefined ? `model: ${role.model}\n` : "";
    const targetWindowLine = role.targetContextWindowSize !== undefined ? `target_context_window_size: ${role.targetContextWindowSize}\n` : "";
    const subscribe = role.subscribe ?? [];
    const subscribeYaml = subscribe.length === 0 ? "" : `\nsubscribe:\n${subscribe.map((t) => `  - ${t}`).join("\n")}`;
    const skills = role.skills ?? [];
    const skillsYaml = skills.length === 0 ? "" : `\nskills:\n${skills.map((s) => `  - ${s}`).join("\n")}`;
    writeFileSync(
      join(teamsDir, `${role.role}.md`),
      `---\n${modelLine}${targetWindowLine}${toolsYaml}${subscribeYaml}${skillsYaml}\n---\n${role.systemPrompt}\n`,
    );
  }
}

export function seedSkill(jieDir: string, name: string, description: string, body: string): void {
  const skillDir = join(jieDir, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\ndescription: ${description}\n---\n${body}\n`,
  );
}
