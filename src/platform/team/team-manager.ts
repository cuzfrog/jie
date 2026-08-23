import { ulid } from "ulid";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentBody, AgentBodyParams } from "../core";
import { type EventManager, Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanStore, SessionSummary, SessionUsageStore, TranscriptStore } from "../storage";
import { type ModelRegistry, type Settings, type SettingsStore } from "../config";
import type { SkillManager } from "../skills";
import { type AgentSoul, type TeamBlueprint, type TeamBlueprintLocation, BUILTIN_SETUP_ASSISTANT_TEAM_ID } from "./types";
import { type AgentRegistry } from "./agent-registry";
import { type TeamRegistry } from "./registry";
import { isModelAlias, parseModelRef, parseModelWithEffort, type EffortLevel } from "../types";
import type { AgentHistory, AgentInfo, TeamInfo } from "../types";

export interface TeamManager {
  load(teamId?: string): Promise<TeamInfo>;
  reload(): Promise<ReadonlyArray<TeamInfo>>;
  resumeSession(teamId: string, sessionId: string): Promise<TeamInfo>;
  newSession(teamId: string): Promise<TeamInfo>;
  listInstalled(): string[];
  agentCount(teamId: string): number;
  getTeamDescription(teamId: string): string | undefined;
  listLoaded(): ReadonlyMap<string, TeamInfo>;
  locate(teamId: string): TeamBlueprintLocation;
  agents(teamId: string): ReadonlyArray<AgentInfo>;
  bodies(teamId: string): ReadonlyArray<AgentBody>;
  listSessions(teamId: string): ReadonlyArray<SessionSummary>;
  renameSession(teamId: string, name: string): void;
  currentSessionId(teamId: string): string | null;
  compact(teamId: string, agentKey: string): Promise<void>;
  stop(): void;
  spawnAdHoc(teamId: string, agentRef: string): Promise<AgentBody>;
  resetAgent(teamId: string, agentKey: string): Promise<AgentBody>;
}

export class TeamManagerImpl implements TeamManager {
  private readonly loadedTeams = new Map<string, AgentBody[]>();
  private readonly loadedBlueprints = new Map<string, TeamBlueprint>();
  private readonly sessionIds = new Map<string, string>();
  private readonly bodyParams = new Map<string, AgentBodyParams>();

  constructor(
    private readonly teamRegistry: TeamRegistry,
    private readonly agentRegistry: AgentRegistry,
    private readonly eventManager: EventManager,
    private readonly settingsStore: SettingsStore,
    private readonly modelRegistry: ModelRegistry,
    private readonly transcriptStore: TranscriptStore,
    private readonly sessionUsageStore: SessionUsageStore,
    private readonly kanbanStore: KanbanStore,
    private readonly skillManager: SkillManager,
    private readonly agentBodyFactory: (params: AgentBodyParams) => AgentBody,
    private readonly resumeSessionId: string | undefined = undefined,
  ) {}

  async load(teamId?: string): Promise<TeamInfo> {
    return this.loadImpl(teamId);
  }

