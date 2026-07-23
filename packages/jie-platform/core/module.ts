import { asFunction, type AwilixContainer } from "awilix";
import type { ModelRegistry } from "../config";
import type { EventManager } from "../event";
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
      modelRegistry: ModelRegistry,
    ) =>
      (params: AgentBodyParams): AgentBody =>
        new JieAgentBody(params, {
          eventManager,
          artifactStore,
          memory: memoryManager,
          toolRegistry,
          getApiKey: (provider) => modelRegistry.getApiKey(provider),
        })
    ).singleton(),
  });
}
