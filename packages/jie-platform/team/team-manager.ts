import { ulid } from "ulid";
import type { Api, Model } from "@earendil-works/pi-ai";
import { type AgentBody, type AgentIdentity, createAgentBody } from "../core";
import { type EventManager, Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import { type ArtifactStore, type MemoryManager } from "../storage";
import { type SettingsStore } from "../config";
import { type ModelRegistry } from "../config";
import { type ToolRegistry } from "../tools";
import { type AgentSoul, type TeamBlueprint, type TeamBlueprintLocation } from "./types";
import { type TeamRegistry, createTeamRegistry } from "./registry";

export interface TeamManagerOptions {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly resumeSessionId?: string;
  readonly continueLastSession?: boolean;
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
  readonly load: (teamId?: string) => Promise<ReadonlyArray<AgentIdentity>>;
  readonly listInstalled: () => string[];
  readonly locate: (teamId: string) => TeamBlueprintLocation;
  readonly agents: (teamId: string) => ReadonlyArray<AgentIdentity>;
  readonly stop: () => void;
}

export function createTeamManager(options: TeamManagerOptions, deps: TeamManagerDeps): TeamManager {
  const teamRegistry: TeamRegistry = createTeamRegistry({
    homeJieDir: options.homeJieDir,
    projectJieDir: options.projectJieDir,
  });
  const { eventManager, settingsStore, modelRegistry, toolRegistry, artifactStore, memoryManager } = deps;
  const loadedTeams = new Map<string, AgentBody[]>();
  const sessionIds = new Map<string, string>();

  async function load(teamId?: string): Promise<ReadonlyArray<AgentIdentity>> {
    const resolvedId = teamId ?? "minimal";
    const existing = loadedTeams.get(resolvedId);
    if (existing !== undefined) {
      return existing.map((b) => b.identity);
    }
    const blueprint: TeamBlueprint = teamRegistry.parseTeamManifest(resolvedId);
    const sessionId = resolveSessionId(resolvedId);
    sessionIds.set(resolvedId, sessionId);
    const bodies: AgentBody[] = [];
    for (const soul of blueprint.roles) {
      const isLeader = soul.role === blueprint.leaderRole;
      const agentKey = `${soul.role}-1`;
      const resolvedModel = resolveSoulModel(soul);
      if (resolvedModel === undefined) continue;
      const body = createAgentBody({
        agentKey,
        teamId: resolvedId,
        soul,
        isLeader,
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
    loadedTeams.set(resolvedId, bodies);
    publishTeamLoaded(resolvedId, blueprint);
    return bodies.map((b) => b.identity);
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
    if (options.continueLastSession === true) {
      const recent = memoryManager.mostRecentSessionId(teamId);
      if (recent === null) {
        console.warn("no prior session in this directory; starting a new session");
        return ulid();
      }
      return recent;
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

  function publishTeamLoaded(teamId: string, blueprint: TeamBlueprint): void {
    const sorted = [...blueprint.roles].sort((a, b) => a.role.localeCompare(b.role));
    const agents = sorted.map((r) => ({
      role: r.role,
      agent_key: `${r.role}-1`,
      is_leader: r.role === blueprint.leaderRole,
    }));
    eventManager.publish(Events.teamLoaded({ kind: "system" }, teamId, agents));
  }

  function agents(teamId: string): ReadonlyArray<AgentIdentity> {
    return (loadedTeams.get(teamId) ?? []).map((b) => b.identity);
  }

  function stop(): void {
    for (const bodies of loadedTeams.values()) {
      for (const b of bodies) b.stop();
    }
  }

  return {
    load,
    listInstalled() {
      return teamRegistry.listInstalled();
    },
    locate(id) {
      return teamRegistry.locate(id);
    },
    agents,
    stop,
  };
}