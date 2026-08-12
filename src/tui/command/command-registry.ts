import { SLASH_COMMANDS } from "./definitions";
import type { CommandMeta, SlashCommandDefinition } from "./slash-command";

export interface CommandCatalog {
  readonly metadata: ReadonlyArray<CommandMeta>;
  commandMeta(name: string): CommandMeta | null;
}

export interface CommandRegistry extends CommandCatalog {
  findCommand(name: string): SlashCommandDefinition | null;
}

export class CommandRegistryImpl implements CommandRegistry {
  readonly metadata: ReadonlyArray<CommandMeta>;
  private readonly canonicalByAlias = new Map<string, string>();
  private readonly commandByName = new Map<string, SlashCommandDefinition>();

  constructor() {
    this.metadata = SLASH_COMMANDS.map((command) => command.meta);
    for (const command of SLASH_COMMANDS) {
      this.commandByName.set(command.meta.name, command);
      for (const alias of command.meta.aliases ?? []) {
        this.canonicalByAlias.set(alias, command.meta.name);
      }
    }
  }

  commandMeta(name: string): CommandMeta | null {
    const canonical = this.canonicalByAlias.get(name) ?? name;
    const command = this.commandByName.get(canonical);
    return command?.meta ?? null;
  }

  findCommand(name: string): SlashCommandDefinition | null {
    const canonical = this.canonicalByAlias.get(name) ?? name;
    return this.commandByName.get(canonical) ?? null;
  }
}
