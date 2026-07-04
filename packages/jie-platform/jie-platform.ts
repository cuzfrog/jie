import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { type AgentIdentity } from "./core";
import { type EventEnvelope, type EventManager, type EventType, Events, createEventManager } from "./event";
import { type TeamManager, createTeamManager } from "./team";
import { type ModelRegistry, type SettingsStore, makeAuthStore, makeSettingsStore, createModelRegistry } from "./config";
import { type ToolRegistry, createToolRegistry } from "./tools";
import {
  type ArtifactStore,
  type MemoryManager,
  type Storage,
  createArtifactStore,
  createMemoryManager,
  createStorage,
} from "./storage";
import { type Command, type CommandExecutor, type CommandName, type CommandResult, createCommandExecutor } from "./command";
import { createGitService } from "./services";
import { type TeamIdentity } from "./types";

export interface JiePlatformOptions {
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
  readonly teamManager: TeamManager;
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

export async function createJiePlatform(options: JiePlatformOptions, dependencies: JiePlatformDeps = buildJiePlatformDeps(options)): Promise<JiePlatform> {
  const initialTeamId = options.teamId ?? dependencies.settingsStore.load().defaultTeam ?? "minimal";
  let activeTeamId = initialTeamId;
  await dependencies.teamManager.load(activeTeamId);

  const handle: JiePlatform = {
    team: {
      get id(): string {
        return activeTeamId;
      },
      get agents(): ReadonlyArray<AgentIdentity> {
        return dependencies.teamManager.agents(activeTeamId);
      },
    },
    stop: async (): Promise<void> => {
      dependencies.teamManager.stop();
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
    const c: Command = command;
    switch (c.name) {
      case "switchTeam": {
        const agents = await dependencies.teamManager.load(c.teamId);
        activeTeamId = c.teamId;
        return agents;
      }
      default:
        return await dependencies.commandExecutor.execute(c);
    }
  }

  return handle;
}

function buildJiePlatformDeps(options: JiePlatformOptions): JiePlatformDeps {
  const cwd = options.workspace;
  const homeJieDir = options.homeJieDir;
  const projectJieDir = findProjectJieDir(cwd);
  mkdirSync(homeJieDir, { recursive: true, mode: 0o755 });
  const eventManager = createEventManager();
  const storage = createStorage({
    type: "sqlite",
    filePath: join(homeJieDir, "storage.db"),
  });
  const authStore = makeAuthStore(homeJieDir);
  const modelRegistry = createModelRegistry(homeJieDir, projectJieDir, authStore);
  const memoryManager = createMemoryManager(storage);
  const artifactStore = createArtifactStore(storage);
  const toolRegistry = createToolRegistry({
    workspaceRoot: cwd,
    eventManager,
    artifactStore,
  });
  const gitService = createGitService({ cwd });
  const settingsStore = makeSettingsStore(cwd, homeJieDir, projectJieDir);
  const defaultScope: "global" | "project" = projectJieDir === null ? "global" : "project";
  const teamManager = createTeamManager(
    { homeJieDir, projectJieDir, resumeSessionId: options.resumeSessionId, continueLastSession: options.continueLastSession },
    { eventManager, settingsStore, modelRegistry, toolRegistry, artifactStore, memoryManager },
  );
  const commandExecutor = createCommandExecutor({
    authStore,
    settingsStore,
    teamManager,
    gitService,
    defaultScope,
    loadActiveTeam: () => Promise.resolve([]),
  });
  return {
    eventManager,
    settingsStore,
    storage,
    teamManager,
    modelRegistry,
    toolRegistry,
    artifactStore,
    memoryManager,
    commandExecutor,
  };
}

function findProjectJieDir(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    const candidate = join(current, ".jie");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}