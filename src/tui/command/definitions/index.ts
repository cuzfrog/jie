import { CompactCommand } from "./compact-command";
import { EffortCommand } from "./effort-command";
import { ExitCommand } from "./exit-command";
import { HelpCommand } from "./help-command";
import { KanbanCommand } from "./kanban-command";
import { NewCommand } from "./new-command";
import { SettingCommand } from "./setting-command";
import { LoginCommand } from "./login-command";
import { LogoutCommand } from "./logout-command";
import { ModelAliasCommand } from "./model-alias-command";
import { ModelCommand } from "./model-command";
import { ModelFilterCommand } from "./model-filter-command";
import { NotificationCommand } from "./notification-command";
import { ReloadCommand } from "./reload-command";
import { RenameCommand } from "./rename-command";
import { ResumeCommand } from "./resume-command";
import { TeamCommand } from "./team-command";
import type { SlashCommandDefinition } from "../slash-command";

export const SLASH_COMMANDS: ReadonlyArray<SlashCommandDefinition> = [
  new HelpCommand(),
  new ExitCommand(),
  new LoginCommand(),
  new LogoutCommand(),
  new ModelAliasCommand(),
  new ModelCommand(),
  new ModelFilterCommand(),
  new EffortCommand(),
  new CompactCommand(),
  new ReloadCommand(),
  new TeamCommand(),
  new NewCommand(),
  new ResumeCommand(),
  new RenameCommand(),
  new KanbanCommand(),
  new NotificationCommand(),
  new SettingCommand(),
] as const;
