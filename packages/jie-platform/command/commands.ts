import type { GitSnapshot } from "../services";
import type { ModelIdentity, TeamIdentity } from "../types";

interface CommandDef<A, R = null> {
  args: A;
  result: R;
}

interface CommandTypeMap {
  login: CommandDef<{ provider: string; apiKey: string }, null>;
  logout: CommandDef<{ provider?: string }, null>;
  setApiKey: CommandDef<{ apiKey: string }, null>;
  setDefaultModel: CommandDef<ModelIdentity, null>;
  getDefaultModel: CommandDef<{}, ModelIdentity | null>;
  unsetDefaultTeam: CommandDef<{}, null>;
  setDefaultTeam: CommandDef<{ teamId: string }, null>;
  team: CommandDef<{ teamId?: string }, TeamIdentity>;
  getTeamInfo: CommandDef<{}, { defaultTeam: string | null; installed: ReadonlyArray<string> }>;
  getGitStatus: CommandDef<{}, GitSnapshot>;
  stop: CommandDef<{}, null>;
}

export type CommandName = keyof CommandTypeMap;
export type CommandResult<T extends CommandName> = CommandTypeMap[T]["result"];

type CommandUnion = {
  [K in CommandName]: { name: K } & CommandTypeMap[K]["args"];
}[CommandName];
export type Command<T extends CommandName = CommandName> = Extract<CommandUnion, { name: T }>;
