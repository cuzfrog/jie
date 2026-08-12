import { asFunction, type AwilixContainer } from "awilix";
import type { ModelRegistry, SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { HookRunner } from "../hooks";
import type { LlmService } from "../llm";
import type { MemoryManager } from "../memory";
import type { SkillManager } from "../skills";
import type { ArtifactStore, TranscriptStore } from "../storage";
import type { ToolRegistry } from "../tools";
import type { PlatformCradle } from "../container";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import { CompactorImpl, type Compactor } from "./compaction";
import { JieAgentBody } from "./jie-agent-body";

export function registerCoreModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    compactor: asFunction((transcriptStore: TranscriptStore, llmService: LlmService, settingsStore: SettingsStore) =>
      new CompactorImpl({
        transcriptStore,
        llmService,
        getSettings: () => settingsStore.load().compaction,
      }),
    ).singleton(),
    agentBodyFactory: asFunction((
      eventManager: EventManager,
      artifactStore: ArtifactStore,
      transcriptStore: TranscriptStore,
      toolRegistry: ToolRegistry,
      skillManager: SkillManager,
      loadSystemContextBlock: () => string,
      hookRunner: HookRunner,
      cwd: string,
      modelRegistry: ModelRegistry,
      memoryManager: MemoryManager,
      logDir: string | null,
      compactor: Compactor,
    ) => (params: AgentBodyParams): AgentBody =>
      new JieAgentBody(params, {
        eventManager,
        artifactStore,
        transcriptStore,
        toolRegistry,
        skillManager,
        systemContextBlock: loadSystemContextBlock(),
        hookRunner,
        cwd,
        getApiKey: (provider) => modelRegistry.getApiKey(provider),
        resolveModel: (provider, modelId) => modelRegistry.resolve(provider, modelId),
        compactor,
        memoryManager,
        logDir,
      })).singleton(),
  });
}
