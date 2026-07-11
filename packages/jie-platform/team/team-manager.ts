import { ulid } from "ulid";
import type { Api, Model } from "@earendil-works/pi-ai";
import { type AgentBody, createAgentBody } from "../core";
import { type EventManager, Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import { type ArtifactStore, type MemoryManager } from "../storage";
import { type SettingsStore } from "../config";
import { type ModelRegistry } from "../config";
import { type ToolRegistry } from "../tools";
import { type AgentSoul, type TeamBlueprint, type TeamBlueprintLocation, BUILTIN_MINIMAL_TEAM_ID } from "./types";
import { type TeamRegistry, createTeamRegistry } from "./registry";
import type { AgentInfo, TeamInfo } from "../types";

export interface TeamManagerOptions {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly resumeSessionId?: string;
}

export interface TeamManagerDeps {
  readonly eventManager: EventManager;
  readonly settingsStore: SettingsStore;
  readonly modelRegistry: ModelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly artifactStore: ArtifactStore;
  readonly memoryManager: MemoryManager;
}

export interface TeamManager {
  load(teamId?: string): Promise<TeamInfo>;
  listInstalled(): string[];
  listLoaded(): ReadonlyMap<string, TeamInfo>;
  locate(teamId: string): TeamBlueprintLocation;
  agents(teamId: string): ReadonlyArray<AgentInfo>;
  stop(): void;
}

export function createTeamManager(options: TeamManagerOptions, deps: TeamManagerDeps): TeamManager {
  const teamRegistry: TeamRegistry = createTeamRegistry({
    homeJieDir: options.homeJieDir,
    projectJieDir: options.projectJieDir,
  });
  const { eventManager, settingsStore, modelRegistry, toolRegistry, artifactStore, memoryManager } = deps;
  const loadedTeams = new Map<string, AgentBody[]>();
  const sessionIds = new Map<string, string>();

  async function loadImpl(teamId?: string): Promise<TeamInfo> {
    const requested = resolveTeamId(teamId);
    const existing = loadedTeams.get(requested);
    if (existing !== undefined) {
      return toTeamInfo(requested, existing);
    }
    const blueprint: TeamBlueprint = teamRegistry.parseTeamManifest(requested);
    const sessionId = resolveSessionId(requested);
    sessionIds.set(requested, sessionId);
    const bodies: AgentBody[] = [];
    for (const soul of blueprint.roles) {
      const resolvedModel = resolveSoulModel(soul);
      if (resolvedModel === undefined) continue;
      const body = createAgentBody({
        agentKey: `${soul.role}-1`, // TODO: multiple agents per role
        teamId: requested,
        soul,
        isLeader: soul.role === blueprint.leaderRole,
        eventManager,
        artifactStore,
        memory: memoryManager,
        sessionId,
        toolRegistry,
        getApiKey: async (provider: string) => modelRegistry.getApiKey(provider),
        model: resolvedModel,
      });
      bodies.push(body);
    }
    for (const body of bodies) {
      await body.start();
    }
    loadedTeams.set(requested, bodies);
    publishTeamLoaded(requested, bodies);
    return toTeamInfo(requested, bodies);
  }

  function resolveTeamId(teamId?: string): string {
    if (teamId !== undefined) return teamId;
    const settings = settingsStore.load();
    if (settings.defaultTeam !== undefined && teamRegistry.locate(settings.defaultTeam) !== null) {
      return settings.defaultTeam;
    }
    return teamRegistry.listInstalled().find((id) => id !== BUILTIN_MINIMAL_TEAM_ID) ?? BUILTIN_MINIMAL_TEAM_ID;
  }

  function resolveSessionId(teamId: string): string {
    const existing = sessionIds.get(teamId);
    if (existing !== undefined) return existing;
    if (options.resumeSessionId !== undefined) {
      if (!memoryManager.hasSession(teamId, options.resumeSessionId)) {
        throw new JiePlatformError("UNKNOWN_SESSION", {
          detail: `unknown session_id: ${options.resumeSessionId}`,
        });
      }
      return options.resumeSessionId;
    }
    return ulid();
  }

  function resolveSoulModel(soul: AgentSoul): Model<Api> | undefined {
    const settings = settingsStore.load();
    const hasSettingsModel = settings.defaultProvider !== undefined && settings.defaultModel !== undefined;
    if (soul.model === "" && !hasSettingsModel) {
      throw new JiePlatformError("NO_MODEL_ERROR");
    }
    const modelStr = soul.model !== "" ? soul.model : `${settings.defaultProvider}/${settings.defaultModel}`;
    const slash = modelStr.indexOf("/");
    if (slash === -1) return undefined;
    const provider = modelStr.slice(0, slash);
    const modelId = modelStr.slice(slash + 1);
    try {
      return modelRegistry.resolve(provider, modelId);
    } catch {
      return undefined;
    }
  }

  function publishTeamLoaded(teamId: string, bodies: AgentBody[]): void {
    eventManager.publish(Events.teamLoaded({ kind: "system" }, toTeamInfo(teamId, bodies)));
  }

  function agents(teamId: string): ReadonlyArray<AgentInfo> {
    return (loadedTeams.get(teamId) ?? []).map((b) => b.identity);
  }

  function listLoaded(): ReadonlyMap<string, TeamInfo> {
    const result = new Map<string, TeamInfo>();
    for (const [id, bodies] of loadedTeams) {
      result.set(id, toTeamInfo(id, bodies));
    }
    return result;
  }

  function stop(): void {
    for (const bodies of loadedTeams.values()) {
      for (const b of bodies) b.stop();
    }
  }

  return {
    load: loadImpl,
    listInstalled() {
      return teamRegistry.listInstalled();
    },
    listLoaded,
    locate(id) {
      return teamRegistry.locate(id);
    },
    agents,
    stop,
  };
}

function toTeamInfo(id: string, bodies: AgentBody[]): TeamInfo {
  const identities = bodies.map((b) => b.identity);
  const leader = identities.find((a) => a.isLeader);
  if (leader === undefined) {
    throw new JiePlatformError("NO_LEADER", {
      detail: `team '${id}' has no agent marked as leader`,
    });
  }
  return { id, leaderKey: leader.agentKey, agents: identities };
}