import { clearCommand } from "./clear";
import { exitCommand } from "./exit";
import { helpCommand } from "./help";
import { loginCommand } from "./login";
import { logoutCommand } from "./logout";
import { modelCommand } from "./model";
import { teamCommand } from "./team";
import type { CommandOutcome, SlashCommand } from "./types";

export type { CommandOutcome, SlashCommand };

export const COMMANDS: ReadonlyMap<string, SlashCommand> = new Map<string, SlashCommand>([
  [helpCommand.name, helpCommand],
  [clearCommand.name, clearCommand],
  [exitCommand.name, exitCommand],
  [teamCommand.name, teamCommand],
  [loginCommand.name, loginCommand],
  [logoutCommand.name, logoutCommand],
  [modelCommand.name, modelCommand],
]);

const UNKNOWN_REPLY = (name: string): CommandOutcome => ({
  kind: "error",
  text: `unknown slash command: ${name}`,
});

export function runCommand(input: string): CommandOutcome {
  const parts = input.split(/\s+/);
  const rawName = parts[0]!;
  const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  const slashCommand = COMMANDS.get(name);
  if (slashCommand === undefined) return UNKNOWN_REPLY(rawName);
  return slashCommand.run(parts.slice(1));
}
