import { mkdirSync } from "node:fs";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { registerCommandModule, type CommandExecutor } from "./command";
import { registerConfigModule, type AuthStore, type ModelRegistry, type SettingsStore } from "./config";
import { registerCoreModule, type AgentBody, type AgentBodyParams } from "./core";
import { registerEventModule, type EventBus, type EventManager } from "./event";
import type { JiePlatform, JiePlatformOptions } from "./jie-platform";
import { registerPlatformModule } from "./module";
import { registerServicesModule, type GitService } from "./services";
import { registerStorageModule, type ArtifactStore, type MemoryManager, type Storage } from "./storage";
import { registerTeamModule, type TeamManager } from "./team";
import { registerToolsModule, type ToolRegistry } from "./tools";

export interface PlatformCradle {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly cwd: string;
  readonly inMemory: boolean;
  readonly resumeSessionId?: string;

  readonly eventBus: EventBus;
  readonly eventManager: EventManager;
  readonly storage: Storage;
  readonly artifactStore: ArtifactStore;
  readonly memoryManager: MemoryManager;
  readonly authStore: AuthStore;
  readonly modelRegistry: ModelRegistry;
  readonly settingsStore: SettingsStore;
  readonly gitService: GitService;
  readonly toolRegistry: ToolRegistry;
  readonly agentBodyFactory: (params: AgentBodyParams) => AgentBody;
  readonly teamManager: TeamManager;
  readonly commandExecutor: CommandExecutor;
  readonly platform: JiePlatform;
}

export function bootPlatform(options: JiePlatformOptions): AwilixContainer<PlatformCradle> {
  mkdirSync(options.homeJieDir, { recursive: true, mode: 0o755 });
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue(options.cwd),
    homeJieDir: asValue(options.homeJieDir),
    projectJieDir: asValue(options.projectJieDir),
    inMemory: asValue(options.inMemory === true),
  });
  if (options.resumeSessionId !== undefined) {
    container.register({ resumeSessionId: asValue(options.resumeSessionId) });
  }
  registerEventModule(container);
  registerStorageModule(container);
  registerConfigModule(container);
  registerServicesModule(container);
  registerToolsModule(container);
  registerCoreModule(container);
  registerTeamModule(container);
  registerCommandModule(container);
  registerPlatformModule(container);
  return container;
}
