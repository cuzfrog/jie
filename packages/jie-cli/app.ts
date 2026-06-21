import {
  createJiePlatform,
  type JiePlatform,
  type MergedSettings,
  type ModelRegistry,
  type ToolRegistry
} from "@cuzfrog/jie-platform";
import type { AuthStore, SettingsStore } from "@cuzfrog/jie-platform/config";
import type { EventManager } from "@cuzfrog/jie-platform/core";
import type { MemoryManager, Storage } from "@cuzfrog/jie-platform/storage";
import type { Team, TeamRegistry } from "@cuzfrog/jie-platform/team";

export interface AppDeps {
  authStore: AuthStore;
  settingsStore: SettingsStore;
  events: EventManager;
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
  | { kind: "ok"; app: App }
  | { kind: "error"; code: number };

export interface AppArgs {
  kind: "print" | "tui";
  cwd: string;
  homeJieDir: string;
  projectJieDir: string | null;
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

  let team: Team;
  try {
    team = deps.teamRegistry.loadTeam(args.teamId ?? settings.defaultTeam);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return { kind: "error", code: 1 };
  }

  let captured: { teamId: string; leaderRole: string; leaderKey: string } | null = null;
  deps.events.subscribe(`${team.id}.team.loaded`, (env) => {
    const agents = (env.payload as { agents: Array<{ role: string; agent_key: string; is_leader: boolean }> }).agents;
    const leader = agents.find((a) => a.is_leader) ?? agents[0];
    if (leader === undefined) return;
    captured = {
      teamId: team.id,
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
        teamId: team.id,
        resumeSessionId: args.resume,
        continueLastSession: args.continueLast,
      },
      deps,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return { kind: "error", code: 1 };
  }

  if (captured === null) {
    console.error(`team '${team.id}' has no agents to run; check the team manifest`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }
  const info: { teamId: string; leaderRole: string; leaderKey: string } = captured;

  if (info.leaderRole === "") {
    console.error(`team '${team.id}' has no leader; check TEAM.md's 'leader:' field`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }

  return {
    kind: "ok",
    app: { handle, ...info, settings },
  };
}
