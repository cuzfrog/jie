import type { GitSnapshot } from "../services";
import type { SessionSummary } from "../storage";
import type { ModelInfo, TeamInfo } from "../types";

interface CommandDef<A, R = null> {
  args: A;
  result: R;
}

interface CommandTypeMap {
  login: CommandDef<{ provider: string; apiKey: string }, null>;
  logout: CommandDef<{ provider?: string }, null>;
  setApiKey: CommandDef<{ apiKey: string }, null>;
  setDefaultModel: CommandDef<ModelInfo, null>;
  getDefaultModel: CommandDef<{}, ModelInfo | null>;
  setDefaultTeam: CommandDef<{ teamId: string }, null>;
  team: CommandDef<{ teamId?: string }, TeamInfo>;
  resumeSession: CommandDef<{ teamId: string; sessionId: string }, TeamInfo>;
  getTeamInfo: CommandDef<{}, { defaultTeam: string | null; installed: ReadonlyArray<string> }>;
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
