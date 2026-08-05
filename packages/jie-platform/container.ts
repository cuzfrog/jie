import { mkdirSync } from "node:fs";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { registerCommandModule, type CommandExecutor } from "./command";
import { registerConfigModule, type AuthStore, type ModelRegistry, type SettingsStore } from "./config";
import { registerContextModule } from "./context";
import { registerCoreModule, type AgentBody, type AgentBodyParams } from "./core";
import { registerEventModule, type EventBus, type EventManager } from "./event";
import { registerHooksModule, type HookRunner } from "./hooks";
import type { JiePlatform, JiePlatformOptions } from "./jie-platform";
import { registerLlmModule, type LlmService } from "./llm";
import { registerMcpModule, type McpConnector, type McpManager, type SubprocessFactory } from "./mcp";
import { registerMemoryModule, type MemoryExtractor, type MemoryStore } from "./memory";
import { registerPlatformModule } from "./module";
import { registerServicesModule, type GitService } from "./services";
import { registerSkillsModule, type SkillManager } from "./skills";
import { registerStorageModule, type ArtifactStore, type Storage, type TranscriptStore } from "./storage";
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
  readonly transcriptStore: TranscriptStore;
  readonly authStore: AuthStore;
  readonly modelRegistry: ModelRegistry;
  readonly settingsStore: SettingsStore;
  readonly llmService: LlmService;
  readonly memoryStore: MemoryStore;
  readonly memoryExtractor: MemoryExtractor;
  readonly gitService: GitService;
  readonly toolRegistry: ToolRegistry;
  readonly skillManager: SkillManager;
  readonly loadSystemContextBlock: () => string;
  readonly hookRunner: HookRunner;
  readonly agentBodyFactory: (params: AgentBodyParams) => AgentBody;
  readonly teamManager: TeamManager;
  readonly commandExecutor: CommandExecutor;
  readonly subprocessFactory: SubprocessFactory;
  readonly mcpConnector: McpConnector;
  readonly mcpManager: McpManager;
  readonly platform: JiePlatform;
}

export async function bootPlatform(options: JiePlatformOptions): Promise<AwilixContainer<PlatformCradle>> {
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
  registerLlmModule(container);
  registerMemoryModule(container);
  registerServicesModule(container);
  registerToolsModule(container);
  registerSkillsModule(container);
  registerContextModule(container);
  registerHooksModule(container);
  registerMcpModule(container);
  registerCoreModule(container);
  registerTeamModule(container);
  registerCommandModule(container);
  registerPlatformModule(container);
  await container.resolve("mcpManager").connectAll();
  return container;
}
