import { ulid } from "ulid";
import { getModel as piGetModel, type Model } from "@earendil-works/pi-ai";
import { type AgentBody, type AgentEvent, type EventBus, createAgentBody } from "./core/index.ts";
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

export interface CreateJiePlatformOptions {
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

export async function createJiePlatform(opts: CreateJiePlatformOptions, deps: JiePlatformDeps): Promise<JiePlatform> {
  const resolveModel = defaultResolveModel(deps.modelRegistry);
  const artifactStore: ArtifactStore = createArtifactStore(deps.storage);
  const bus: EventBus = deps.bus;

  const resolvedTeamId = opts.teamId ?? "minimal";

  const sessionIds = new Map<string, string>();
  const loadedTeams = new Map<string, AgentBody[]>();

  async function loadAndStartTeam(teamId: string): Promise<AgentBody[]> {
    const existing = loadedTeams.get(teamId);
    if (existing !== undefined) return existing;

    const bp: Team = deps.teamRegistry.loadTeam(teamId);
    const sessionId = resolveSessionId(deps.memoryManager, opts, teamId);
    sessionIds.set(teamId, sessionId);

    const out: AgentBody[] = [];
    for (const soul of bp.roles) {
      const isLeader = soul.role === bp.leaderRole;
      const agentKey = `${soul.role}-1`;
      const model = resolveSoulModel(soul, deps.settingsStore, resolveModel);
      out.push(
        createAgentBody({
          agentKey,
          teamId,
          soul,
          isLeader,
          bus,
          artifactStore,
          memory: deps.memoryManager,
          sessionId,
          tool_registry: deps.toolRegistry,
          getApiKey: async (provider: string) => deps.modelRegistry.getApiKey(provider),
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

  await loadAndStartTeam(resolvedTeamId);

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

function resolveSessionId(
  memory: MemoryManager,
  opts: CreateJiePlatformOptions,
  teamId: string,
): string {
  if (opts.resumeSessionId !== undefined) {
    if (!memory.hasSession(teamId, opts.resumeSessionId)) {
      throw new Error(`unknown session_id: ${opts.resumeSessionId}`);
    }
    return opts.resumeSessionId;
  }
  if (opts.continueLastSession === true) {
    const recent = memory.mostRecentSessionId(teamId);
    if (recent === null) {
      console.warn(
        "no prior session in this directory; starting a new session",
      );
      return ulid();
    }
    return recent;
  }
  return ulid();
}
