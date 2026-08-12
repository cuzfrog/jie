import type { GitSnapshot } from "../services";
import type { SessionSummary } from "../storage";
import type { EffortLevel, KanbanCard, KanbanStatus, ModelAlias, ModelInfo, TeamInfo } from "../types";
import type { TeamBlueprintLocation } from "../team";

interface CommandDef<A, R = null> {
  args: A;
  result: R;
}

export interface ModelListRow {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

export interface FilteredModelList {
  readonly models: ReadonlyArray<ModelListRow>;
  readonly filteredOut: number;
}

interface CommandTypeMap {
  login: CommandDef<{ provider: string; apiKey: string }, null>;
  logout: CommandDef<{ provider: string }, null>;
  setApiKey: CommandDef<{ apiKey: string }, null>;
  setDefaultModel: CommandDef<{ provider: string; id: string }, null>;
  setModelAlias: CommandDef<{ alias: ModelAlias; provider: string; id: string }, null>;
  getDefaultModel: CommandDef<{}, ModelInfo | null>;
  getModelAliases: CommandDef<{}, ReadonlyArray<{ readonly alias: ModelAlias; readonly modelRef: string }>>;
  setDefaultEffort: CommandDef<{ effort: EffortLevel }, null>;
  getDefaultEffort: CommandDef<{}, EffortLevel>;
  listModels: CommandDef<{}, ReadonlyArray<ModelListRow>>;
  listFilteredModels: CommandDef<{}, FilteredModelList>;
  listProviders: CommandDef<{}, ReadonlyArray<{ readonly id: string; readonly description?: string }>>;
  setModelFilters: CommandDef<{ filters: ReadonlyArray<string> }, null>;
  getModelFilters: CommandDef<{}, ReadonlyArray<string>>;
  validateModelFilter: CommandDef<{ pattern: string; existingFilters: ReadonlyArray<string> }, string | null>;
  setDefaultTeam: CommandDef<{ teamId: string }, null>;
  team: CommandDef<{ teamId?: string }, TeamInfo>;
  reload: CommandDef<{}, ReadonlyArray<TeamInfo>>;
  resumeSession: CommandDef<{ teamId: string; sessionId: string }, TeamInfo>;
  renameSession: CommandDef<{ teamId: string; sessionName: string }, null>;
  getTeamInfo: CommandDef<{}, {
    defaultTeam: string | null;
    installed: ReadonlyArray<{ readonly id: string; readonly agentCount: number; readonly location: TeamBlueprintLocation }>;
  }>;
  getGitStatus: CommandDef<{}, GitSnapshot>;
  stop: CommandDef<{}, null>;
  listSessions: CommandDef<{ teamId: string }, ReadonlyArray<SessionSummary>>;
  getNotificationSoundEnabled: CommandDef<{}, boolean>;
  setNotificationSoundEnabled: CommandDef<{ enabled: boolean }, null>;
  kanbanAdd: CommandDef<{ teamId: string; title?: string; description: string; scope?: "team" | "session" }, KanbanBoardResult & { card: KanbanCard }>;
  kanbanRemove: CommandDef<{ teamId: string; cardId: string }, KanbanBoardResult>;
  kanbanSetStatus: CommandDef<{ teamId: string; cardId: string; status: KanbanStatus }, KanbanBoardResult>;
  kanbanEdit: CommandDef<{ teamId: string; cardId: string; field: "content" | "description"; text: string }, KanbanBoardResult>;
  kanbanHandoff: CommandDef<{ teamId: string; cardId: string; targetTeamId: string }, KanbanBoardResult & { card: KanbanCard }>;
  compact: CommandDef<{ teamId: string; agentKey: string }, null>;
}

interface KanbanBoardResult {
  board: ReadonlyArray<KanbanCard>;
}

export type CommandName = keyof CommandTypeMap;
export type CommandResult<T extends CommandName> = CommandTypeMap[T]["result"];

type CommandUnion = {
  [K in CommandName]: { name: K } & CommandTypeMap[K]["args"];
}[CommandName];
export type Command<T extends CommandName = CommandName> = Extract<CommandUnion, { name: T }>;
