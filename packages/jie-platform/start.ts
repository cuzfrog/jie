import { ulid } from "ulid";
import { getModel as piGetModel, type Model } from "@earendil-works/pi-ai";
import { AgentBody, type AgentEvent, type EventBus } from "./core/index.ts";
import { type AgentSoul, type Team, type TeamRegistry } from "./team/index.ts";
import { type ModelRegistry, type SettingsStore } from "./config/index.ts";
import { type ToolRegistry } from "./tools";
import type { McpServerConfig } from "./config/index.ts";
import {
  createArtifactStore,
  type ArtifactStore,
  type MemoryManager,
  type Storage,
} from "./storage";

export interface CreateJieOptions {
  workspace: string;

  homeJieDir: string;

  teamId?: string;

  mcpServerConfigs?: McpServerConfig[];
  resumeSessionId?: string;
  continueLastSession?: boolean;
}

export interface JiePlatformDeps {
  bus: EventBus;
  settingsStore: SettingsStore;
  storage: Storage;
  teamRegistry: TeamRegistry;
  modelRegistry: ModelRegistry;
  toolRegistry: ToolRegistry;
  memoryManager: MemoryManager;
}

export interface JiePlatform {
  bus: EventBus;
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
  settingsStore: SettingsStore,
  resolveModel: (provider: string, modelId: string) => Model<any>,
): Model<any> {

  const settings = settingsStore.load();
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

export async function createJiePlatform(opts: CreateJieOptions, deps: JiePlatformDeps): Promise<JiePlatform> {
  const resolveModel = defaultResolveModel(deps.modelRegistry);
  const getApiKey = async (provider: string): Promise<string | undefined> =>
    deps.modelRegistry.getApiKey(provider);
  const artifactStore: ArtifactStore = createArtifactStore(deps.storage);
  const bus: EventBus = deps.bus;

  const resolvedTeamId = opts.teamId ?? "minimal";
  const blueprint: Team = deps.teamRegistry.loadTeam(resolvedTeamId);

  for (const soul of blueprint.roles) {
    resolveSoulModel(soul, deps.settingsStore, resolveModel);
  }

  const sessionIds = new Map<string, string>();
  for (const teamId of [resolvedTeamId]) {
    let resolved: string;
    if (opts.resumeSessionId !== undefined) {
      if (!deps.memoryManager.hasSession(teamId, opts.resumeSessionId)) {
        throw new Error(`unknown session_id: ${opts.resumeSessionId}`);
      }
      resolved = opts.resumeSessionId;
    } else if (opts.continueLastSession === true) {
      const recent = deps.memoryManager.mostRecentSessionId(teamId);
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

  const loadedTeams = new Map<string, AgentBody[]>();

  async function buildAndStart(teamId: string): Promise<AgentBody[]> {
    const bp: Team = deps.teamRegistry.loadTeam(teamId);

    const existing = loadedTeams.get(teamId);
    if (existing !== undefined) return existing;

    let sid = sessionIds.get(teamId);
    if (sid === undefined) {
      if (opts.resumeSessionId !== undefined) {
        if (!deps.memoryManager.hasSession(teamId, opts.resumeSessionId)) {
          throw new Error(`unknown session_id: ${opts.resumeSessionId}`);
        }
        sid = opts.resumeSessionId;
      } else if (opts.continueLastSession === true) {
        const recent = deps.memoryManager.mostRecentSessionId(teamId);
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
      const model = resolveSoulModel(soul, deps.settingsStore, resolveModel);
      out.push(
        new AgentBody({
          agent_key,
          team_id: teamId,
          soul,
          is_leader,
          bus,
          artifacts: artifactStore,
          memory: deps.memoryManager,
          session_id: sid,
          tool_registry: deps.toolRegistry,
          getApiKey: async (provider: string) => getApiKey(provider),
          model,
        }),
      );
    }
    for (const body of out) {
      await body.start();
    }
    loadedTeams.set(teamId, out);
    publishTeamLoaded(bus, teamId, bp);
    return out;
  }

  await buildAndStart(resolvedTeamId);

  const handle: JiePlatform = {
    bus,
    stop: async (timeoutMs: number = 10_000) => {
      const allBodies: AgentBody[] = [];
      for (const bodies of loadedTeams.values()) {
        allBodies.push(...bodies);
      }
      for (const b of allBodies) b.stop();

      void timeoutMs;
    },
  };

  return handle;
}

function publishTeamLoaded(bus: EventBus, teamId: string, bp: Team): void {
  const sorted = [...bp.roles].sort((a, b) => a.role.localeCompare(b.role));
  const agents = sorted.map((r) => ({
    role: r.role,
    agent_key: `${r.role}-1`,
    is_leader: r.role === bp.leaderRole,
  }));
  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: `${teamId}.team.loaded`,
    timestamp: new Date().toISOString(),
    payload: { team_id: teamId, agents },
  };
  bus.publish(`${teamId}.team.loaded`, envelope);
}
