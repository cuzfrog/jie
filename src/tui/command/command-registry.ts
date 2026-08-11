import { SLASH_COMMANDS } from "./definitions";
import type { CommandMeta, SlashCommandDefinition } from "./slash-command";

export interface CommandRegistry {
  readonly commands: ReadonlyArray<SlashCommandDefinition>;
  readonly metadata: ReadonlyArray<CommandMeta>;
  resolveCommandName(name: string): string;
}

export class CommandRegistryImpl implements CommandRegistry {
  readonly commands = SLASH_COMMANDS;
  readonly metadata: ReadonlyArray<CommandMeta>;
  private readonly aliasToCanonical = new Map<string, string>();

  constructor() {
    this.metadata = this.commands.map((command) => command.meta);
    for (const command of this.commands) {
      for (const alias of command.meta.aliases ?? []) {
        this.aliasToCanonical.set(alias, command.meta.name);
      }
    }
  }

  resolveCommandName(name: string): string {
    return this.aliasToCanonical.get(name) ?? name;
  }
}
