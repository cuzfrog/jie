import type { GitSnapshot } from "../services";
import type { SessionSummary } from "../storage";
import type { EffortLevel, KanbanCard, KanbanStatus, ModelInfo, TeamInfo } from "../types";
import type { TeamBlueprintLocation } from "../team/types";

interface CommandDef<A, R = null> {
  args: A;
  result: R;
}

interface CommandTypeMap {
  login: CommandDef<{ provider: string; apiKey: string }, null>;
  logout: CommandDef<{ provider: string }, null>;
  setApiKey: CommandDef<{ apiKey: string }, null>;
  setDefaultModel: CommandDef<{ provider: string; id: string }, null>;
  getDefaultModel: CommandDef<{}, ModelInfo | null>;
  setDefaultEffort: CommandDef<{ effort: EffortLevel }, null>;
  getDefaultEffort: CommandDef<{}, EffortLevel>;
  listModels: CommandDef<{}, ReadonlyArray<{
    readonly provider: string;
    readonly id: string;
    readonly name: string;
    readonly available: boolean;
  }>>;
  listProviders: CommandDef<{}, ReadonlyArray<{ readonly id: string; readonly description?: string }>>;
  setModelFilters: CommandDef<{ filters: ReadonlyArray<string> }, null>;
  getModelFilters: CommandDef<{}, ReadonlyArray<string>>;
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
