
import type { AgentIdentity } from "../core";
import type { GitSnapshot } from "../services";

interface CommandDef<A, R = null> {
  args: A;
  result: R;
}

interface CommandTypeMap {
  login: CommandDef<{ provider: string; apiKey: string }, null>;
  logout: CommandDef<{ provider?: string }, null>;
  setDefaultModel: CommandDef<{ provider: string; modelId: string }, null>;
  getDefaultModel: CommandDef<{}, { provider: string; modelId: string } | null>;
  unsetDefaultTeam: CommandDef<{}, null>;
  setDefaultTeam: CommandDef<{ teamId: string }, null>;
  team: CommandDef<
    { teamId?: string },
    | { kind: "info"; defaultTeam: string | null; installed: ReadonlyArray<string> }
    | { kind: "switched"; teamId: string; agents: ReadonlyArray<AgentIdentity> }
  >;
  getGitStatus: CommandDef<{}, GitSnapshot>;
}

export type CommandName = keyof CommandTypeMap;
export type Command<T extends CommandName> = { name: T } & CommandTypeMap[T]["args"];
export type CommandResult<T extends CommandName> = CommandTypeMap[T]["result"];