  async reload(): Promise<ReadonlyArray<TeamInfo>> {
    await this.modelRegistry.reload();
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

  async newSession(teamId: string): Promise<TeamInfo> {
    const requested = this.resolveTeamId(teamId);
    this.unload(requested);
    return this.buildTeam(requested, ulid());
  }

  listInstalled(): string[] {
    return this.teamRegistry.listInstalled();
  }

  agentCount(teamId: string): number {
    return this.teamRegistry.parseTeamManifest(teamId).roles.reduce((sum, soul) => sum + soul.replicas, 0);
  }

  getTeamDescription(teamId: string): string | undefined {
    const loaded = this.loadedBlueprints.get(teamId);
    if (loaded !== undefined) return loaded.description;
    try {
      return this.teamRegistry.parseTeamManifest(teamId).description;
    } catch {
      return undefined;
    }
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
    return (this.loadedTeams.get(teamId) ?? []).map((b) => this.agentInfoWithSessionUsage(teamId, b));
  }

  bodies(teamId: string): ReadonlyArray<AgentBody> {
    return this.loadedTeams.get(teamId) ?? [];
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

  private unload(teamId: string): void {
    const existing = this.loadedTeams.get(teamId);
    if (existing !== undefined) {
      for (const body of existing) body.stop();
      this.loadedTeams.delete(teamId);
    }
    this.loadedBlueprints.delete(teamId);
    this.sessionIds.delete(teamId);
  }

  private async loadImpl(teamId?: string, overrideSessionId?: string): Promise<TeamInfo> {
    const requested = this.resolveTeamId(teamId);
    const existing = this.loadedTeams.get(requested);
    if (existing !== undefined && overrideSessionId === undefined) {
      return this.toTeamInfo(requested, existing);
    }
    if (overrideSessionId !== undefined) {
      this.unload(requested);
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
    this.loadedBlueprints.set(teamId, blueprint);
    const settings = this.settingsStore.load();
    const bodies: AgentBody[] = [];
    const blueprintKeys = new Set<string>();
    for (const soul of blueprint.roles) {
      let resolved: { model: Model<Api>; effort: EffortLevel; modelPinned: boolean; effortPinned: boolean };
      try {
        resolved = this.resolveSoulModelAndEffort(soul, settings);
      } catch (error) {
        if (error instanceof JiePlatformError && error.code === "MODEL_UNRESOLVED" && soul.role !== blueprint.leaderRole) {
          continue;
        }
        throw error;
      }
      for (let replicaIndex = 1; replicaIndex <= soul.replicas; replicaIndex += 1) {
        const agentKey = `${soul.role}-${replicaIndex}`;
        blueprintKeys.add(agentKey);
        const params: AgentBodyParams = {
          agentKey,
          teamId,
          soul,
          isLeader: soul.role === blueprint.leaderRole,
          isEphemeral: false,
          sessionId,
          model: resolved.model,
          effort: resolved.effort,
          modelPinned: resolved.modelPinned,
          effortPinned: resolved.effortPinned,
        };
        this.bodyParams.set(`${teamId}:${agentKey}`, params);
        bodies.push(this.agentBodyFactory(params));
      }
    }
    if (!bodies.some((body) => body.identity.isLeader)) {
      throw new JiePlatformError("NO_LEADER", { detail: `team '${teamId}' has no agent marked as leader` });
    }
    for (const agentKey of this.transcriptStore.listAgentKeys(teamId, sessionId)) {
      if (blueprintKeys.has(agentKey)) continue;
      const body = await this.buildAdHoc(teamId, sessionId, agentKey, true);
      if (body !== null) bodies.push(body);
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
    return this.teamRegistry.listInstalled().find((id) => id !== BUILTIN_SETUP_ASSISTANT_TEAM_ID) ?? BUILTIN_SETUP_ASSISTANT_TEAM_ID;
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

  private resolveSoulModelAndEffort(soul: AgentSoul, settings: Settings): { model: Model<Api>; effort: EffortLevel; modelPinned: boolean; effortPinned: boolean } {
    const { modelRef, aliasEffort, modelPinned } = this.resolveAliasedModel(soul, settings);
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
    const effort = soul.effort ?? aliasEffort ?? settings.defaultEffort ?? "off";
    const effortPinned = soul.effort !== undefined || aliasEffort !== undefined;
    return { model, effort, modelPinned, effortPinned };
  }

  private resolveAliasedModel(soul: AgentSoul, settings: Settings): { modelRef: string; aliasEffort: EffortLevel | undefined; modelPinned: boolean } {
    if (soul.model === "") {
      if (settings.defaultProvider !== undefined && settings.defaultModel !== undefined) {
        return { modelRef: `${settings.defaultProvider}/${settings.defaultModel}`, aliasEffort: undefined, modelPinned: false };
      }
      return { modelRef: "", aliasEffort: undefined, modelPinned: false };
    }
    if (isModelAlias(soul.model)) {
      const raw = settings.modelAliases?.[soul.model];
      if (raw !== undefined) {
        const parsed = parseModelWithEffort(raw);
        if (parsed === null) {
          throw new JiePlatformError("MODEL_UNRESOLVED", {
            detail: `model alias '${soul.model}' resolves to an invalid value '${raw}'`,
          });
        }
        return { modelRef: parsed.model, aliasEffort: parsed.effort, modelPinned: true };
      }
      if (settings.defaultProvider !== undefined && settings.defaultModel !== undefined) {
        return { modelRef: `${settings.defaultProvider}/${settings.defaultModel}`, aliasEffort: undefined, modelPinned: false };
      }
      return { modelRef: "", aliasEffort: undefined, modelPinned: false };
    }
    return { modelRef: soul.model, aliasEffort: undefined, modelPinned: true };
  }

  private publishTeamLoaded(teamId: string, bodies: AgentBody[]): void {
    this.eventManager.publish(Events.teamLoaded({ kind: "system" }, this.toTeamInfo(teamId, bodies)));
  }

  private toTeamInfo(id: string, bodies: AgentBody[]): TeamInfo {
    const identities = bodies.map((b) => this.agentInfoWithSessionUsage(id, b));
    const leader = identities.find((a) => a.isLeader);
    if (leader === undefined) {
      throw new JiePlatformError("NO_LEADER", {
        detail: `team '${id}' has no agent marked as leader`,
      });
    }
    const history: AgentHistory[] = bodies.map((b) => ({ agentKey: b.identity.agentKey, messages: b.displayMessages() }));
    const sessionId = this.sessionIds.get(id) ?? null;
    const sessionName = sessionId === null ? null : this.transcriptStore.sessionName(sessionId);
    const kanbanCards = sessionId === null ? [] : this.kanbanStore.load(id, sessionId);
    const blueprint = this.loadedBlueprints.get(id);
    return {
      id,
      leaderKey: leader.agentKey,
      sessionName,
      currentSessionId: sessionId,
      agents: identities,
      history,
      kanbanCards,
      description: blueprint?.description,
    };
  }

  private agentInfoWithSessionUsage(teamId: string, body: AgentBody): AgentInfo {
    const sessionId = this.sessionIds.get(teamId) ?? null;
    const sessionUsage = sessionId === null ? null : this.sessionUsageStore.load(teamId, sessionId, body.identity.agentKey);
    return { ...body.identity, sessionUsage };
  }

  private async buildAdHoc(teamId: string, sessionId: string, agentRef: string, isEphemeral: boolean): Promise<AgentBody | null> {
    try {
      const soul = this.agentRegistry.resolve(agentRef);
      const settings = this.settingsStore.load();
      const resolved = this.resolveSoulModelAndEffort(soul, settings);
      const params: AgentBodyParams = {
        agentKey: agentRef,
        teamId,
        soul,
        isLeader: false,
        isEphemeral,
        sessionId,
        model: resolved.model,
        effort: resolved.effort,
        modelPinned: resolved.modelPinned,
        effortPinned: resolved.effortPinned,
      };
      this.bodyParams.set(`${teamId}:${agentRef}`, params);
      return this.agentBodyFactory(params);
    } catch (error) {
      if (error instanceof JiePlatformError && (error.code === "AGENT_NOT_FOUND" || error.code === "INVALID_AGENT_REF")) {
        return null;
      }
      throw error;
    }
  }

  async spawnAdHoc(teamId: string, agentRef: string): Promise<AgentBody> {
    const loaded = this.loadedTeams.get(teamId);
    if (loaded === undefined) {
      throw new JiePlatformError("NO_TEAM", { detail: `team '${teamId}' is not loaded` });
    }
    const existing = loaded.find((b) => b.identity.agentKey === agentRef);
    if (existing !== undefined) return existing;
    const sessionId = this.currentSessionId(teamId);
    if (sessionId === null) {
      throw new JiePlatformError("NO_TEAM", { detail: `team '${teamId}' has no active session` });
    }
    const body = await this.buildAdHoc(teamId, sessionId, agentRef, true);
    if (body === null) {
      throw new JiePlatformError("AGENT_NOT_FOUND", { detail: `agent '${agentRef}' not found` });
    }
    await body.restore();
    await body.start();
    loaded.push(body);
    this.loadedTeams.set(teamId, loaded);
    this.publishTeamLoaded(teamId, loaded);
    return body;
  }

  async resetAgent(teamId: string, agentKey: string): Promise<AgentBody> {
    const sessionId = this.currentSessionId(teamId);
    if (sessionId === null) {
      throw new JiePlatformError("NO_TEAM", { detail: `team '${teamId}' has no active session` });
    }
    const loaded = this.loadedTeams.get(teamId);
    if (loaded === undefined) {
      throw new JiePlatformError("NO_TEAM", { detail: `team '${teamId}' is not loaded` });
    }
    const index = loaded.findIndex((b) => b.identity.agentKey === agentKey);
    if (index === -1) {
      throw new JiePlatformError("AGENT_NOT_FOUND", { detail: `agent '${agentKey}' is not loaded in team '${teamId}'` });
    }
    const params = this.bodyParams.get(`${teamId}:${agentKey}`);
    if (params === undefined) {
      throw new JiePlatformError("AGENT_NOT_FOUND", { detail: `agent '${agentKey}' has no stored parameters in team '${teamId}'` });
    }
    const oldBody = loaded[index];
    oldBody.stop();
    this.transcriptStore.remove(agentKey, sessionId, teamId);
    const newBody = this.agentBodyFactory({ ...params, sessionId, isEphemeral: params.isEphemeral });
    await newBody.restore();
    await newBody.start();
    loaded[index] = newBody;
    this.loadedTeams.set(teamId, loaded);
    this.publishTeamLoaded(teamId, loaded);
    return newBody;
  }
}
