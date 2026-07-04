import type { JiePlatform } from "../jie-platform";
import type {
  ApiKeyArgs,
  ApiKeyResult,
  CommandDeps,
  LoginArgs,
  LoginResult,
  LogoutArgs,
  LogoutResult,
  ModelArgs,
  ModelResult,
  PrintArgs,
  PrintResult,
  TeamArgs,
  TeamResult,
} from "./command-defs";

export async function runPrint(args: PrintArgs, platform: JiePlatform): Promise<PrintResult> {
  const teamId = platform.team.id;
  const agents = platform.team.agents;
  if (agents.length === 0) return { kind: "error", message: `team '${teamId}' has no agents to run; check the team manifest` };
  const leader = agents.find((a) => a.isLeader) ?? agents[0];
  if (leader === undefined || leader.role === "") {
    return { kind: "error", message: `team '${teamId}' has no leader; check TEAM.md's 'leader:' field` };
  }
  const leaderAgentKey = leader.agentKey;
  const agentKeys = agents.map((a) => a.agentKey);

  let streamUnsub: (() => void) | null = null;
  let turnStartUnsub: (() => void) | null = null;
  let idleUnsub: (() => void) | null = null;

  const cleanup = (): void => {
    if (streamUnsub !== null) { streamUnsub(); streamUnsub = null; }
    if (turnStartUnsub !== null) { turnStartUnsub(); turnStartUnsub = null; }
    if (idleUnsub !== null) { idleUnsub(); idleUnsub = null; }
  };

  const finished = new Promise<PrintResult>((resolve) => {
    const state = new Map<string, "busy" | "idle">();
    for (const key of agentKeys) state.set(key, "idle");

    let resolveIdle!: () => void;
    const idlePromise = new Promise<void>((res) => { resolveIdle = res; });

    streamUnsub = platform.subscribe("agent.stream.chunk", (envelope) => {
      if (envelope.sender.kind !== "agent") return;
      if (envelope.sender.teamId !== teamId) return;
      if (envelope.sender.agentKey !== leaderAgentKey) return;
      const text = envelope.payload.text;
      if (args.json) process.stdout.write(JSON.stringify({ chunk: text, seq: envelope.payload.seq }) + "\n");
      else process.stdout.write(text);
    });

    turnStartUnsub = platform.subscribe("agent.turn.start", (envelope) => {
      if (envelope.sender.kind !== "agent") return;
      if (envelope.sender.teamId !== teamId) return;
      state.set(envelope.sender.agentKey, "busy");
    });

    idleUnsub = platform.subscribe("agent.idle", (envelope) => {
      if (envelope.sender.kind !== "agent") return;
      if (envelope.sender.teamId !== teamId) return;
      if (!state.has(envelope.sender.agentKey)) return;
      state.set(envelope.sender.agentKey, "idle");
      if ([...state.values()].every((v) => v === "idle")) resolveIdle();
    });

    platform.prompt(leaderAgentKey, args.instruction);

    if (args.timeout > 0) {
      const timer = setTimeout(() => resolve({ kind: "timeout" }), args.timeout * 1000);
      idlePromise.then(() => clearTimeout(timer));
    }

    void idlePromise.then(() => resolve({ kind: "ok" }));
  });

  try {
    const result = await finished;
    if (!args.json) process.stdout.write("\n");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "error", message };
  } finally {
    cleanup();
    await platform.stop();
  }
}

export async function runLogin(args: LoginArgs, deps: CommandDeps): Promise<LoginResult> {
  const auth = deps.authStore.load();
  const next = deps.authStore.setProvider(auth, args.provider, args.apiKey);
  deps.authStore.saveAuthConfig(next);
  return { kind: "ok" };
}

export async function runLogout(args: LogoutArgs, deps: CommandDeps): Promise<LogoutResult> {
  if (args.provider === undefined) {
    deps.authStore.saveAuthConfig(deps.authStore.clear());
    return { kind: "ok" };
  }
  const auth = deps.authStore.load();
  const next = deps.authStore.removeProvider(auth, args.provider);
  deps.authStore.saveAuthConfig(next);
  return { kind: "ok" };
}

export async function runApiKey(args: ApiKeyArgs, deps: CommandDeps): Promise<ApiKeyResult> {
  const settings = deps.settingsLoad();
  const provider = settings.defaultProvider;
  if (provider === undefined) {
    return {
      kind: "error",
      message: "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
    };
  }
  const auth = deps.authStore.load();
  const next = deps.authStore.setProvider(auth, provider, args.apiKey);
  deps.authStore.saveAuthConfig(next);
  return { kind: "ok" };
}

export async function runModel(args: ModelArgs, deps: CommandDeps): Promise<ModelResult> {
  const known = new Set<string>(deps.modelRegistry.providers());
  if (!known.has(args.provider)) {
    return { kind: "error", message: `unknown provider: ${args.provider}` };
  }
  const existing = deps.settingsLoad();
  const next = { ...existing, defaultProvider: args.provider, defaultModel: args.modelId };
  deps.settingsStore.write(next, deps.defaultScope);
  return { kind: "ok" };
}

export async function runTeam(args: TeamArgs, deps: CommandDeps): Promise<TeamResult> {
  if (args.teamId === undefined && !args.unset) {
    return { kind: "ok" };
  }
  if (args.unset) {
    deps.settingsStore.unsetDefaultTeam();
    return { kind: "ok" };
  }
  const id = args.teamId;
  if (id === undefined) return { kind: "error", message: "missing team id" };
  if (!deps.teamRegistry.isInstalled(id)) {
    return {
      kind: "error",
      message: `team '${id}' is not installed; checked .jie/teams/${id}/ and ~/.jie/teams/${id}/`,
    };
  }
  const existing = deps.settingsLoad();
  const next = { ...existing, defaultTeam: id };
  const loc = deps.teamRegistry.locate(id);
  deps.settingsStore.write(next, loc === "project" ? "project" : "global");
  return { kind: "ok" };
}
