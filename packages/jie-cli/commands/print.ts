/** `jie -p` (print mode) — the full agentic pipeline against a real LLM.
 *
 *  Pipeline:
 *    1. (Optional) `--api-key` writes `auth.json` for the
 *       resolved `defaultProvider`.
 *    2. Load merged settings, recover from a stale `defaultTeam`.
 *    3. Validate the chosen team id is installed.
 *    4. Open the SQLite storage under `{cwd}/.jie/artifacts.db`.
 *    5. Build a `getApiKey` resolver that prefers `auth.json` and
 *       falls back to `models.json` env-interpolated keys.
 *    6. Hand off to `startJie` to spin up the bodies.
 *    7. Pick the leader body, publish the prompt envelope, and
 *       filter the `agent.stream.chunk` bus for the leader's
 *       text. Open the idle gate; exit when all bodies are idle
 *       and the timeout (if any) has not elapsed.
 *
 *  The `PrintDeps` type carries the runtime stores plus optional
 *  test hooks (`loadTeam`, `resolveModel`, `getApiKey`,
 *  `settingsOverride`, `createAgent`, `teamRegistry`). Real
 *  `main` constructs the runtime stores from `process.env.HOME`;
 *  tests inject mocks.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  ModelRegistry,
  SqliteStorage,
  findProjectJieRoot,
  resolveStaleDefaultTeam,
  startJie,
  type AgentEvent,
  type AuthJson,
  type JieHandle,
  type MergedSettings,
} from "@cuzfrog/jie-platform";
import { createTeamRegistry, type Team, type TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { Model } from "@earendil-works/pi-ai";
import type { Agent } from "@earendil-works/pi-agent-core";
import type { AuthStore } from "../auth-store.ts";
import type { SettingsStore } from "../settings-store.ts";
import type { ParsedCli } from "../cli-flags.ts";

export type PrintArgs = Extract<ParsedCli, { kind: "print" }>;

export interface PrintDeps {
  authStore: AuthStore;
  settingsStore: SettingsStore;
  homeDir: string;
  /** Optional override for the team registry. If omitted,
   *  `runPrint` constructs one from `cwd` and `homeDir`. */
  teamRegistry?: TeamRegistry;
  loadTeam?: (teamId: string) => Team;
  resolveModel?: (provider: string, modelId: string) => Model<any>;
  getApiKey?: (provider: string) => string | undefined;
  settingsOverride?: MergedSettings;
  createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

function projectStoragePath(cwd: string): string {
  const root = findProjectJieRoot(cwd);
  if (root === null) {
    mkdirSync(join(cwd, ".jie"), { recursive: true, mode: 0o755 });
    return join(cwd, ".jie", "storage.db");
  }
  return join(root, ".jie", "storage.db");
}

