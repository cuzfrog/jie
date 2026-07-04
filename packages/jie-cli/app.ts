import {
  createJiePlatform,
  JiePlatformError,
  type AgentIdentity,
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
      if (envelope.payload === null) return;
      console.warn(`jie: ${envelope.payload.error}`);
    });
    await handle.start();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return { kind: "error", code: 1 };
  }

  if (args.apiKey !== undefined) {
    try {
      await handle.execute({ name: "setApiKey", apiKey: args.apiKey });
    } catch (error) {
      if (error instanceof JiePlatformError && error.code === "NO_DEFAULT_PROVIDER") {
        console.error(error.message);
        await handle.stop();
        return { kind: "error", code: 1 };
      }
      await handle.stop();
      throw error;
    }
  }

  const requestedTeam = args.teamId ?? handle.settings.defaultTeam ?? "minimal";
  let team: TeamIdentity;
  let agents: ReadonlyArray<AgentIdentity>;
  let leader: AgentIdentity;
  try {
    team = resolveTeam(handle.teams, requestedTeam);
    agents = team.agents;
    leader = pickLeader(agents);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await handle.stop();
    return { kind: "error", code: 1 };
  }
  return {
    kind: "ok",
    app: {
      handle,
      teamId: team.id,
      leaderKey: leader.agentKey,
      agentKeys: agents.map((a) => a.agentKey),
    },
  };
}

function resolveTeam(teams: ReadonlyMap<string, TeamIdentity>, requested: string): TeamIdentity {
  const found = teams.get(requested);
  if (found !== undefined) return found;
  const fallback = teams.get("minimal");
  if (fallback !== undefined) {
    console.warn(`team '${requested}' is not loaded; falling back to 'minimal'`);
    return fallback;
  }
  throw new JiePlatformError("EMPTY_TEAM", {
    detail: `team '${requested}' is not loaded and no 'minimal' fallback is available`,
  });
}

function pickLeader(agents: ReadonlyArray<AgentIdentity>): AgentIdentity {
  const leader = agents.find((a) => a.isLeader);
  if (leader !== undefined) return leader;
  if (agents.length > 0) return agents[0]!;
  throw new JiePlatformError("NO_LEADER", {
    detail: "team has no agents to designate a leader",
  });
}
