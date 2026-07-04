import type { AgentIdentity } from "../core";
import type { GitSnapshot } from "../services";
import type { ModelIdentity } from "../types";

interface CommandDef<A, R = null> {
  args: A;
  result: R;
}

interface CommandTypeMap {
  login: CommandDef<{ provider: string; apiKey: string }, null>;
  logout: CommandDef<{ provider?: string }, null>;
  setDefaultModel: CommandDef<ModelIdentity, null>;
  getDefaultModel: CommandDef<{}, ModelIdentity | null>;
  unsetDefaultTeam: CommandDef<{}, null>;
  setDefaultTeam: CommandDef<{ teamId: string }, null>;
  getTeamInfo: CommandDef<{}, { defaultTeam: string | null; installed: ReadonlyArray<string> }>;
  switchTeam: CommandDef<{ teamId: string }, ReadonlyArray<AgentIdentity>>;
  getGitStatus: CommandDef<{}, GitSnapshot>;
}

export type CommandName = keyof CommandTypeMap;
export type CommandResult<T extends CommandName> = CommandTypeMap[T]["result"];

type CommandUnion = {
  [K in CommandName]: { name: K } & CommandTypeMap[K]["args"];
}[CommandName];
export type Command<T extends CommandName = CommandName> = Extract<CommandUnion, { name: T }>;
