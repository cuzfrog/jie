import type { CommandMeta, SlashCommandDefinition } from "./slash-command";
import { ClearCommand } from "./definitions/clear-command";
import { CompactCommand } from "./definitions/compact-command";
import { EffortCommand } from "./definitions/effort-command";
import { ExitCommand } from "./definitions/exit-command";
import { HelpCommand } from "./definitions/help-command";
import { KanbanCommand } from "./definitions/kanban-command";
import { LoginCommand } from "./definitions/login-command";
import { LogoutCommand } from "./definitions/logout-command";
import { ModelCommand } from "./definitions/model-command";
import { ModelFilterCommand } from "./definitions/model-filter-command";
import { NotificationCommand } from "./definitions/notification-command";
import { ReloadCommand } from "./definitions/reload-command";
import { RenameCommand } from "./definitions/rename-command";
import { ResumeCommand } from "./definitions/resume-command";
import { TeamCommand } from "./definitions/team-command";

export const SLASH_COMMANDS: ReadonlyArray<SlashCommandDefinition> = [
  new HelpCommand(),
  new ClearCommand(),
  new ExitCommand(),
  new LoginCommand(),
  new LogoutCommand(),
  new ModelCommand(),
  new ModelFilterCommand(),
  new EffortCommand(),
  new CompactCommand(),
  new ReloadCommand(),
  new TeamCommand(),
  new ResumeCommand(),
  new RenameCommand(),
  new KanbanCommand(),
  new NotificationCommand(),
] as const;

export const COMMAND_METADATA: ReadonlyArray<CommandMeta> = SLASH_COMMANDS.map((command) => command.meta);

export const SLASH_COMMAND_NAMES: ReadonlyArray<string> = SLASH_COMMANDS.flatMap((command) => [command.meta.name, ...(command.meta.aliases ?? [])]);

const ALIAS_TO_CANONICAL = new Map<string, string>(
  SLASH_COMMANDS.flatMap((command) => (command.meta.aliases ?? []).map((alias) => [alias, command.meta.name])),
);

export function resolveCommandName(name: string): string {
  return ALIAS_TO_CANONICAL.get(name) ?? name;
}
