import { asFunction, type AwilixContainer } from "awilix";
import type { ModelRegistry, SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { HookRunner } from "../hooks";
import type { LlmService } from "../llm";
import type { MemoryExtractor, MemoryStore } from "../memory";
import type { SkillManager } from "../skills";
import type { ArtifactStore, TranscriptStore } from "../storage";
import type { ToolRegistry } from "../tools";
import type { PlatformCradle } from "../container";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import { CompactorImpl } from "./compaction";
import { JieAgentBody } from "./jie-agent-body";

export function registerCoreModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
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
      settingsStore: SettingsStore,
      llmService: LlmService,
      memoryStore: MemoryStore,
      memoryExtractor: MemoryExtractor,
    ) => {
      const compactor = new CompactorImpl({
        transcriptStore,
        llmService,
        getSettings: () => settingsStore.load().compaction,
      });
      return (params: AgentBodyParams): AgentBody =>
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
          memoryStore,
          memoryExtractor,
          settingsStore,
        });
    }).singleton(),
  });
}
