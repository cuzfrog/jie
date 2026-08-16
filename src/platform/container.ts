import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { registerCommandModule, type CommandExecutor } from "./command";
import { registerConfigModule, type AuthStore, type ModelRegistry, type SettingsStore } from "./config";
import { registerContextModule } from "./context";
import { registerCoreModule, type AgentBody, type AgentBodyParams, type Compactor } from "./core";
import { registerEventModule, type EventManager } from "./event";
import { registerHooksModule, type HookRunner } from "./hooks";
import type { JiePlatform, JiePlatformOptions } from "./jie-platform";
import { registerLlmModule, type LlmService } from "./llm";
import { registerMcpModule, type McpConnector, type McpManager } from "./mcp";
import { registerMemoryModule, type MemoryManager } from "./memory";
import { registerPlatformModule } from "./module";
import { registerServicesModule, type GitService } from "./services";
import { registerSkillsModule, type SkillManager } from "./skills";
import { registerStorageModule, type ArtifactStore, type KanbanStore, type SessionUsageStore, type Storage, type TranscriptStore } from "./storage";
import { registerTeamModule, type AgentRegistry, type SessionNamer, type TeamManager } from "./team";
import type { AgentDispatcher } from "./types";
import { registerToolsModule, type QuestionBroker, type ToolRegistry } from "./tools";

export interface PlatformCradle {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly cwd: string;
  readonly inMemory: boolean;
  readonly debug: boolean;
  readonly logDir: string | null;
  readonly resumeSessionId?: string;

  readonly eventManager: EventManager;
  readonly storage: Storage;
  readonly artifactStore: ArtifactStore;
  readonly transcriptStore: TranscriptStore;
  readonly kanbanStore: KanbanStore;
  readonly sessionUsageStore: SessionUsageStore;
  readonly authStore: AuthStore;
  readonly modelRegistry: ModelRegistry;
  readonly settingsStore: SettingsStore;
  readonly llmService: LlmService;
  readonly memoryManager: MemoryManager;
  readonly gitService: GitService;
  readonly compactor: Compactor;
  readonly toolRegistry: ToolRegistry;
  readonly skillManager: SkillManager;
  readonly questionBroker: QuestionBroker;
  readonly loadSystemContextBlock: () => string;
  readonly hookRunner: HookRunner;
  readonly agentBodyFactory: (params: AgentBodyParams) => AgentBody;
  readonly agentRegistry: AgentRegistry;
  readonly teamManager: TeamManager;
  readonly sessionNamer: SessionNamer;
  readonly agentDispatcher: AgentDispatcher;
  readonly commandExecutor: CommandExecutor;
  readonly mcpConnector: McpConnector;
  readonly mcpManager: McpManager;
  readonly platform: JiePlatform;
}

export async function bootPlatform(options: JiePlatformOptions): Promise<AwilixContainer<PlatformCradle>> {
  mkdirSync(options.homeJieDir, { recursive: true, mode: 0o755 });
  const debug = options.debug === true;
  const logDir = debug ? join(options.projectJieDir ?? options.homeJieDir, "logs") : null;
  if (logDir !== null) mkdirSync(logDir, { recursive: true, mode: 0o755 });
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue(options.cwd),
    homeJieDir: asValue(options.homeJieDir),
    projectJieDir: asValue(options.projectJieDir),
    inMemory: asValue(options.inMemory === true),
    debug: asValue(debug),
    logDir: asValue(logDir),
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
  container.resolve("agentDispatcher");
  container.resolve("sessionNamer");
  await container.resolve("mcpManager").connectAll();
  return container;
}
