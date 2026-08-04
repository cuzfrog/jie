import { asFunction, type AwilixContainer } from "awilix";
import type { ModelRegistry } from "../config";
import type { EventManager } from "../event";
import type { HookRunner } from "../hooks";
import type { SkillManager } from "../skills";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { ToolRegistry } from "../tools";
import type { PlatformCradle } from "../container";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import { JieAgentBody } from "./jie-agent-body";

export function registerCoreModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    agentBodyFactory: asFunction((
      eventManager: EventManager,
      artifactStore: ArtifactStore,
      memoryManager: MemoryManager,
      toolRegistry: ToolRegistry,
      skillManager: SkillManager,
      loadSystemContextBlock: () => string,
      hookRunner: HookRunner,
      cwd: string,
      modelRegistry: ModelRegistry,
    ) =>
      (params: AgentBodyParams): AgentBody =>
        new JieAgentBody(params, {
          eventManager,
          artifactStore,
          memory: memoryManager,
          toolRegistry,
          skillManager,
          systemContextBlock: loadSystemContextBlock(),
          hookRunner,
          cwd,
          getApiKey: (provider) => modelRegistry.getApiKey(provider),
          resolveModel: (provider, modelId) => modelRegistry.resolve(provider, modelId),
        })
    ).singleton(),
  });
}
