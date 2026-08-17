import { asFunction, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import { CompactorImpl } from "./compaction";
import { JieAgentBody } from "./jie-agent-body";

export function registerCoreModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    compactor: asFunction(({ transcriptStore, llmService, settingsStore }: Pick<PlatformCradle, "transcriptStore" | "llmService" | "settingsStore">) =>
      new CompactorImpl({
        transcriptStore,
        llmService,
        getSettings: () => settingsStore.load().compaction,
      }),
    ).proxy().singleton(),
    agentBodyFactory: asFunction((cradle: PlatformCradle) => (params: AgentBodyParams): AgentBody =>
      new JieAgentBody(params, {
        eventManager: cradle.eventManager,
        artifactStore: cradle.artifactStore,
        transcriptStore: cradle.transcriptStore,
        sessionUsageStore: cradle.sessionUsageStore,
        toolRegistry: cradle.toolRegistry,
        skillManager: cradle.skillManager,
        systemContextBlock: cradle.loadSystemContextBlock(),
        hookRunner: cradle.hookRunner,
        cwd: cradle.cwd,
        getAuth: (provider) => cradle.modelRegistry.getAuth(provider),
        resolveModel: (provider, modelId) => cradle.modelRegistry.resolve(provider, modelId),
        compactor: cradle.compactor,
        memoryManager: cradle.memoryManager,
        logDir: cradle.logDir,
        agentDispatcher: cradle.agentDispatcher,
      })).proxy().singleton(),
  });
}
