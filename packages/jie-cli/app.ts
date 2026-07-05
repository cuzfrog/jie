import {
  createJiePlatform,
  JiePlatformError,
  type JiePlatform,
  type JiePlatformOptions,
  type TeamIdentity,
} from "@cuzfrog/jie-platform";

export interface App {
  readonly handle: JiePlatform;
  readonly teamId: string;
  readonly leaderKey: string;
  readonly agentKeys: ReadonlyArray<string>;
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
}

const BUILTIN_MINIMAL_TEAM_ID = "minimal";

export async function createApp(
  args: AppArgs,
  createPlatform: (options: JiePlatformOptions) => Promise<JiePlatform> = createJiePlatform,
): Promise<AppCreationResult> {
  let handle: JiePlatform;
  try {
    handle = await createPlatform({
      cwd: args.cwd,
      homeJieDir: args.homeJieDir,
      projectJieDir: args.projectJieDir,
      resumeSessionId: args.resume,
    });
    handle.subscribe("system.error", (envelope) => {
      console.warn(`jie: ${envelope.payload.error}`);
    });
    await handle.start();
  } catch (error) {
    return fail(error, null);
  }

  if (args.apiKey !== undefined) {
    try {
      await handle.execute({ name: "setApiKey", apiKey: args.apiKey });
    } catch (error) {
      if (error instanceof JiePlatformError && error.code === "NO_DEFAULT_PROVIDER") {
        return fail(error, handle);
      }
      return fail(error, handle, true);
    }
  }

  const requestedTeam = args.teamId ?? handle.settings.defaultTeam;
  try {
    return { kind: "ok", app: toApp(handle, requestedTeam) };
  } catch (error) {
    return fail(error, handle);
  }
}

async function fail(error: unknown, handle: JiePlatform | null, rethrow: boolean = false): Promise<AppCreationResult> {
  console.error(error instanceof Error ? error.message : String(error));
  if (handle !== null) await handle.stop();
  if (rethrow) throw error;
  return { kind: "error", code: 1 };
}

function toApp(handle: JiePlatform, requestedTeam?: string): App {
  const team = resolveTeam(handle.teams, requestedTeam);
  const leader = team.agents.find((a) => a.isLeader);
  if (leader === undefined) {
    throw new JiePlatformError("NO_LEADER", {
      detail: "team has no agents to designate a leader",
    });
  }
  return {
    handle,
    teamId: team.id,
    leaderKey: leader.agentKey,
    agentKeys: team.agents.map((a) => a.agentKey),
  };
}

function resolveTeam(teams: ReadonlyMap<string, TeamIdentity>, requested?: string): TeamIdentity {
  const fallback = teams.get(requested || BUILTIN_MINIMAL_TEAM_ID);
  if (fallback !== undefined) {
    console.warn(`team '${requested}' is not loaded; falling back to '${BUILTIN_MINIMAL_TEAM_ID}'`);
    return fallback;
  }
  throw new JiePlatformError("EMPTY_TEAM", {
    detail: `team '${requested}' is not loaded and no '${BUILTIN_MINIMAL_TEAM_ID}' fallback is available`,
  });
}
