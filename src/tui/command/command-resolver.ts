import type { JiePlatform } from "../../platform";
import { TuiState } from "../state";
import { resolveCommandName } from "./command-registry";
import type { ResolvedCommand, SlashCommandDefinition, SlashContext } from "./slash-command";

export type { ResolvedCommand } from "./slash-command";

export interface CommandResolver {
  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand>;
}

export class CommandResolverImpl implements CommandResolver {
  private readonly platform: JiePlatform;
  private readonly slashCommands: ReadonlyArray<SlashCommandDefinition>;

  constructor(platform: JiePlatform, slashCommands: ReadonlyArray<SlashCommandDefinition>) {
    this.platform = platform;
    this.slashCommands = slashCommands;
  }

  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const canonical = resolveCommandName(name);
    const command = this.slashCommands.find((candidate) => candidate.meta.name === canonical);
    if (command === undefined) {
      return { kind: "error", text: `unknown slash command: /${name}` };
    }
    const context: SlashContext = { state, platform: this.platform };
    return command.resolve(context, args);
  }
}
