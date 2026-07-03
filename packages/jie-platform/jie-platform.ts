import { getProviders } from "@earendil-works/pi-ai";
import { ulid } from "ulid";
import { type Api, type Model } from "@earendil-works/pi-ai";
import { type AgentBody, type AgentIdentity, createAgentBody } from "./core";
import { type EventEnvelope, type EventManager, type EventType, Events } from "./event";
import { type AgentSoul, type TeamBlueprint, type TeamRegistry } from "./team";
import { type AuthStore, type ModelRegistry, type Scope, type Settings, type SettingsStore } from "./config";
import { type ToolRegistry } from "./tools";
import {
  type ArtifactStore,
  type MemoryManager,
  type Storage,
} from "./storage";
import { type GitService, type GitSnapshot } from "./services";
import { JiePlatformError } from "./jie-platform-errors";

export interface CreateJiePlatformOptions {
  readonly workspace: string;
  readonly homeJieDir: string;
  readonly teamId?: string;
  readonly resumeSessionId?: string;
  readonly continueLastSession?: boolean;
}

export interface JiePlatformDeps {
  readonly eventManager: EventManager;
  readonly settingsStore: SettingsStore;
  readonly storage: Storage;
  readonly teamRegistry: TeamRegistry;
  readonly modelRegistry: ModelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly artifactStore: ArtifactStore;
  readonly memoryManager: MemoryManager;
  readonly authStore: AuthStore;
  readonly gitService: GitService;
  readonly defaultScope: Scope;
}

export interface JiePlatform {
  readonly team: {
    readonly id: string;
    readonly agents: ReadonlyArray<AgentIdentity>;
  };
  readonly loadTeam: (teamId: string) => Promise<void>;
  readonly stop: () => Promise<void>;

  readonly subscribe: <T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void) => () => void;
  readonly userPrompt: (agentKey: string, text: string) => void;
  readonly interrupt: () => void;

  readonly login: (provider: string, apiKey: string) => void;
  readonly logout: (provider?: string) => void;
  readonly setDefaultModel: (provider: string, modelId: string) => void;
  readonly unsetDefaultTeam: () => void;
  readonly getDefaultTeam: () => string | null;
  readonly getDefaultModel: () => { readonly provider: string; readonly modelId: string } | null;
  readonly listInstalledTeams: () => ReadonlyArray<string>;
  readonly getGitStatus: () => GitSnapshot;
}

export async function createJiePlatform(options: CreateJiePlatformOptions, dependencies: JiePlatformDeps): Promise<JiePlatform> {
  const resolveModel = defaultResolveModel(dependencies.modelRegistry);
  const knownProviders = new Set<string>(getProviders() as ReadonlyArray<string>);
  const sessionIds = new Map<string, string>();
  const loadedTeams = new Map<string, AgentBody[]>();

  async function loadTeam(teamId: string): Promise<void> {
    const existing = loadedTeams.get(teamId);
    if (existing !== undefined) return;

    const blueprint: TeamBlueprint = dependencies.teamRegistry.parseTeamManifest(teamId);
    const sessionId = resolveSessionId(dependencies.memoryManager, options, teamId, sessionIds);
    sessionIds.set(teamId, sessionId);

    const out: AgentBody[] = [];
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
    }
    for (const body of out) {
      await body.start();
    }
    loadedTeams.set(teamId, out);
    publishTeamLoaded(dependencies.eventManager, teamId, blueprint);
  }

  const initialTeamId = options.teamId ?? "minimal";
  await loadTeam(initialTeamId);

  let activeTeamId = initialTeamId;

  const handle: JiePlatform = {
    team: {
      get id(): string {
        return activeTeamId;
      },
      get agents(): ReadonlyArray<AgentIdentity> {
        const bodies = loadedTeams.get(activeTeamId);
        if (bodies === undefined) return [];
        return bodies.map((b) => b.identity);
      },
    },
    loadTeam: async (teamId: string): Promise<void> => {
      await loadTeam(teamId);
      activeTeamId = teamId;
    },
    stop: async (): Promise<void> => {
      const allBodies: AgentBody[] = [];
      for (const bodies of loadedTeams.values()) {
        allBodies.push(...bodies);
      }
      for (const b of allBodies) b.stop();
    },

    subscribe(topic, callback) {
      return dependencies.eventManager.subscribe(topic, callback);
    },
    userPrompt(agentKey, text) {
      const sender = { kind: "user" } as const;
      dependencies.eventManager.publish(Events.userPrompt(sender, activeTeamId, text, agentKey));
    },
    interrupt() {
      dependencies.eventManager.publish(Events.interrupt({ kind: "system" }));
    },

    login(provider, apiKey) {
      const next = dependencies.authStore.setProvider(dependencies.authStore.load(), provider, apiKey);
      dependencies.authStore.saveAuthConfig(next);
    },
    logout(provider) {
      if (provider === undefined) {
        dependencies.authStore.saveAuthConfig(dependencies.authStore.clear());
        return;
      }
      const next = dependencies.authStore.removeProvider(dependencies.authStore.load(), provider);
      dependencies.authStore.saveAuthConfig(next);
    },
    setDefaultModel(provider, modelId) {
      if (!knownProviders.has(provider)) {
        throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: provider });
      }
      const existing = dependencies.settingsStore.load();
      const next: Settings = { ...existing, defaultProvider: provider, defaultModel: modelId };
      dependencies.settingsStore.write(next, dependencies.defaultScope);
    },
    unsetDefaultTeam() {
      dependencies.settingsStore.unsetDefaultTeam();
    },
    getDefaultTeam() {
      const settings = dependencies.settingsStore.load();
      return settings.defaultTeam ?? null;
    },
    getDefaultModel() {
      const settings = dependencies.settingsStore.load();
      if (settings.defaultProvider === undefined || settings.defaultModel === undefined) return null;
      return { provider: settings.defaultProvider, modelId: settings.defaultModel };
    },
    listInstalledTeams() {
      return dependencies.teamRegistry.listInstalled();
    },
    getGitStatus() {
      return dependencies.gitService.getSnapshot();
    },
  };

  return handle;
}

function publishTeamLoaded(events: EventManager, teamId: string, blueprint: TeamBlueprint): void {
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
  existingSessionIds: ReadonlyMap<string, string>,
): string {
  if (existingSessionIds.has(teamId)) return existingSessionIds.get(teamId)!;
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