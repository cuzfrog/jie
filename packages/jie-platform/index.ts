export { startJie } from "./start.ts";
export type { JieHandle } from "./start.ts";

export type { AgentEvent } from "./core/agent-event.ts";

export {
  loadMergedSettings,
  loadAuthJson,
  resolveStaleDefaultTeam,
  ModelRegistry,
  findProjectJieRoot,
  homeJieDir,
  globalAuthPath,
  globalSettingsPath,
  projectSettingsPath,
} from "./config/index.ts";
export type { MergedSettings, AuthJson } from "./config/index.ts";

export type {
  Tool,
  ToolResult,
  ToolRegistry,
  ExecutionContext,
} from "./tools/index.ts";