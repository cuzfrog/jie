import { createJiePlatform, type JiePlatform } from "@cuzfrog/jie-platform";
import type { AuthStore, Settings, ModelRegistry, SettingsStore } from "@cuzfrog/jie-platform/config";
import type { EventManager } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore, MemoryManager, Storage } from "@cuzfrog/jie-platform/storage";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { ToolRegistry } from "@cuzfrog/jie-platform/tools";

export interface AppDeps {
  readonly authStore: AuthStore;
  readonly settingsStore: SettingsStore;
  readonly eventManager: EventManager;
  readonly storage: Storage;
  readonly teamRegistry: TeamRegistry;
  readonly modelRegistry: ModelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly artifactStore: ArtifactStore;
  readonly memoryManager: MemoryManager;
}

export interface App {
  readonly handle: JiePlatform;
  readonly teamId: string;
  readonly leaderKey: string;
  readonly agentKeys: ReadonlyArray<string>;
  readonly settings: Settings;
}

export type AppCreationResult =
  | { readonly kind: "ok"; readonly app: App }
  | { readonly kind: "error"; readonly code: number };

export interface AppArgs {
  readonly kind: "print" | "tui";
  readonly cwd: string;
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly teamId?: string;
  readonly apiKey?: string;
  readonly resume?: string;
  readonly continueLast?: boolean;
}

export async function createApp(
  args: AppArgs,
  dependencies: AppDeps,
): Promise<AppCreationResult> {
  const settings: Settings = dependencies.settingsStore.load();

  if (args.apiKey !== undefined) {
    const provider = settings.defaultProvider;
    if (provider === undefined) {
      console.error(
        "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
      );
      return { kind: "error", code: 1 };
    }
    dependencies.authStore.saveAuthConfig(
      dependencies.authStore.setProvider(dependencies.authStore.load(), provider, args.apiKey),
    );
    console.log(`logged in to ${provider}`);
  }

  let teamId: string;
  try {
    teamId = dependencies.teamRegistry.parseTeamManifest(args.teamId ?? settings.defaultTeam).id;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return { kind: "error", code: 1 };
  }

  let handle: JiePlatform;
  try {
    handle = await createJiePlatform(
      {
        workspace: args.cwd,
        homeJieDir: args.homeJieDir,
        teamId,
        resumeSessionId: args.resume,
        continueLastSession: args.continueLast,
      },
      dependencies,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return { kind: "error", code: 1 };
  }

  const agents = handle.team.agents;
  if (agents.length === 0) {
    console.error(`team '${teamId}' has no agents to run; check the team manifest`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }
  const leader = agents.find((agent) => agent.isLeader) ?? agents[0]!;
  if (leader.role === "") {
    console.error(`team '${teamId}' has no leader; check TEAM.md's 'leader:' field`);
    await handle.stop();
    return { kind: "error", code: 1 };
  }

  return {
    kind: "ok",
    app: {
      handle,
      teamId,
      leaderKey: leader.agentKey,
      agentKeys: agents.map((agent) => agent.agentKey),
      settings,
    },
  };
}
