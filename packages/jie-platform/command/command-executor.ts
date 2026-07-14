import { getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import { type AuthStore } from "../config";
import { type SettingsStore } from "../config";
import { JiePlatformError } from "../jie-platform-errors";
import { type GitService } from "../services";
import { type TeamManager } from "../team";
import type { Command, CommandName, CommandResult } from "./commands";

export interface CommandExecutorDeps {
  readonly authStore: AuthStore;
  readonly settingsStore: SettingsStore;
  readonly teamManager: TeamManager;
  readonly gitService: GitService;
}

type Handler<N extends CommandName> = (command: Command<N>) => CommandResult<N> | Promise<CommandResult<N>>;

export interface CommandExecutor {
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
}

export function createCommandExecutor(deps: CommandExecutorDeps): CommandExecutor {
  const knownProviders = new Set<string>(getBuiltinProviders() as ReadonlyArray<string>);

  const handlers: { [N in CommandName]: Handler<N> } = {
    login: (command) => {
      deps.authStore.saveAuthConfig(
        deps.authStore.setProvider(deps.authStore.load(), command.provider, command.apiKey),
      );
      return null;
    },
    logout: (command) => {
      if (command.provider === undefined) {
        deps.authStore.saveAuthConfig(deps.authStore.clear());
        return null;
      }
      deps.authStore.saveAuthConfig(
        deps.authStore.removeProvider(deps.authStore.load(), command.provider),
      );
      return null;
    },
    setApiKey: (command) => {
      const settings = deps.settingsStore.load();
      if (settings.defaultProvider === undefined) {
        throw new JiePlatformError("NO_DEFAULT_PROVIDER", {
          detail: "run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>'",
        });
      }
      deps.authStore.saveAuthConfig(
        deps.authStore.setProvider(deps.authStore.load(), settings.defaultProvider, command.apiKey),
      );
      return null;
    },
    setDefaultModel: (command) => {
      if (!knownProviders.has(command.provider)) {
        throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: command.provider });
      }
      deps.settingsStore.setDefaultProvider(command.provider, command.id);
      return null;
    },
    getDefaultModel: () => {
      const settings = deps.settingsStore.load();
      if (settings.defaultProvider === undefined || settings.defaultModel === undefined) return null;
      return { provider: settings.defaultProvider, id: settings.defaultModel, effort: "off", contextWindow: null };
    },
    setDefaultTeam: (command) => {
      deps.settingsStore.setDefaultTeam(command.teamId);
      return null;
    },
    team: (command) => deps.teamManager.load(command.teamId),
    resumeSession: (command) => deps.teamManager.resumeSession(command.teamId, command.sessionId),
    getTeamInfo: () => {
      const settings = deps.settingsStore.load();
      return {
        defaultTeam: settings.defaultTeam ?? null,
        installed: deps.teamManager.listInstalled(),
      };
    },
    getGitStatus: () => deps.gitService.getSnapshot(),
    stop: () => {
      deps.teamManager.stop();
      return null;
    },
    listSessions: (command) => deps.teamManager.listSessions(command.teamId),
  };

  async function execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
    const handler = handlers[command.name] as Handler<T>;
    return await handler(command);
  }

  return { execute };
}
