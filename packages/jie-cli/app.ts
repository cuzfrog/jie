import { createJiePlatform, type JiePlatform } from "@cuzfrog/jie-platform";
import type { AuthStore, MergedSettings, ModelRegistry, SettingsStore } from "@cuzfrog/jie-platform/config";
import type { EventManager } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore, MemoryManager, Storage } from "@cuzfrog/jie-platform/storage";
import type { Team, TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { ToolRegistry } from "@cuzfrog/jie-platform/tools";

export interface AppDeps {
  authStore: AuthStore;
  settingsStore: SettingsStore;
  eventManager: EventManager;
  storage: Storage;
  teamRegistry: TeamRegistry;
  modelRegistry: ModelRegistry;
  toolRegistry: ToolRegistry;
  artifactStore: ArtifactStore;
  memoryManager: MemoryManager;
}

export interface App {
  handle: JiePlatform;
  teamId: string;
  leaderRole: string;
  leaderKey: string;
  agentKeys: string[];
  settings: MergedSettings;
}

export type AppCreationResult =
  | { kind: "ok"; app: App }
  | { kind: "error"; code: number };

type Captured = Pick<App, "teamId" | "leaderRole" | "leaderKey" | "agentKeys">;

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
  dependencies: AppDeps,
): Promise<AppCreationResult> {
  const settings: MergedSettings = dependencies.settingsStore.load();

  if (args.apiKey !== undefined) {
    const provider = settings.defaultProvider;
    if (provider === undefined) {
      console.error(
        "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
      );
      return { kind: "error", code: 1 };
    }
    dependencies.authStore.write(
      dependencies.authStore.setProvider(dependencies.authStore.load(), provider, args.apiKey),
    );
    console.log(`logged in to ${provider}`);
  }

  let team: Team;
  try {
    team = dependencies.teamRegistry.loadTeam(args.teamId ?? settings.defaultTeam);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return { kind: "error", code: 1 };
  }

  let captured: Captured | null = null;
  dependencies.eventManager.subscribe(`team.${team.id}.loaded`, (env: { payload: unknown }) => {
    const agents = (env.payload as { agents: Array<{ role: string; agent_key: string; is_leader: boolean }> }).agents;
    const leader = agents.find((a) => a.is_leader) ?? agents[0];
    if (leader === undefined) return;
    captured = {
      teamId: team.id,
      leaderRole: leader.role,
      leaderKey: leader.agent_key,
      agentKeys: agents.map((a) => a.agent_key),
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
      dependencies,
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
  const capturedInfo: Captured = captured;
  if (capturedInfo.leaderRole === "") {
    console.error(`team '${team.id}' has no leader; check TEAM.md's 'leader:' field`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }

  return {
    kind: "ok",
    app: { handle, ...capturedInfo, settings },
  };
}
