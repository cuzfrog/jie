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
 *       text. Open the idle gate; exit when the gate opens or
 *       the timeout fires. The gate is a single `busy` counter
 *       on `agent.turn.start` / `agent.idle` — see `setupIdleGate`.
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
  startJie,
  type AgentEvent,
  type JieHandle,
  type MergedSettings,
} from "@cuzfrog/jie-platform";
import type { EventBus } from "@cuzfrog/jie-platform/core";
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
  args: PrintArgs,
  cwd: string,
  deps: PrintDeps,
): Promise<number> {
  // --api-key first (writes auth.json before the rest of the flow runs).
  if (args.apiKey !== undefined) {
    const provider = deps.settingsStore.load(cwd).defaultProvider;
    if (provider === undefined) {
      console.error(
        "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
      );
      return 1;
    }
    deps.authStore.write(
      deps.authStore.setProvider(deps.authStore.load(), provider, args.apiKey),
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
  const recovered = deps.settingsStore.resolveDefaultTeam(settings, cwd);
  if (recovered !== null) {
    settings.defaultTeam = recovered;
  }

  // The chosen teamId. When the user has not set `--team` and
  // `settings.defaultTeam` is unset, leave `teamId` undefined so
  // the platform's `startJie` falls back to the built-in minimal
  // team via the registry's `loadTeam(undefined)`.
  const teamId: string | undefined = args.team ?? settings.defaultTeam;

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
      resumeSessionId: args.resume,
      continueLastSession: args.continueLast,
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
    instruction: args.instruction,
    timeout: args.timeout,
    json: args.json,
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
    const agentEvent = payload as AgentEvent;
    if (agentEvent.team_id !== opts.teamId) return;
    if (agentEvent.agent_role !== opts.leaderRole) return;
    const text = String(agentEvent.payload.text ?? "");
    if (opts.json) {
      const seq = Number(agentEvent.payload.seq ?? 0);
      process.stdout.write(JSON.stringify({ chunk: text, seq }) + "\n");
    } else {
      process.stdout.write(text);
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
    await setupIdleGate(handle.bus, opts.timeout);
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

/** The CLI's idle gate for `-p` mode.
 *
 *  Resolves when the bus has observed as many `agent.idle` events
 *  as `agent.turn.start` events (the `busy` counter returns to 0).
 *  Rejects with `Error("timeout")` if `timeoutSec` > 0 and the gate
 *  has not opened in that wall-clock window.
 *
 *  The counter is correct because the Event-Order Contract
 *  (`doc/specs/jie-platform/03-event-system.md` "Event-Order
 *  Contract", and `doc/addrs/22-event-order-contract.md`)
 *  guarantees that whenever work is in flight, the bus sees a
 *  matching `turn_start` before the corresponding `idle`. A
 *  notifying body (e.g. the leader calling `notify`) starts the
 *  recipient's turn synchronously inside the notify call — the
 *  recipient's `turn_start` is published before the notifier's
 *  `notify` tool returns, so before the notifier's `idle`. The
 *  counter is therefore always ≥ 1 while work is in flight, and
 *  returns to 0 only when all in-flight turns have ended.
 *
 *  The gate's `resolve` is only called from inside the
 *  `agent.idle` handler, so if no body ever responds the gate
 *  stays pending and the timeout fires.
 */
function setupIdleGate(bus: EventBus, timeoutSec: number): Promise<void> {
  let busy = 0;
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer =
    timeoutSec > 0
      ? setTimeout(() => reject(new Error("timeout")), timeoutSec * 1000)
      : undefined;

  bus.subscribe("agent.turn.start", () => {
    busy++;
  });
  bus.subscribe("agent.idle", () => {
    busy--;
    if (busy === 0) {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    }
  });

  return promise;
}
