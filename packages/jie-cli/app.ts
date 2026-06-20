/** Shared app-startup for the two jie-cli branches.
 *
 *  jie-cli has two branches that both need a started `JiePlatform`:
 *    - `-p` (print mode): one-shot prompt, exit when all agents
 *      go idle. See `commands/print.ts:runPrint`.
 *    - no `-p` (TUI mode): start the TUI loop, run continuously.
 *      Not implemented in v1; the `case "tui"` in `index.ts`
 *      prints a stub message.
 *
 *  `createApp` is the layer that owns the platform's
 *  `createJiePlatform` lifecycle call. Both branches go through
 *  it: it handles `--api-key` (writes `auth.json`), loads
 *  settings, recovers from a stale `defaultTeam`, resolves the
 *  `teamId`, captures the team info from the bus, and applies
 *  the empty-team guard. The branches then receive a started
 *  `JiePlatform` plus the captured team info.
 *
 *  The branches do NOT call `createJiePlatform` themselves.
 *  `createJiePlatform` is a generic platform primitive; the
 *  branches are consumers. The `JiePlatformDeps` (bus, storage,
 *  registries, memory) are constructed in `index.ts:run` and
 *  passed in.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createJiePlatform,
  findProjectJieRoot,
  type JiePlatform,
  type MergedSettings,
  type ModelRegistry,
  type ToolRegistry,
} from "@cuzfrog/jie-platform";
import type { AgentEvent, EventBus } from "@cuzfrog/jie-platform/core";
import type { AuthStore, SettingsStore } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { MemoryManager, Storage } from "@cuzfrog/jie-platform/storage";

export interface AppDeps {
  authStore: AuthStore;
  settingsStore: SettingsStore;
  bus: EventBus;
  storage: Storage;
  teamRegistry: TeamRegistry;
  modelRegistry: ModelRegistry;
  toolRegistry: ToolRegistry;
  memoryManager: MemoryManager;
}

export interface App {
  handle: JiePlatform;
  teamId: string;
  leaderRole: string;
  leaderKey: string;
  settings: MergedSettings;
}

export type AppCreationResult =
  | { kind: "ok"; context: App }
  | { kind: "error"; code: number };

export interface AppArgs {
  kind: "print" | "tui";
  cwd: string;
  /** The user's `~/.jie` directory. Resolved once in `index.ts`
   *  so the dispatcher and `createApp` agree on the value. */
  homeJieDir: string;
  teamId?: string;
  apiKey?: string;
  resume?: string;
  continueLast?: boolean;
}

export async function createApp(
  args: AppArgs,
  deps: AppDeps,
): Promise<AppCreationResult> {
  const settings: MergedSettings = deps.settingsStore.load();

  if (args.apiKey !== undefined) {
    const provider = settings.defaultProvider;
    if (provider === undefined) {
      console.error(
        "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
      );
      return { kind: "error", code: 1 };
    }
    deps.authStore.write(
      deps.authStore.setProvider(deps.authStore.load(), provider, args.apiKey),
    );
    console.log(`logged in to ${provider}`);
  }

  const resolvedTeamId: string =
    args.teamId ??
    resolveStaleDefaultTeam(settings, args.cwd, args.homeJieDir) ??
    "minimal";

  let captured: { teamId: string; leaderRole: string; leaderKey: string } | null = null;
  const subject = `${resolvedTeamId}.team.loaded`;
  deps.bus.subscribe(subject, (_subj: string, payload: object) => {
    const env = payload as AgentEvent;
    const agents = (env.payload.agents ?? []) as Array<{
      role: string;
      agent_key: string;
      is_leader?: boolean;
    }>;
    const leader: { role: string; agent_key: string } | undefined =
      agents.find((a) => a.is_leader === true) ?? agents[0];
    if (leader === undefined) return;
    captured = {
      teamId: env.team_id,
      leaderRole: leader.role,
      leaderKey: leader.agent_key,
    };
  });

  let handle: JiePlatform;
  try {
    handle = await createJiePlatform(
      {
        workspace: args.cwd,
        homeJieDir: args.homeJieDir,
        settingsStore: deps.settingsStore,
        teamId: resolvedTeamId,
        resumeSessionId: args.resume,
        continueLastSession: args.continueLast,
      },
      {
        bus: deps.bus,
        storage: deps.storage,
        teamRegistry: deps.teamRegistry,
        modelRegistry: deps.modelRegistry,
        toolRegistry: deps.toolRegistry,
        memoryManager: deps.memoryManager,
      },
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return { kind: "error", code: 1 };
  }

  if (captured === null) {
    console.error(`team '${resolvedTeamId}' has no agents to run; check the team manifest`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }
  const info: { teamId: string; leaderRole: string; leaderKey: string } = captured;

  if (info.leaderRole === "") {
    console.error(`team '${resolvedTeamId}' has no leader; check TEAM.md's 'leader:' field`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }

  return {
    kind: "ok",
    context: { handle, ...info, settings },
  };
}

type RawSettings = Record<string, unknown>;

function resolveStaleDefaultTeam(
  settings: MergedSettings,
  cwd: string,
  homeJieDir: string,
): string | null {
  const staleId = settings.defaultTeam;
  if (staleId === undefined) return null;

  const projectRoot = findProjectJieRoot(cwd) ?? cwd;
  if (isInstalled(staleId, projectRoot, homeJieDir)) return null;

  const projectPathFull = join(projectRoot, ".jie", "settings.json");
  const globalPathFull = join(homeJieDir, "settings.json");

  const projectRaw = readRawSettings(projectPathFull);
  const globalRaw = readRawSettings(globalPathFull);

  const projectHasStale = projectRaw?.defaultTeam === staleId;
  const globalHasStale = globalRaw?.defaultTeam === staleId;
  const scopePath = projectHasStale
    ? projectPathFull
    : globalHasStale
      ? globalPathFull
      : null;
  const scopeLabel = projectHasStale ? "project" : "global";

  const available = listInstalled(projectRoot, homeJieDir);
  if (available.length === 0) {
    if (scopePath !== null) clearDefaultTeam(scopePath);
    console.warn(
      `defaultTeam '${staleId}' is not installed; no user teams available; falling back to built-in minimal team`,
    );
    return null;
  }

  const recovered = available[0]!;
  if (scopePath !== null) {
    const source = scopePath === projectPathFull ? projectRaw : globalRaw;
    const next: RawSettings = { ...(source ?? {}) };
    next.defaultTeam = recovered;
    writeRawSettings(scopePath, next);
  }
  console.warn(
    `defaultTeam '${staleId}' is not installed; resetting to '${recovered}' in ${scopeLabel} settings`,
  );
  return recovered;
}

function isInstalled(teamId: string, projectPath: string, homeJieDir: string): boolean {
  return (
    existsSync(join(projectPath, ".jie", "teams", teamId, "TEAM.md")) ||
    existsSync(join(homeJieDir, "teams", teamId, "TEAM.md"))
  );
}

function listInstalled(projectPath: string, homeJieDir: string): string[] {
  const ids = new Set<string>();
  for (const root of [
    join(projectPath, ".jie", "teams"),
    join(homeJieDir, "teams"),
  ]) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (existsSync(join(root, entry, "TEAM.md"))) ids.add(entry);
    }
  }
  return [...ids].sort();
}

function readRawSettings(path: string): RawSettings | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RawSettings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function writeRawSettings(path: string, value: RawSettings): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function clearDefaultTeam(path: string): void {
  const raw = readRawSettings(path);
  if (raw === null) return;
  delete raw.defaultTeam;
  writeRawSettings(path, raw);
}
