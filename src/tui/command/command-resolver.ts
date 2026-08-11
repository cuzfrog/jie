import type { JiePlatform } from "../../platform";
import { TuiState } from "../state";
import type { CommandRegistry } from "./command-registry";
import type { ResolvedCommand, SlashContext } from "./slash-command";

export interface CommandResolver {
  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand>;
}

export class CommandResolverImpl implements CommandResolver {
  private readonly platform: JiePlatform;
  private readonly commandRegistry: CommandRegistry;

  constructor(platform: JiePlatform, commandRegistry: CommandRegistry) {
    this.platform = platform;
    this.commandRegistry = commandRegistry;
  }

  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const canonical = this.commandRegistry.resolveCommandName(name);
    const command = this.commandRegistry.commands.find((candidate) => candidate.meta.name === canonical);
    if (command === undefined) {
      return { kind: "error", text: `unknown slash command: /${name}` };
    }
    const context: SlashContext = { state, platform: this.platform };
    return command.resolve(context, args);
  }
}
