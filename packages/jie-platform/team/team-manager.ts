import { ulid } from "ulid";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentBody, AgentBodyParams } from "../core";
import { type EventManager, Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import type { MemoryManager, SessionSummary } from "../storage";
import { type ModelRegistry, type SettingsStore } from "../config";
import { type AgentSoul, type TeamBlueprint, type TeamBlueprintLocation, BUILTIN_MINIMAL_TEAM_ID } from "./types";
import { type TeamRegistry, createTeamRegistry } from "./registry";
import type { AgentHistory, AgentInfo, TeamInfo } from "../types";

export interface TeamManager {
  load(teamId?: string): Promise<TeamInfo>;
  resumeSession(teamId: string, sessionId: string): Promise<TeamInfo>;
  listInstalled(): string[];
  agentCount(teamId: string): number;
  listLoaded(): ReadonlyMap<string, TeamInfo>;
  locate(teamId: string): TeamBlueprintLocation;
  agents(teamId: string): ReadonlyArray<AgentInfo>;
  listSessions(teamId: string): ReadonlyArray<SessionSummary>;
  renameSession(teamId: string, name: string): void;
  stop(): void;
}

export class TeamManagerImpl implements TeamManager {
  private readonly teamRegistry: TeamRegistry;
  private readonly loadedTeams = new Map<string, AgentBody[]>();
  private readonly sessionIds = new Map<string, string>();

  constructor(
    homeJieDir: string,
    projectJieDir: string | null,
    private readonly eventManager: EventManager,
    private readonly settingsStore: SettingsStore,
    private readonly modelRegistry: ModelRegistry,
    private readonly memoryManager: MemoryManager,
    private readonly agentBodyFactory: (params: AgentBodyParams) => AgentBody,
    private readonly resumeSessionId: string | undefined = undefined,
  ) {
    this.teamRegistry = createTeamRegistry({ homeJieDir, projectJieDir });
  }

  async load(teamId?: string): Promise<TeamInfo> {
    return this.loadImpl(teamId);
  }

  async resumeSession(teamId: string, sessionId: string): Promise<TeamInfo> {
    return this.loadImpl(teamId, sessionId);
  }

  listInstalled(): string[] {
    return this.teamRegistry.listInstalled();
  }

  agentCount(teamId: string): number {
    return this.teamRegistry.parseTeamManifest(teamId).roles.length;
  }

  listLoaded(): ReadonlyMap<string, TeamInfo> {
    const result = new Map<string, TeamInfo>();
    for (const [id, bodies] of this.loadedTeams) {
      result.set(id, this.toTeamInfo(id, bodies));
    }
    return result;
  }

  locate(teamId: string): TeamBlueprintLocation {
    return this.teamRegistry.locate(teamId);
  }

  agents(teamId: string): ReadonlyArray<AgentInfo> {
    return (this.loadedTeams.get(teamId) ?? []).map((b) => b.identity);
  }

  listSessions(teamId: string): ReadonlyArray<SessionSummary> {
    return this.memoryManager.listSessions(teamId);
  }

  renameSession(teamId: string, name: string): void {
    const trimmed = name.trim();
    if (trimmed === "") {
      throw new JiePlatformError("INVALID_SESSION_NAME", { detail: "name must not be empty" });
    }
    const sessionId = this.sessionIds.get(teamId);
    if (sessionId === undefined) {
      throw new JiePlatformError("NO_TEAM", { detail: `no session loaded for team '${teamId}'` });
    }
    this.memoryManager.renameSession(sessionId, trimmed);
  }

  stop(): void {
    for (const bodies of this.loadedTeams.values()) {
      for (const b of bodies) b.stop();
    }
  }

  private async loadImpl(teamId?: string, overrideSessionId?: string): Promise<TeamInfo> {
    const requested = this.resolveTeamId(teamId);
    const existing = this.loadedTeams.get(requested);
    if (existing !== undefined && overrideSessionId === undefined) {
      return this.toTeamInfo(requested, existing);
    }
    if (existing !== undefined && overrideSessionId !== undefined) {
      for (const body of existing) body.stop();
      this.loadedTeams.delete(requested);
      this.sessionIds.delete(requested);
    }
    const blueprint: TeamBlueprint = this.teamRegistry.parseTeamManifest(requested);
    const sessionId = this.resolveSessionId(requested, overrideSessionId);
    this.sessionIds.set(requested, sessionId);
    const effort = this.settingsStore.load().defaultEffort ?? "off";
    const bodies: AgentBody[] = [];
    for (const soul of blueprint.roles) {
      const resolvedModel = this.resolveSoulModel(soul);
      if (resolvedModel === undefined) continue;
      const body = this.agentBodyFactory({
        agentKey: `${soul.role}-1`,
        teamId: requested,
        soul,
        isLeader: soul.role === blueprint.leaderRole,
        sessionId,
        model: resolvedModel,
        effort,
      });
      bodies.push(body);
    }
    for (const body of bodies) {
      await body.restore();
    }
    this.loadedTeams.set(requested, bodies);
    this.publishTeamLoaded(requested, bodies);
    for (const body of bodies) {
      await body.start();
    }
    return this.toTeamInfo(requested, bodies);
  }

  private resolveTeamId(teamId?: string): string {
    if (teamId !== undefined) return teamId;
    const settings = this.settingsStore.load();
    if (settings.defaultTeam !== undefined && this.teamRegistry.locate(settings.defaultTeam) !== null) {
      return settings.defaultTeam;
    }
    return this.teamRegistry.listInstalled().find((id) => id !== BUILTIN_MINIMAL_TEAM_ID) ?? BUILTIN_MINIMAL_TEAM_ID;
  }

  private resolveSessionId(teamId: string, overrideSessionId?: string): string {
    const existing = this.sessionIds.get(teamId);
    if (existing !== undefined && overrideSessionId === undefined) return existing;
    if (overrideSessionId !== undefined) {
      if (!this.memoryManager.hasSession(teamId, overrideSessionId)) {
        throw new JiePlatformError("UNKNOWN_SESSION", {
          detail: `unknown session_id: ${overrideSessionId}`,
        });
      }
      return overrideSessionId;
    }
    if (this.resumeSessionId !== undefined) {
      if (!this.memoryManager.hasSession(teamId, this.resumeSessionId)) {
        throw new JiePlatformError("UNKNOWN_SESSION", {
          detail: `unknown session_id: ${this.resumeSessionId}`,
        });
      }
      return this.resumeSessionId;
    }
    return ulid();
  }

  private resolveSoulModel(soul: AgentSoul): Model<Api> | undefined {
    const settings = this.settingsStore.load();
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
      return this.modelRegistry.resolve(provider, modelId);
    } catch {
      return undefined;
    }
  }

  private publishTeamLoaded(teamId: string, bodies: AgentBody[]): void {
    this.eventManager.publish(Events.teamLoaded({ kind: "system" }, this.toTeamInfo(teamId, bodies)));
  }

  private toTeamInfo(id: string, bodies: AgentBody[]): TeamInfo {
    const identities = bodies.map((b) => b.identity);
    const leader = identities.find((a) => a.isLeader);
    if (leader === undefined) {
      throw new JiePlatformError("NO_LEADER", {
        detail: `team '${id}' has no agent marked as leader`,
      });
    }
    const history: AgentHistory[] = bodies.map((b) => ({ agentKey: b.identity.agentKey, messages: b.messages() }));
    const sessionId = this.sessionIds.get(id);
    const sessionName = sessionId === undefined ? null : this.memoryManager.sessionName(sessionId);
    return { id, leaderKey: leader.agentKey, sessionName, agents: identities, history };
  }
}
