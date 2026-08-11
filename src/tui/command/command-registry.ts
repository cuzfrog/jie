import type { CommandMeta } from "./slash-command";
import { SLASH_COMMANDS } from "./definitions";

export const COMMAND_METADATA: ReadonlyArray<CommandMeta> = SLASH_COMMANDS.map((command) => command.meta);

const ALIAS_TO_CANONICAL = new Map<string, string>(
  SLASH_COMMANDS.flatMap((command) => (command.meta.aliases ?? []).map((alias) => [alias, command.meta.name])),
);

export function resolveCommandName(name: string): string {
  return ALIAS_TO_CANONICAL.get(name) ?? name;
}
