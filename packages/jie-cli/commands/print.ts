/** `jie -p` (print mode) — the full agentic pipeline against a real LLM.
 *
 *  Pipeline:
 *    1. (Optional) `--api-key` writes `auth.json` for the
 *       resolved `defaultProvider`.
 *    2. Load merged settings, recover from a stale `defaultTeam`.
 *    3. Compute the storage file path under `{project}/.jie/`.
 *    4. Hand off to `startJie` (which constructs the
 *       `TeamRegistry` and storage internally from `workspace`
 *       + `homeJieDir` + `storageFilePath`, and loads the team).
 *       If the team is not found, `startJie` throws and we
 *       surface the error.
 *    5. Pick the leader body, publish the prompt envelope, and
 *       filter the `agent.stream.chunk` bus for the leader's
 *       text. Open the idle gate; exit when all bodies are idle
 *       and the timeout (if any) has not elapsed.
 *
 *  The `PrintDeps` type carries the runtime stores. Real `main`
 *  constructs the stores from `process.env.HOME`. Team loading
 *  and LLM resolution are not mockable from here — tests that
 *  need a specific team write the team to a real temp directory;
 *  tests that need a specific LLM endpoint set up
 *  `.jie/models.json` + `auth.json` on disk.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  findProjectJieRoot,
  resolveStaleDefaultTeam,
  startJie,
  type AgentEvent,
  type JieHandle,
  type MergedSettings,
} from "@cuzfrog/jie-platform";
import type { AuthStore, SettingsStore } from "@cuzfrog/jie-platform/config";
import type { ParsedCli } from "../index.ts";

export type PrintArgs = Extract<ParsedCli, { kind: "print" }>;

export interface PrintDeps {
  authStore: AuthStore;
  settingsStore: SettingsStore;
  /** The user's HOME directory. `runPrint` derives
   *  `<homeDir>/.jie` (the `homeJieDir`) and passes that to
   *  `startJie`. */
  homeDir: string;
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

  // Discover settings.
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

  // The chosen teamId. When the user has not set `--team` and
  // `settings.defaultTeam` is unset, leave `teamId` undefined so
  // the platform's `startJie` falls back to the built-in minimal
  // team via the registry's `loadTeam(undefined)`.
  const teamId: string | undefined = parsed.team ?? settings.defaultTeam;

  // Hand off to the platform. `startJie` constructs the team
  // registry and the SQLite storage internally from `workspace`
  // + `homeJieDir` + `storageFilePath`, and resolves `getApiKey`
  // from the merged `ModelRegistry` + `~/.jie/auth.json`. If the
  // team is not installed, `startJie` throws and we surface the
  // error. When `teamId` is `undefined`, the platform falls back
  // to the built-in minimal team.
  let handle: JieHandle;
  try {
    handle = await startJie({
      workspace: cwd,
      homeJieDir: join(deps.homeDir, ".jie"),
      settings,
      storageFilePath: projectStoragePath(cwd),
      teamId,
      resumeSessionId: parsed.resume,
      continueLastSession: parsed.continueLast,
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }

  if (handle.bodies().length === 0) {
    console.error(`team has no agents to run; check the team manifest`);
    await handle.stop();
    return 1;
  }

  // Resolve leader. The handle flags the leader body with
  // `is_leader: true` (per `start.ts`: `soul.role === bp.leaderRole`),
  // so we look it up from the loaded bodies rather than guessing
  // from the alphabetically-sorted role list.
  const resolvedTeamId = handle.bodies()[0]!.team_id;
  const leader = handle.bodiesFor(resolvedTeamId).find((b) => b.is_leader);
  if (leader === undefined) {
    console.error(`team has no leader; check TEAM.md's 'leader:' field`);
    await handle.stop();
    return 1;
  }
  const leaderRole = leader.soul.role;
  const leaderKey = leader.agent_key;

  // Set up stream filtering + idle gate.
  return runGate(handle, {
    teamId: resolvedTeamId,
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
    return 3;
  }
  if (!opts.json) process.stdout.write("\n");
  await handle.stop();
  return 0;
}
