import { ulid } from "ulid";
import { getModel, type Model } from "@earendil-works/pi-ai";
import type { Storage } from "./storage/storage.ts";
import type { ArtifactStore } from "./storage/artifact-store.ts";
import {
  SqliteArtifactStore,
  SqliteMemoryManager,
} from "./storage/index.ts";
import type { MemoryManager } from "./storage/memory-store.ts";
import type { EventBus } from "./core/event-bus.ts";
import { InProcessEventBus } from "./core/in-process-event-bus.ts";
import { AgentBody } from "./core/agent-body.ts";
import type { AgentEvent } from "./core/agent-event.ts";
import {
  loadMinimalTeam,
  loadTeamFromDir,
  parseTeamFromManifests,
  type AgentSoul,
  type TeamBlueprint,
} from "./team/index.ts";
import { globalSettingsPath, projectSettingsPath, projectTeamsDir } from "./config/paths.ts";
import { loadMergedSettings, loadAuthJson, type MergedSettings, type AuthJson } from "./config/index.ts";
import type { ToolRegistry } from "./tools/tool-registry.ts";
import { InMemoryToolRegistry } from "./tools/tool-registry.ts";
import type { McpServerConfig } from "./config/index.ts";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface StartJieOptions {
  workspace: string;
  settings: MergedSettings;
  storage: Storage;
  teamId: string | "minimal";
  mcpServers?: McpServerConfig[];
  resumeSessionId?: string;
  continueLastSession?: boolean;
  /** Optional override for the registry. Defaults to an empty
   *  `InMemoryToolRegistry` (callers can pre-register tools). The
   *  CLI's `jie` binary registers the built-ins before calling
   *  `startJie`. */
  toolRegistry?: ToolRegistry;
  /** Optional override for the team lookup; defaults to
   *  `loadTeamFromDir` for non-minimal team ids. */
  loadTeamBlueprint?: (teamId: string) => TeamBlueprint;
  /** Optional override for `getModel`. Used by tests; production
   *  uses pi-ai's `getModel`. */
  resolveModel?: (provider: string, modelId: string) => Model<any>;
  /** Optional override for `getApiKey`. Used by tests; production
   *  reads from `~/.jie/auth.json`. */
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
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

function defaultResolveModel(provider: string, modelId: string): Model<any> {
  return getModel(
    provider as Parameters<typeof getModel>[0],
    modelId as Parameters<typeof getModel>[1],
  ) as unknown as Model<any>;
}

function defaultLoadTeamBlueprint(teamId: string): TeamBlueprint {
  const teamDir = join(projectTeamsDir(teamId) ?? "", "");
  if (existsSync(teamDir)) {
    return loadTeamFromDir(teamDir);
  }
  throw new Error(`team '${teamId}' not found`);
}

function _defaultGetApiKey(
  _auth: AuthJson,
): (provider: string) => string | undefined {
  return (_provider: string) => {
    return undefined;
  };
}
void _defaultGetApiKey;

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
  const toolRegistry = opts.toolRegistry ?? new InMemoryToolRegistry();
  const resolveModel = opts.resolveModel ?? defaultResolveModel;
  const loadTeamBlueprint = opts.loadTeamBlueprint ?? defaultLoadTeamBlueprint;
  const getApiKey = opts.getApiKey ?? (async (_provider: string) => undefined);
  const artifacts: ArtifactStore = new SqliteArtifactStore(opts.storage);
  const memory: MemoryManager = new SqliteMemoryManager(opts.storage);
  const bus: EventBus = new InProcessEventBus();

  // Step 1: resolve the team blueprint.
  const blueprint: TeamBlueprint =
    opts.teamId === "minimal" ? loadMinimalTeam() : loadTeamBlueprint(opts.teamId);

  // Step 2: model pre-check (every soul must resolve).
  const resolvedModels = new Map<string, Model<any>>();
  for (const soul of blueprint.roles) {
    const model = resolveSoulModel(soul, opts.settings, resolveModel);
    resolvedModels.set(soul.role, model);
  }

  // Step 3: session id resolution for the startup team.
  const sessionIds = new Map<string, string>();
  for (const teamId of [opts.teamId]) {
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
  const loadedTeams = new Map<string, { blueprint: TeamBlueprint; bodies: AgentBody[] }>();

  async function buildAndStart(teamId: string): Promise<AgentBody[]> {
    const bp: TeamBlueprint =
      teamId === "minimal" ? loadMinimalTeam() : loadTeamBlueprint(teamId);

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
  await buildAndStart(opts.teamId);

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

function publishTeamLoaded(bus: EventBus, teamId: string, bp: TeamBlueprint): void {
  const sorted = [...bp.roles].sort((a, b) => a.role.localeCompare(b.role));
  const agents = sorted.map((r) => ({ role: r.role, agent_key: `${r.role}-1` }));
  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: `${teamId}.team.loaded`,
    agent_role: sorted[0]?.role ?? "",
    agent_key: sorted[0] ? `${sorted[0].role}-1` : "",
    timestamp: new Date().toISOString(),
    payload: { team_id: teamId, agents },
  };
  bus.publish(`${teamId}.team.loaded`, envelope);
}

// Re-export common types and helpers for the CLI to use.
export { loadAuthJson, loadMergedSettings };
export { globalSettingsPath, projectSettingsPath, projectTeamsDir };
export type { MergedSettings, AuthJson, McpServerConfig, TeamBlueprint, AgentSoul };
export { parseTeamFromManifests, loadTeamFromDir, loadMinimalTeam };
