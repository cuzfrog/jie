import { ulid } from "ulid";
import type { Api, Model } from "@earendil-works/pi-ai";
import { type AgentBody, createAgentBody } from "../core";
import { type EventManager, Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import { type ArtifactStore, type MemoryManager } from "../storage";
import { type Settings, type SettingsStore } from "../config";
import { type ModelRegistry } from "../config";
import { type ToolRegistry } from "../tools";
import { type AgentSoul, type TeamBlueprint, type TeamBlueprintLocation, BUILTIN_MINIMAL_TEAM_ID } from "./types";
import { type TeamRegistry, createTeamRegistry } from "./registry";
import type { AgentIdentity, TeamIdentity } from "../types";

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
  /** Only resolve a loaded team */
  resolve(teamId?: string): Promise<TeamIdentity>;
  /** Load and start agents */
  loadAll(): Promise<ReadonlyMap<string, TeamIdentity>>;
  listInstalled(): string[];
  listLoaded(): ReadonlyMap<string, TeamIdentity>;
  locate(teamId: string): TeamBlueprintLocation;
  agents(teamId: string): ReadonlyArray<AgentIdentity>;
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

  async function resolveImpl(teamId?: string): Promise<TeamIdentity> {
    const requested = resolveRequestedTeam(settingsStore.load(), teamId);
    const existing = loadedTeams.get(requested);
    if (existing !== undefined) {
      return toTeamIdentity(requested, existing);
    }
    throw new JiePlatformError("NO_TEAM", {
      detail: `requested team '${requested}' is not loaded`,
    });
  }

  async function loadImpl(id: string): Promise<TeamIdentity> {
    const existing = loadedTeams.get(id);
    if (existing !== undefined) {
      return toTeamIdentity(id, existing);
    }
    const blueprint: TeamBlueprint = teamRegistry.parseTeamManifest(id);
    const sessionId = resolveSessionId(id);
    sessionIds.set(id, sessionId);
    const bodies: AgentBody[] = [];
    for (const soul of blueprint.roles) {
      const resolvedModel = resolveSoulModel(soul);
      if (resolvedModel === undefined) continue;
      const body = createAgentBody({
        agentKey: `${soul.role}-1`, // TODO: multiple agents per role
        teamId: id,
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
    loadedTeams.set(id, bodies);
    publishTeamLoaded(id, blueprint);
    return toTeamIdentity(id, bodies);
  }

  async function loadAll(): Promise<ReadonlyMap<string, TeamIdentity>> {
    const teams = new Map<string, TeamIdentity>();
    for (const id of teamRegistry.listInstalled()) {
      try {
        const team = await loadImpl(id);
        teams.set(team.id, team);
      } catch (error) {
        if (error instanceof JiePlatformError && error.code === "UNKNOWN_SESSION") throw error;
        const message = error instanceof Error ? error.message : String(error);
        eventManager.publish(Events.systemError({ kind: "system" }, `team '${id}' failed to load: ${message}`));
        continue;
      }
    }
    return teams;
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

  function listLoaded(): ReadonlyMap<string, TeamIdentity> {
    const result = new Map<string, TeamIdentity>();
    for (const [id, bodies] of loadedTeams) {
      result.set(id, toTeamIdentity(id, bodies));
    }
    return result;
  }

  function stop(): void {
    for (const bodies of loadedTeams.values()) {
      for (const b of bodies) b.stop();
    }
  }

  return {
    resolve: (teamId?: string) => Promise.resolve().then(() => resolveImpl(teamId)),
    loadAll,
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

function resolveRequestedTeam(settings: Settings | undefined, teamId?: string): string {
  return teamId ?? settings?.defaultTeam ?? BUILTIN_MINIMAL_TEAM_ID;
}

function toTeamIdentity(id: string, bodies: AgentBody[]): TeamIdentity {
  const identities = bodies.map((b) => b.identity);
  const leader = identities.find((a) => a.isLeader);
  if (leader === undefined) {
    throw new JiePlatformError("NO_LEADER", {
      detail: `team '${id}' has no agent marked as leader`,
    });
  }
  return { id, leaderKey: leader.agentKey, agents: identities };
}