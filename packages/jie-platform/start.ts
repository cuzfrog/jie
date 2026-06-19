import { ulid } from "ulid";
import { getModel as piGetModel, type Model } from "@earendil-works/pi-ai";
import { dirname } from "node:path";
import { AgentBody, type AgentEvent, createEventBus, type EventBus } from "./core/index.ts";
import { createTeamRegistry, type AgentSoul, type Team } from "./team/index.ts";
import { ModelRegistry, type MergedSettings } from "./config/index.ts";
import { createToolRegistry, type ToolRegistry } from "./tools";
import type { McpServerConfig } from "./config/index.ts";
import {
  createArtifactStore,
  createMemoryManager,
  createStorage,
  type ArtifactStore,
  type MemoryManager,
} from "./storage";

export interface StartJieOptions {
  workspace: string;
  /** The user's home jie dir (e.g. `~/.jie/`). */
  homeJieDir: string;
  settings: MergedSettings;
  /** The team id to load. When `undefined`, the registry falls
   *  back to the built-in minimal team. External modules do not
   *  need to know about the minimal team — they can pass
   *  `undefined` and the platform handles the fallback. */
  teamId?: string;
  /** Override the SQLite file path used for the platform's storage.
   *  Defaults to `{workspace}/.jie/storage.db`. Tests can pass
   *  `":memory:"` for an in-process, in-memory database. The storage
   *  is auto-collected when the platform handle is released — there
   *  is no `close()` to call. */
  storageFilePath?: string;
  /** Forward-looking stub: the MCP client will consume this once it
   *  lands. The platform does not load `mcp.json` in v1. */
  mcpServerConfigs?: McpServerConfig[];
  resumeSessionId?: string;
  continueLastSession?: boolean;
}

export interface JieHandle {
  bus: EventBus;
  artifacts: ArtifactStore;
  bodies: () => AgentBody[];
  bodiesFor: (teamId: string) => AgentBody[];
  rolesFor: (teamId: string) => string[];
  loadTeam: (teamId: string) => Promise<void>;
  stop: (timeoutMs?: number) => Promise<void>;
}

const NO_MODEL_ERROR =
  "No model has been selected, please login and select a default model.";

function defaultResolveModel(registry: ModelRegistry): (provider: string, modelId: string) => Model<any> {
  return (provider: string, modelId: string): Model<any> => {
    const fromRegistry = registry.resolve(provider, modelId);
    if (fromRegistry !== undefined) return fromRegistry;
    return piGetModel(
      provider as Parameters<typeof piGetModel>[0],
      modelId as Parameters<typeof piGetModel>[1],
    ) as unknown as Model<any>;
  };
}

function resolveSoulModel(
  soul: AgentSoul,
  settings: MergedSettings,
  resolveModel: (provider: string, modelId: string) => Model<any>,
): Model<any> {
  const modelStr = soul.model !== "" ? soul.model : (
    settings.defaultProvider !== undefined && settings.defaultModel !== undefined
      ? `${settings.defaultProvider}/${settings.defaultModel}`
      : ""
  );
  if (modelStr === "") {
    throw new Error(NO_MODEL_ERROR);
  }
  const slash = modelStr.indexOf("/");
  if (slash === -1) {
    throw new Error(`invalid model string: ${modelStr}`);
  }
  const provider = modelStr.slice(0, slash);
  const modelId = modelStr.slice(slash + 1);
  try {
    return resolveModel(provider, modelId);
  } catch (e) {
    throw new Error(NO_MODEL_ERROR);
  }
}

