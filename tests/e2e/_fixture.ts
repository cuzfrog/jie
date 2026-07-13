import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "models.json");

export interface Fixture {
  readonly provider: string;
  readonly modelId: string;
  readonly baseUrl: string;
  readonly raw: string;
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(
      `Missing required env var ${name}. Source ./setenv for local dev, or set it in CI.`,
    );
  }
  return v;
}

const E2E_BASE_URL = requireEnv("JIE_E2E_BASE_URL");
requireEnv("JIE_E2E_API_KEY");
const E2E_MODEL = requireEnv("JIE_E2E_MODEL");

export const FIXTURE: Fixture = (() => {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as {
    providers: Record<string, { baseUrl: string; models: Array<{ id: string }> }>;
  };
  const providerId = Object.keys(parsed.providers)[0]!;
  return {
    provider: providerId,
    modelId: E2E_MODEL,
    baseUrl: E2E_BASE_URL,
    raw,
  };
})();

export async function assertLlmReachable(): Promise<void> {
  const url = FIXTURE.baseUrl;
  let host: string;
  let port: number;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port === ""
      ? u.protocol === "https:" ? 443 : 80
      : Number(u.port);
  } catch (cause) {
    throw new Error(`invalid JIE_E2E_BASE_URL: ${url}`);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      let socket: { end: () => void } | undefined;
      const settle = (fn: () => void): void => {
        try { socket?.end(); } catch { /* socket may already be closed */ }
        fn();
      };
      const timeoutId = setTimeout(
        () => settle(() => reject(new Error("probe timeout"))),
        1500,
      );
      Bun.connect({
        hostname: host,
        port,
        socket: {
          open: (s) => {
            socket = s;
            clearTimeout(timeoutId);
            settle(() => resolve());
          },
          data: () => {},
          error: (_s, err) => {
            clearTimeout(timeoutId);
            settle(() => reject(err));
          },
        },
      }).catch((err: unknown) => {
        clearTimeout(timeoutId);
        settle(() => reject(err));
      });
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `e2e backend at ${url} unreachable (${reason}). Start the LLM (LM Studio for local, or fix JIE_E2E_BASE_URL for CI).`,
    );
  }
}

export function writeModelsJsonTo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "models.json"), FIXTURE.raw);
}

export function writeSettingsJson(dir: string, settings: { defaultProvider?: string; defaultModel?: string; defaultTeam?: string } = {}): void {
  mkdirSync(dir, { recursive: true });
  const merged = {
    defaultProvider: settings.defaultProvider ?? FIXTURE.provider,
    defaultModel: settings.defaultModel ?? FIXTURE.modelId,
    ...(settings.defaultTeam !== undefined ? { defaultTeam: settings.defaultTeam } : {}),
  };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(merged, null, 2));
}

export interface SeedRole {
  readonly role: string;
  readonly systemPrompt: string;
  readonly tools?: ReadonlyArray<string>;
  readonly model?: string;
  readonly subscribe?: ReadonlyArray<string>;
}

export function seedTeam(jieDir: string, teamId: string, leaderRole: string, roles: ReadonlyArray<SeedRole>): void {
  const teamsDir = join(jieDir, "teams", teamId);
  mkdirSync(teamsDir, { recursive: true });
  writeFileSync(
    join(teamsDir, "TEAM.md"),
    `---\nleader: ${leaderRole}\n---\nYou are the leader of ${teamId}.\n`,
  );
  for (const role of roles) {
    const tools = role.tools ?? [];
    const toolsYaml = tools.length === 0 ? "tools: []" : `tools:\n${tools.map((t) => `  - ${t}`).join("\n")}`;
    const modelLine = role.model !== undefined ? `model: ${role.model}\n` : "";
    const subscribe = role.subscribe ?? [];
    const subscribeYaml = subscribe.length === 0 ? "" : `\nsubscribe:\n${subscribe.map((t) => `  - ${t}`).join("\n")}`;
    writeFileSync(
      join(teamsDir, `${role.role}.md`),
      `---\n${modelLine}${toolsYaml}${subscribeYaml}\n---\n${role.systemPrompt}\n`,
    );
  }
}
