import { ulid } from "ulid";
import { type Api, type Model } from "@earendil-works/pi-ai";
import { type AgentBody, createAgentBody } from "./core";
import { type EventManager, Events } from "./event";
import { type AgentSoul, type Team, type TeamRegistry } from "./team";
import { type ModelRegistry, type SettingsStore } from "./config";
import { type ToolRegistry } from "./tools";
import {
  type ArtifactStore,
  type MemoryManager,
  type Storage,
} from "./storage";
import { JiePlatformError } from "./types";

export interface CreateJiePlatformOptions {
  workspace: string;
  homeJieDir: string;
  teamId?: string;
  resumeSessionId?: string;
  continueLastSession?: boolean;
}

export interface JiePlatformDeps {
  eventManager: EventManager;
  settingsStore: SettingsStore;
  storage: Storage;
  teamRegistry: TeamRegistry;
  modelRegistry: ModelRegistry;
  toolRegistry: ToolRegistry;
  artifactStore: ArtifactStore;
  memoryManager: MemoryManager;
}

export interface JiePlatform {
  events: EventManager;
  team: { id: string; agents: Array<{ role: string; agentKey: string; isLeader: boolean }> };
  stop: () => Promise<void>;
}

export async function createJiePlatform(options: CreateJiePlatformOptions, dependencies: JiePlatformDeps): Promise<JiePlatform> {
  const resolveModel = defaultResolveModel(dependencies.modelRegistry);
  const resolvedTeamId = options.teamId ?? "minimal";

  const sessionIds = new Map<string, string>();
  const loadedTeams = new Map<string, AgentBody[]>();
  const teamRosters = new Map<string, JiePlatform["team"]["agents"]>();

  async function loadAndStartTeam(teamId: string): Promise<AgentBody[]> {
    const existing = loadedTeams.get(teamId);
    if (existing !== undefined) return existing;

    const blueprint: Team = dependencies.teamRegistry.loadTeam(teamId);
    const sessionId = resolveSessionId(dependencies.memoryManager, options, teamId);
    sessionIds.set(teamId, sessionId);

    const out: AgentBody[] = [];
    const roster: JiePlatform["team"]["agents"] = [];
    for (const soul of blueprint.roles) {
      const isLeader = soul.role === blueprint.leaderRole;
      const agentKey = `${soul.role}-1`;
      const resolvedModel = resolveSoulModel(soul, dependencies.settingsStore, resolveModel);
      if (resolvedModel === undefined) {
        throw new JiePlatformError("NO_MODEL_ERROR");
      }
      out.push(
        createAgentBody({
          agentKey,
          teamId,
          soul,
          isLeader,
          eventManager: dependencies.eventManager,
          artifactStore: dependencies.artifactStore,
          memory: dependencies.memoryManager,
          sessionId,
          toolRegistry: dependencies.toolRegistry,
          getApiKey: async (provider: string) => dependencies.modelRegistry.getApiKey(provider),
          model: resolvedModel,
        }),
      );
      roster.push({ role: soul.role, agentKey, isLeader });
    }
    for (const body of out) {
      await body.start();
    }
    loadedTeams.set(teamId, out);
    teamRosters.set(teamId, roster);
    publishTeamLoaded(dependencies.eventManager, teamId, blueprint);
    return out;
  }

  await loadAndStartTeam(resolvedTeamId);

  const handle: JiePlatform = {
    events: dependencies.eventManager,
    team: {
      id: resolvedTeamId,
      agents: teamRosters.get(resolvedTeamId) ?? [],
    },
    stop: async () => {
      const allBodies: AgentBody[] = [];
      for (const bodies of loadedTeams.values()) {
        allBodies.push(...bodies);
      }
      for (const b of allBodies) b.stop();
    },
  };

  return handle;
}

function publishTeamLoaded(events: EventManager, teamId: string, blueprint: Team): void {
  const sorted = [...blueprint.roles].sort((a, b) => a.role.localeCompare(b.role));
  const agents = sorted.map((r) => ({
    role: r.role,
    agent_key: `${r.role}-1`,
    is_leader: r.role === blueprint.leaderRole,
  }));
  events.publish(Events.teamLoaded({ kind: "system" }, teamId, agents));
}

function defaultResolveModel(registry: ModelRegistry): (provider: string, modelId: string) => Model<Api> {
  return (provider: string, modelId: string): Model<Api> => {
    const resolved = registry.resolve(provider, modelId);
    if (resolved === undefined) {
      throw new JiePlatformError("NO_MODEL_ERROR");
    }
    return resolved;
  };
}

function resolveSoulModel(
  soul: AgentSoul,
  settingsStore: SettingsStore,
  resolveModel: (provider: string, modelId: string) => Model<Api>,
): Model<Api> | undefined {

  const settings = settingsStore.load();
  const modelStr = soul.model !== "" ? soul.model : (
    settings.defaultProvider !== undefined && settings.defaultModel !== undefined
      ? `${settings.defaultProvider}/${settings.defaultModel}`
      : ""
  );
  if (modelStr === "") return undefined;
  const slash = modelStr.indexOf("/");
  if (slash === -1) {
    throw new JiePlatformError("INVALID_MODEL_STRING", {
      detail: `invalid model string: ${modelStr}`,
    });
  }
  const provider = modelStr.slice(0, slash);
  const modelId = modelStr.slice(slash + 1);
  return resolveModel(provider, modelId);
}

function resolveSessionId(
  memory: MemoryManager,
  options: CreateJiePlatformOptions,
  teamId: string,
): string {
  if (options.resumeSessionId !== undefined) {
    if (!memory.hasSession(teamId, options.resumeSessionId)) {
      throw new JiePlatformError("UNKNOWN_SESSION", {
        detail: `unknown session_id: ${options.resumeSessionId}`,
      });
    }
    return options.resumeSessionId;
  }
  if (options.continueLastSession === true) {
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