export async function startJie(opts: StartJieOptions): Promise<JieHandle> {
  const toolRegistry: ToolRegistry = createToolRegistry();
  // The CLI supplies `homeJieDir` as `join(resolveHomeDir(), ".jie")`,
  // so `dirname` recovers the user's actual HOME. The model
  // registry needs HOME for `<homeDir>/.jie/models.json`. The
  // platform never reads `process.env.HOME` itself — HOME
  // resolution is owned by the CLI.
  const homeDir = dirname(opts.homeJieDir);
  const registry = ModelRegistry.load(opts.workspace, { homeDir });
  const resolveModel = defaultResolveModel(registry);
  // The team registry is constructed here from the workspace +
  // homeJieDir; there is no override path. Tests that need to
  // exercise a specific team should write the team to a real
  // temp directory and pass its path as `workspace`.
  const teamRegistry = createTeamRegistry({
    workspace: opts.workspace,
    homeJieDir: opts.homeJieDir,
  });
  const getApiKey = async (provider: string): Promise<string | undefined> =>
    registry.getApiKey(provider);
  // The platform owns the storage. The default file path is
  // `{workspace}/.jie/storage.db`; tests can pass `:memory:` via
  // `storageFilePath`. The storage has no `close()` — the
  // underlying SQLite database is auto-collected when the last
  // reference goes out of scope.
  const storage = createStorage({
    type: "sqlite",
    filePath: opts.storageFilePath ?? `${opts.workspace}/.jie/storage.db`,
  });
  const artifacts: ArtifactStore = createArtifactStore(storage);
  const memory: MemoryManager = createMemoryManager(storage);
  const bus: EventBus = createEventBus();

  // Step 1: resolve the team blueprint. The registry's
  // `loadTeam(undefined)` falls back to the built-in minimal team.
  const resolvedTeamId = opts.teamId ?? "minimal";
  const blueprint: Team = teamRegistry.loadTeam(resolvedTeamId);

  // Step 2: model pre-check (every soul must resolve).
  const resolvedModels = new Map<string, Model<any>>();
  for (const soul of blueprint.roles) {
    const model = resolveSoulModel(soul, opts.settings, resolveModel);
    resolvedModels.set(soul.role, model);
  }

  // Step 3: session id resolution for the startup team.
  const sessionIds = new Map<string, string>();
  for (const teamId of [resolvedTeamId]) {
    let resolved: string;
    if (opts.resumeSessionId !== undefined) {
      if (!memory.hasSession(teamId, opts.resumeSessionId)) {
        throw new Error(`unknown session_id: ${opts.resumeSessionId}`);
      }
      resolved = opts.resumeSessionId;
    } else if (opts.continueLastSession === true) {
      const recent = memory.mostRecentSessionId(teamId);
      if (recent === null) {
        console.warn(
          "no prior session in this directory; starting a new session",
        );
        resolved = ulid();
      } else {
        resolved = recent;
      }
    } else {
      resolved = ulid();
    }
    sessionIds.set(teamId, resolved);
  }

  // Step 4: build bodies for the startup team.
  const loadedTeams = new Map<string, { blueprint: Team; bodies: AgentBody[] }>();

  async function buildAndStart(teamId: string): Promise<AgentBody[]> {
    const bp: Team = teamRegistry.loadTeam(teamId);

    // If already loaded, return existing bodies (idempotent).
    const existing = loadedTeams.get(teamId);
    if (existing !== undefined) return existing.bodies;

    // For session-id resolution on a swap-loaded team, reuse the
    // recorded value if any; else mint a fresh one.
    let sid = sessionIds.get(teamId);
    if (sid === undefined) {
      if (opts.resumeSessionId !== undefined) {
        if (!memory.hasSession(teamId, opts.resumeSessionId)) {
          throw new Error(`unknown session_id: ${opts.resumeSessionId}`);
        }
        sid = opts.resumeSessionId;
      } else if (opts.continueLastSession === true) {
        const recent = memory.mostRecentSessionId(teamId);
        if (recent === null) {
          console.warn(
            "no prior session in this directory; starting a new session",
          );
          sid = ulid();
        } else {
          sid = recent;
        }
      } else {
        sid = ulid();
      }
      sessionIds.set(teamId, sid);
    }

    const out: AgentBody[] = [];
    for (const soul of bp.roles) {
      const is_leader = soul.role === bp.leaderRole;
      const agent_key = `${soul.role}-1`;
      const model = resolveSoulModel(soul, opts.settings, resolveModel);
      out.push(
        new AgentBody({
          agent_key,
          team_id: teamId,
          soul,
          is_leader,
          bus,
          artifacts,
          memory,
          session_id: sid,
          tool_registry: toolRegistry,
          getApiKey: async (provider: string) => getApiKey(provider),
          model,
        }),
      );
    }
    for (const body of out) {
      await body.start();
    }
    loadedTeams.set(teamId, { blueprint: bp, bodies: out });
    publishTeamLoaded(bus, teamId, bp);
    return out;
  }

  // Build and start the startup team.
  await buildAndStart(resolvedTeamId);

  // The handle is the externally visible lifecycle object.
  const handle: JieHandle = {
    bus,
    artifacts,
    bodies: () => {
      const all: AgentBody[] = [];
      for (const { bodies } of loadedTeams.values()) {
        all.push(...bodies);
      }
      return all;
    },
    bodiesFor: (teamId: string) => {
      const entry = loadedTeams.get(teamId);
      return entry === undefined ? [] : entry.bodies;
    },
    rolesFor: (teamId: string) => {
      const entry = loadedTeams.get(teamId);
      if (entry === undefined) return [];
      return entry.blueprint.roles.map((r) => r.role);
    },
    loadTeam: async (teamId: string) => {
      await buildAndStart(teamId);
    },
    stop: async (timeoutMs: number = 10_000) => {
      const allBodies: AgentBody[] = [];
      for (const { bodies } of loadedTeams.values()) {
        allBodies.push(...bodies);
      }
      for (const b of allBodies) b.stop();
      // Real abort/wait integration is a Day 2 concern (per the
      // deployment spec); v1's `stop` is a synchronous detach of
      // bus subscriptions. The CLI does not rely on the timeout.
      void timeoutMs;
    },
  };

  return handle;
}

function publishTeamLoaded(bus: EventBus, teamId: string, bp: Team): void {
  const sorted = [...bp.roles].sort((a, b) => a.role.localeCompare(b.role));
  const agents = sorted.map((r) => ({ role: r.role, agent_key: `${r.role}-1` }));
  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: `${teamId}.team.loaded`,
    timestamp: new Date().toISOString(),
    payload: { team_id: teamId, agents },
  };
  bus.publish(`${teamId}.team.loaded`, envelope);
}


