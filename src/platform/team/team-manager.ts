import { ulid } from "ulid";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentBody, AgentBodyParams } from "../core";
import { type EventManager, Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanStore, SessionSummary, TranscriptStore } from "../storage";
import { type ModelRegistry, type Settings, type SettingsStore } from "../config";
import type { SkillManager } from "../skills";
import { type AgentSoul, type TeamBlueprint, type TeamBlueprintLocation, BUILTIN_DEFAULT_SOLO_TEAM_ID } from "./types";
import { type TeamRegistry } from "./registry";
import { isModelAlias, parseModelRef } from "../types";
import type { AgentHistory, AgentInfo, TeamInfo } from "../types";

export interface TeamManager {
  load(teamId?: string): Promise<TeamInfo>;
  reload(): Promise<ReadonlyArray<TeamInfo>>;
  resumeSession(teamId: string, sessionId: string): Promise<TeamInfo>;
  listInstalled(): string[];
  agentCount(teamId: string): number;
  listLoaded(): ReadonlyMap<string, TeamInfo>;
  locate(teamId: string): TeamBlueprintLocation;
  agents(teamId: string): ReadonlyArray<AgentInfo>;
  listSessions(teamId: string): ReadonlyArray<SessionSummary>;
  renameSession(teamId: string, name: string): void;
  currentSessionId(teamId: string): string | null;
  compact(teamId: string, agentKey: string): Promise<void>;
  stop(): void;
}

export class TeamManagerImpl implements TeamManager {
  private readonly loadedTeams = new Map<string, AgentBody[]>();
  private readonly sessionIds = new Map<string, string>();

  constructor(
    private readonly teamRegistry: TeamRegistry,
    private readonly eventManager: EventManager,
    private readonly settingsStore: SettingsStore,
    private readonly modelRegistry: ModelRegistry,
    private readonly transcriptStore: TranscriptStore,
    private readonly kanbanStore: KanbanStore,
    private readonly skillManager: SkillManager,
    private readonly agentBodyFactory: (params: AgentBodyParams) => AgentBody,
    private readonly resumeSessionId: string | undefined = undefined,
  ) {}

  async load(teamId?: string): Promise<TeamInfo> {
    return this.loadImpl(teamId);
  }