export async function runPrint(
  parsed: PrintArgs,
  cwd: string,
  deps: PrintDeps,
): Promise<number> {
  // --api-key first (writes auth.json before the rest of the flow runs).
  if (parsed.apiKey !== undefined) {
    const provider = deps.settingsStore.load(cwd).defaultProvider;
    if (provider === undefined) {
      console.error(
        "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
      );
      return 1;
    }
    deps.authStore.write(
      deps.authStore.setProvider(deps.authStore.load(), provider, parsed.apiKey),
    );
    console.log(`logged in to ${provider}`);
  }

  // Discover settings and team.
  let settings: MergedSettings;
  try {
    settings = deps.settingsStore.load(cwd);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }

  // Apply stale defaultTeam recovery.
  const recovered = resolveStaleDefaultTeam(settings, cwd, { homeDir: deps.homeDir });
  if (recovered !== null) {
    settings.defaultTeam = recovered;
  }

  const teamRegistry =
    deps.teamRegistry ??
    createTeamRegistry({ workspace: cwd, homeJieDir: deps.homeDir });

  // The chosen teamId. When the user has not set `--team` and
  // `settings.defaultTeam` is unset, fall back to the built-in
  // minimal team (the magic string `"minimal"` is recognized by
  // the registry's `loadTeam`).
  const teamId: string = parsed.team ?? settings.defaultTeam ?? "minimal";
  if (!teamRegistry.isValidTeamId(teamId)) {
    console.error(
      `invalid team id '${teamId}'; must match [A-Za-z0-9_-]{1,32}`,
    );
    return 1;
  }
  if (!teamRegistry.isInstalled(teamId)) {
    console.error(
      `team '${teamId}' is not installed; checked .jie/teams/${teamId}/ and ~/.jie/teams/${teamId}/`,
    );
    return 1;
  }

  // Open storage.
  const artifactsPath = projectStoragePath(cwd);
  const storage = new SqliteStorage(artifactsPath);

  // Read auth for getApiKey.
  const auth = deps.authStore.load();
  const authGetApiKey = (provider: string): string | undefined => {
    const entry = (auth as AuthJson)[provider];
    if (entry === undefined) return undefined;
    if (entry.type === "api_key") return entry.key;
    return undefined;
  };
  // The auth.json entry wins; fall back to the registry's
  // `models.json`-resolved key (e.g. `$MY_API_KEY` env interpolation
  // for a custom provider). This makes the user's local LLM
  // config in `models.json` work end-to-end without writing to
  // `auth.json`.
  const registryFallback = ModelRegistry.load(cwd, { homeDir: deps.homeDir });
  const getApiKey =
    deps.getApiKey ??
    (async (provider: string): Promise<string | undefined> => {
      const fromAuth = authGetApiKey(provider);
      if (fromAuth !== undefined) return fromAuth;
      return registryFallback.getApiKey(provider);
    });
  const finalSettings = deps.settingsOverride ?? settings;

  // Resolve team blueprint eagerly to know the leader's role.
  let handle: JieHandle;
  try {
    handle = await startJie({
      workspace: cwd,
      homeJieDir: deps.homeDir,
      settings: finalSettings,
      storage,
      teamId,
      resumeSessionId: parsed.resume,
      continueLastSession: parsed.continueLast,
      getApiKey,
      loadTeam: deps.loadTeam,
      teamRegistry: deps.teamRegistry,
      resolveModel: deps.resolveModel,
      createAgent: deps.createAgent,
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    storage.close();
    return 1;
  }

  if (handle.bodies().length === 0) {
    console.error(`team '${teamId}' has no agents to run; check the team manifest`);
    await handle.stop();
    storage.close();
    return 1;
  }

  // Resolve leader. The handle flags the leader body with
  // `is_leader: true` (per `start.ts`: `soul.role === bp.leaderRole`),
  // so we look it up from the loaded bodies rather than guessing
  // from the alphabetically-sorted role list.
  const leader = handle.bodiesFor(teamId).find((b) => b.is_leader);
  if (leader === undefined) {
    console.error(`team '${teamId}' has no leader; check TEAM.md's 'leader:' field`);
    await handle.stop();
    storage.close();
    return 1;
  }
  const leaderRole = leader.soul.role;
  const leaderKey = leader.agent_key;

  // Set up stream filtering + idle gate.
  return runGate(handle, storage, {
    teamId,
    leaderRole,
    leaderKey,
    instruction: parsed.instruction,
    timeout: parsed.timeout,
    json: parsed.json,
  });
}

interface GateOptions {
  teamId: string;
  leaderRole: string;
  leaderKey: string;
  instruction: string;
  timeout: number;
  json: boolean;
}

async function runGate(
  handle: JieHandle,
  storage: SqliteStorage,
  opts: GateOptions,
): Promise<number> {
  // Stream filter.
  handle.bus.subscribe("agent.stream.chunk", (_subj, payload) => {
    const env = payload as AgentEvent;
    if (env.team_id !== opts.teamId) return;
    if (env.agent_role !== opts.leaderRole) return;
    const text = String(env.payload.text ?? "");
    if (opts.json) {
      const seq = Number(env.payload.seq ?? 0);
      process.stdout.write(JSON.stringify({ chunk: text, seq }) + "\n");
    } else {
      process.stdout.write(text);
    }
  });

  // Idle gate.
  const state = new Map<string, "busy" | "idle">();
  for (const b of handle.bodies()) state.set(b.agent_key, "idle");

  let resolveGate!: () => void;
  let rejectGate!: (err: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    resolveGate = resolve;
    rejectGate = reject;
  });
  const timer =
    opts.timeout > 0
      ? setTimeout(() => rejectGate(new Error("timeout")), opts.timeout * 1000)
      : undefined;

  const seenBusy = new Set<string>();

  function evaluate(): void {
    if ([...state.values()].every((v) => v === "idle")) {
      if (seenBusy.size === state.size) {
        if (timer !== undefined) clearTimeout(timer);
        resolveGate();
      }
    }
  }
  handle.bus.subscribe("agent.turn.start", (_subj, payload) => {
    const env = payload as AgentEvent;
    if (state.has(env.agent_key)) {
      state.set(env.agent_key, "busy");
      seenBusy.add(env.agent_key);
    }
  });
  handle.bus.subscribe("agent.idle", (_subj, payload) => {
    const env = payload as AgentEvent;
    if (state.has(env.agent_key)) {
      state.set(env.agent_key, "idle");
      evaluate();
    }
  });

  // Publish the prompt envelope.
  const envelope: AgentEvent = {
    version: 1,
    team_id: opts.teamId,
    event_type: "leader.prompt",
    agent_role: opts.leaderRole,
    agent_key: opts.leaderKey,
    timestamp: new Date().toISOString(),
    payload: { prompt: opts.instruction },
  };
  handle.bus.publish(`${opts.teamId}.leader.prompt`, envelope);

  try {
    await gate;
  } catch (e) {
    if (!opts.json) process.stdout.write("\n");
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "timeout") {
      console.error(`no response from team within ${opts.timeout}s`);
    } else {
      console.error(msg);
    }
    await handle.stop();
    storage.close();
    return 3;
  }
  if (!opts.json) process.stdout.write("\n");
  await handle.stop();
  storage.close();
  return 0;
}
