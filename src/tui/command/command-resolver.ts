import type { JiePlatform } from "../../platform";
import { TuiState } from "../state";
import type { CommandRegistry } from "./command-registry";
import type { ResolvedCommand, SlashCompletion, SlashContext } from "./slash-command";

export interface CommandResolver {
  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand>;
  complete(state: TuiState, name: string, argumentText: string): SlashCompletion | null | Promise<SlashCompletion | null>;
}

export class CommandResolverImpl implements CommandResolver {
  private readonly platform: JiePlatform;
  private readonly commandRegistry: CommandRegistry;

  constructor(platform: JiePlatform, commandRegistry: CommandRegistry) {
    this.platform = platform;
    this.commandRegistry = commandRegistry;
  }

  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const command = this.commandRegistry.findCommand(name);
    if (command === null) {
      return { kind: "error", text: `unknown slash command: /${name}` };
    }
    const context: SlashContext = { state, platform: this.platform };
    return command.resolve(context, args);
  }

  complete(state: TuiState, name: string, argumentText: string): SlashCompletion | null | Promise<SlashCompletion | null> {
    const command = this.commandRegistry.findCommand(name);
    if (command === null) {
      return null;
    }
    const context: SlashContext = { state, platform: this.platform };
    return command.complete(argumentText, context);
  }
}
