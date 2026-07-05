import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type EventEnvelope, type EventManager, type EventType, Events, createEventManager } from "./event";
import { type TeamManager, createTeamManager } from "./team";
import { type ModelRegistry, type Settings, type SettingsStore, makeAuthStore, makeSettingsStore, createModelRegistry } from "./config";
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
import type { SettingScope } from "./config";

export interface JiePlatformOptions {
  readonly cwd: string;
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly resumeSessionId?: string;
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
  readonly defaultScope: SettingScope;
}

export interface JiePlatform {
  readonly settings: Settings;

  stop(): Promise<void>;

  prompt(teamId: string, agentKey: string, text: string): void;
  interrupt(teamId: string, agentKey: string): void;

  subscribe<T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): () => void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
}

export async function createJiePlatform(options: JiePlatformOptions, deps: JiePlatformDeps = buildJiePlatformDeps(options)): Promise<JiePlatform> {
  const settingsSnapshot: Settings = deps.settingsStore.load();

  const handle: JiePlatform = {
    settings: settingsSnapshot,

    stop: async (): Promise<void> => {
      deps.teamManager.stop();
    },

    subscribe(topic, callback) {
      return deps.eventManager.subscribe(topic, callback);
    },
    prompt(teamId, agentKey, text) {
      deps.eventManager.publish(Events.userPrompt({ kind: "user" }, teamId, text, agentKey));
    },
    interrupt(teamId, agentKey) {
      deps.eventManager.publish(Events.agentInterrupt({ kind: "user" }, teamId, agentKey));
    },
    execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
      return deps.commandExecutor.execute(command);
    },
  };

  return handle;
}

function buildJiePlatformDeps(options: JiePlatformOptions): JiePlatformDeps {
  const cwd = options.cwd;
  const homeJieDir = options.homeJieDir;
  const projectJieDir = options.projectJieDir;
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
    { homeJieDir, projectJieDir, resumeSessionId: options.resumeSessionId },
    { eventManager, settingsStore, modelRegistry, toolRegistry, artifactStore, memoryManager },
  );
  const commandExecutor = createCommandExecutor({
    authStore,
    settingsStore,
    teamManager,
    gitService,
    defaultScope,
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
    defaultScope,
  };
}
