import type { AuthStore, ModelRegistry, SettingsStore } from "../config";
import { JiePlatformError } from "../jie-platform-errors";
import type { GitService } from "../services";
import type { TeamManager } from "../team";
import type { Command, CommandName, CommandResult } from "./commands";

export interface CommandExecutor {
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
}

type Handler<N extends CommandName> = (command: Command<N>) => CommandResult<N> | Promise<CommandResult<N>>;

export class CommandExecutorImpl implements CommandExecutor {
  private readonly handlers: { [N in CommandName]: Handler<N> };

  constructor(
    private readonly authStore: AuthStore,
    private readonly settingsStore: SettingsStore,
    private readonly modelRegistry: ModelRegistry,
    private readonly teamManager: TeamManager,
    private readonly gitService: GitService,
  ) {
    this.handlers = {
      login: this.login.bind(this),
      logout: this.logout.bind(this),
      setApiKey: this.setApiKey.bind(this),
      setDefaultModel: this.setDefaultModel.bind(this),
      getDefaultModel: this.getDefaultModel.bind(this),
      setDefaultTeam: this.setDefaultTeam.bind(this),
      team: this.team.bind(this),
      resumeSession: this.resumeSession.bind(this),
      getTeamInfo: this.getTeamInfo.bind(this),
      getGitStatus: this.getGitStatus.bind(this),
      stop: this.stop.bind(this),
      listSessions: this.listSessions.bind(this),
    };
  }

  async execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
    const handler = this.handlers[command.name] as Handler<T>;
    return await handler(command);
  }

  private login(command: Command<"login">): CommandResult<"login"> {
    this.authStore.setProvider(command.provider, command.apiKey);
    return null;
  }

  private logout(command: Command<"logout">): CommandResult<"logout"> {
    if (command.provider === undefined) {
      this.authStore.clear();
      return null;
    }
    this.authStore.removeProvider(command.provider);
    return null;
  }

  private setApiKey(command: Command<"setApiKey">): CommandResult<"setApiKey"> {
    const settings = this.settingsStore.load();
    if (settings.defaultProvider === undefined) {
      throw new JiePlatformError("NO_DEFAULT_PROVIDER", {
        detail: "run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>'",
      });
    }
    this.authStore.setProvider(settings.defaultProvider, command.apiKey);
    return null;
  }

  private setDefaultModel(command: Command<"setDefaultModel">): CommandResult<"setDefaultModel"> {
    if (!this.modelRegistry.providers().includes(command.provider)) {
      throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: command.provider });
    }
    this.settingsStore.setDefaultProvider(command.provider, command.id);
    return null;
  }

  private getDefaultModel(): CommandResult<"getDefaultModel"> {
    const settings = this.settingsStore.load();
    if (settings.defaultProvider === undefined || settings.defaultModel === undefined) return null;
    return { provider: settings.defaultProvider, id: settings.defaultModel, effort: "off", contextWindow: null };
  }

  private setDefaultTeam(command: Command<"setDefaultTeam">): CommandResult<"setDefaultTeam"> {
    const location = this.teamManager.locate(command.teamId);
    if (location === null) {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `team '${command.teamId}' not found` });
    }
    this.settingsStore.setDefaultTeam(command.teamId, location === "project" ? "project" : "global");
    return null;
  }

  private team(command: Command<"team">): Promise<CommandResult<"team">> {
    return this.teamManager.load(command.teamId);
  }

  private resumeSession(command: Command<"resumeSession">): Promise<CommandResult<"resumeSession">> {
    return this.teamManager.resumeSession(command.teamId, command.sessionId);
  }

  private getTeamInfo(): CommandResult<"getTeamInfo"> {
    const settings = this.settingsStore.load();
    return {
      defaultTeam: settings.defaultTeam ?? null,
      installed: this.teamManager.listInstalled(),
    };
  }

  private getGitStatus(): CommandResult<"getGitStatus"> {
    return this.gitService.getSnapshot();
  }

  private stop(): CommandResult<"stop"> {
    this.teamManager.stop();
    return null;
  }

  private listSessions(command: Command<"listSessions">): CommandResult<"listSessions"> {
    return this.teamManager.listSessions(command.teamId);
  }
}
