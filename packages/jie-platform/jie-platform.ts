import { type Api, type Model } from "@earendil-works/pi-ai";
import { ulid } from "ulid";
import { type AgentBody, type AgentIdentity, createAgentBody } from "./core";
import { type EventEnvelope, type EventManager, type EventType, Events } from "./event";
import { type AgentSoul, type TeamBlueprint, type TeamRegistry } from "./team";
import { type ModelRegistry, type SettingsStore } from "./config";
import { type ToolRegistry } from "./tools";
import {
  type ArtifactStore,
  type MemoryManager,
  type Storage,
} from "./storage";
import { JiePlatformError } from "./jie-platform-errors";
import { type Command, type CommandExecutor, type CommandName, type CommandResult } from "./command";
import { type TeamIdentity } from "./types";

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
  readonly commandExecutor: CommandExecutor;
}

export interface JiePlatform {
  readonly team: TeamIdentity;
  stop(): Promise<void>;

  subscribe<T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): () => void;
  prompt(agentKey: string, text: string): void;
  interrupt(): void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
}

export async function createJiePlatform(options: CreateJiePlatformOptions, dependencies: JiePlatformDeps): Promise<JiePlatform> {
  const resolveModel = defaultResolveModel(dependencies.modelRegistry);
  const sessionIds = new Map<string, string>();
  const loadedTeams = new Map<string, AgentBody[]>();

  async function loadTeam(teamId: string): Promise<ReadonlyArray<AgentIdentity>> {
    const existing = loadedTeams.get(teamId);
    let bodies: AgentBody[];
    if (existing !== undefined) {
      bodies = existing;
    } else {
      const blueprint: TeamBlueprint = dependencies.teamRegistry.parseTeamManifest(teamId);
      const sessionId = resolveSessionId(dependencies.memoryManager, options, teamId, sessionIds);
      sessionIds.set(teamId, sessionId);
      const out: AgentBody[] = [];
      for (const soul of blueprint.roles) {
        const isLeader = soul.role === blueprint.leaderRole;
        const agentKey = `${soul.role}-1`;
        const resolvedModel = resolveSoulModel(soul, dependencies.settingsStore, resolveModel);
        if (resolvedModel === undefined) continue;
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
      bodies = out;
      loadedTeams.set(teamId, out);
      publishTeamLoaded(dependencies.eventManager, teamId, blueprint);
    }
    activeTeamId = teamId;
    return bodies.map((b) => b.identity);
  }

  const initialTeamId = options.teamId ?? "minimal";
  let activeTeamId = initialTeamId;
  await loadTeam(initialTeamId);

  const handle: JiePlatform = {
    team: {
      get id(): string {
        return activeTeamId;
      },
      get agents(): ReadonlyArray<AgentIdentity> {
        const bodies = loadedTeams.get(activeTeamId) ?? [];
        return bodies.map((b) => b.identity);
      },
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
    prompt(agentKey, text) {
      const sender = { kind: "user" } as const;
      dependencies.eventManager.publish(Events.userPrompt(sender, activeTeamId, text, agentKey));
    },
    interrupt() {
      dependencies.eventManager.publish(Events.interrupt({ kind: "system" }));
    },
    execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
      return runCommand(command);
    },
  };

  async function runCommand<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
    switch (command.name) {
      case "switchTeam": {
        const c = command as Command<"switchTeam">;
        const agents = await loadTeam(c.teamId);
        activeTeamId = c.teamId;
        return agents as CommandResult<T>;
      }
      default:
        return await dependencies.commandExecutor.execute(command);
    }
  }

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
  if (slash === -1) return undefined;
  const provider = modelStr.slice(0, slash);
  const modelId = modelStr.slice(slash + 1);
  try {
    return resolveModel(provider, modelId);
  } catch {
    return undefined;
  }
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
