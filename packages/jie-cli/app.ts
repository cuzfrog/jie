import {
  createJiePlatform,
  JiePlatformError,
  type JiePlatform,
  type JiePlatformOptions,
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
  readonly continueLast?: boolean;
}

export async function createApp(
  args: AppArgs,
  createPlatform: (options: JiePlatformOptions) => Promise<JiePlatform> = createJiePlatform,
): Promise<AppCreationResult> {
  let handle: JiePlatform;
  try {
    handle = await createPlatform({
      workspace: args.cwd,
      homeJieDir: args.homeJieDir,
      projectJieDir: args.projectJieDir,
      teamId: args.teamId,
      resumeSessionId: args.resume,
      continueLastSession: args.continueLast,
    });
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

  const agents = handle.team.agents;
  const leader = agents.find((a) => a.isLeader) ?? agents[0]!;
  return {
    kind: "ok",
    app: {
      handle,
      teamId: handle.team.id,
      leaderKey: leader.agentKey,
      agentKeys: agents.map((a) => a.agentKey),
    },
  };
}