  async reload(): Promise<ReadonlyArray<TeamInfo>> {
    this.modelRegistry.reload();
    this.skillManager.reload();
    const infos: TeamInfo[] = [];
    const failures: string[] = [];
    for (const [teamId, bodies] of [...this.loadedTeams]) {
      const sessionId = this.sessionIds.get(teamId);
      if (sessionId === undefined) continue;
      try {
        const rebuilt = await this.constructTeam(teamId, sessionId);
        for (const body of bodies) body.stop();
        await this.startTeam(rebuilt);
        infos.push(this.commitTeam(teamId, sessionId, rebuilt));
      } catch (error) {
        failures.push(`team '${teamId}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new JiePlatformError("RELOAD_FAILED", { detail: failures.join("; ") });
    }
    return infos;
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
    return this.transcriptStore.listSessions(teamId);
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
    this.transcriptStore.renameSession(sessionId, trimmed);
  }

  currentSessionId(teamId: string): string | null {
    return this.sessionIds.get(teamId) ?? null;
  }

  async compact(teamId: string, agentKey: string): Promise<void> {
    const sessionId = this.currentSessionId(teamId);
    if (sessionId === null) {
      throw new JiePlatformError("NO_TEAM", { detail: `no session loaded for team '${teamId}'` });
    }
    const body = this.loadedTeams.get(teamId)?.find((b) => b.identity.agentKey === agentKey);
    if (body === undefined) {
      throw new JiePlatformError("AGENT_NOT_FOUND", { detail: `agent '${agentKey}' is not loaded in team '${teamId}'` });
    }
    await body.compact();
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
    const sessionId = this.resolveSessionId(requested, overrideSessionId);
    return this.buildTeam(requested, sessionId);
  }

  private async buildTeam(teamId: string, sessionId: string): Promise<TeamInfo> {
    const bodies = await this.constructTeam(teamId, sessionId);
    await this.startTeam(bodies);
    return this.commitTeam(teamId, sessionId, bodies);
  }

  private async constructTeam(teamId: string, sessionId: string): Promise<AgentBody[]> {
    const blueprint: TeamBlueprint = this.teamRegistry.parseTeamManifest(teamId);
    const effort = this.settingsStore.load().defaultEffort ?? "off";
    const bodies: AgentBody[] = [];
    for (const soul of blueprint.roles) {
      let resolvedModel: Model<Api>;
      try {
        resolvedModel = this.resolveSoulModel(soul);
      } catch (error) {
        if (error instanceof JiePlatformError && error.code === "MODEL_UNRESOLVED" && soul.role !== blueprint.leaderRole) {
          continue;
        }
        throw error;
      }
      const body = this.agentBodyFactory({
        agentKey: `${soul.role}-1`,
        teamId,
        soul,
        isLeader: soul.role === blueprint.leaderRole,
        sessionId,
        model: resolvedModel,
        effort,
      });
      bodies.push(body);
    }
    if (!bodies.some((body) => body.identity.isLeader)) {
      throw new JiePlatformError("NO_LEADER", { detail: `team '${teamId}' has no agent marked as leader` });
    }
    for (const body of bodies) {
      await body.restore();
    }
    return bodies;
  }

  private async startTeam(bodies: ReadonlyArray<AgentBody>): Promise<void> {
    try {
      for (const body of bodies) await body.start();
    } catch (error) {
      for (const body of bodies) body.stop();
      throw error;
    }
  }

  private commitTeam(teamId: string, sessionId: string, bodies: AgentBody[]): TeamInfo {
    this.sessionIds.set(teamId, sessionId);
    this.loadedTeams.set(teamId, bodies);
    this.publishTeamLoaded(teamId, bodies);
    return this.toTeamInfo(teamId, bodies);
  }

  private resolveTeamId(teamId?: string): string {
    if (teamId !== undefined) return teamId;
    const settings = this.settingsStore.load();
    if (settings.defaultTeam !== undefined && this.teamRegistry.locate(settings.defaultTeam) !== null) {
      return settings.defaultTeam;
    }
    return this.teamRegistry.listInstalled().find((id) => id !== BUILTIN_DEFAULT_SOLO_TEAM_ID) ?? BUILTIN_DEFAULT_SOLO_TEAM_ID;
  }

  private resolveSessionId(teamId: string, overrideSessionId?: string): string {
    const existing = this.sessionIds.get(teamId);
    if (existing !== undefined && overrideSessionId === undefined) return existing;
    if (overrideSessionId !== undefined) {
      if (!this.transcriptStore.hasSession(teamId, overrideSessionId)) {
        throw new JiePlatformError("UNKNOWN_SESSION", {
          detail: `unknown session_id: ${overrideSessionId}`,
        });
      }
      return overrideSessionId;
    }
    if (this.resumeSessionId !== undefined) {
      if (!this.transcriptStore.hasSession(teamId, this.resumeSessionId)) {
        throw new JiePlatformError("UNKNOWN_SESSION", {
          detail: `unknown session_id: ${this.resumeSessionId}`,
        });
      }
      return this.resumeSessionId;
    }
    return ulid();
  }

  private resolveSoulModel(soul: AgentSoul): Model<Api> {
    const settings = this.settingsStore.load();
    const modelRef = this.resolveModelRef(soul, settings);
    const parsed = parseModelRef(modelRef);
    if (parsed === null) {
      throw new JiePlatformError("NO_MODEL_ERROR", { detail: `no model configured for role '${soul.role}'` });
    }
    let model: Model<Api> | undefined;
    try {
      model = this.modelRegistry.resolve(parsed.provider, parsed.modelId);
    } catch {
      model = undefined;
    }
    if (model === undefined) {
      throw new JiePlatformError("MODEL_UNRESOLVED", {
        detail: `model '${modelRef}' for role '${soul.role}' is not available; check the provider and model id`,
      });
    }
    return model;
  }

  private resolveModelRef(soul: AgentSoul, settings: Settings): string {
    if (soul.model === "") {
      if (settings.defaultProvider !== undefined && settings.defaultModel !== undefined) {
        return `${settings.defaultProvider}/${settings.defaultModel}`;
      }
      return "";
    }
    if (isModelAlias(soul.model)) {
      const aliased = settings.modelAliases?.[soul.model];
      if (aliased !== undefined) return aliased;
      if (settings.defaultProvider !== undefined && settings.defaultModel !== undefined) {
        return `${settings.defaultProvider}/${settings.defaultModel}`;
      }
      return "";
    }
    return soul.model;
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
    const sessionId = this.sessionIds.get(id) ?? null;
    const sessionName = sessionId === null ? null : this.transcriptStore.sessionName(sessionId);
    const kanbanCards = sessionId === null ? [] : this.kanbanStore.load(id, sessionId);
    return { id, leaderKey: leader.agentKey, sessionName, currentSessionId: sessionId, agents: identities, history, kanbanCards };
  }
}
