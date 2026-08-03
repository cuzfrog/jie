import type { GitSnapshot } from "../services";
import type { SessionSummary } from "../storage";
import type { EffortLevel, ModelInfo, TeamInfo } from "../types";

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
    installed: ReadonlyArray<{ readonly id: string; readonly agentCount: number }>;
  }>;
  getGitStatus: CommandDef<{}, GitSnapshot>;
  stop: CommandDef<{}, null>;
  listSessions: CommandDef<{ teamId: string }, ReadonlyArray<SessionSummary>>;
}

export type CommandName = keyof CommandTypeMap;
export type CommandResult<T extends CommandName> = CommandTypeMap[T]["result"];

type CommandUnion = {
  [K in CommandName]: { name: K } & CommandTypeMap[K]["args"];
}[CommandName];
export type Command<T extends CommandName = CommandName> = Extract<CommandUnion, { name: T }>;
