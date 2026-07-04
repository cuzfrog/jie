import { getProviders } from "@earendil-works/pi-ai";
import type { AgentIdentity } from "../core";
import { type AuthStore } from "../config";
import { type Settings, type Scope, type SettingsStore } from "../config";
import { JiePlatformError } from "../jie-platform-errors";
import { type GitService } from "../services";
import { type TeamRegistry } from "../team";
import type { Command, CommandName, CommandResult } from "./commands";

export interface CommandExecutorDeps {
  readonly authStore: AuthStore;
  readonly settingsStore: SettingsStore;
  readonly teamRegistry: TeamRegistry;
  readonly gitService: GitService;
  readonly defaultScope: Scope;
  readonly loadActiveTeam: (teamId: string) => Promise<ReadonlyArray<AgentIdentity>>;
}

type AnyCommand = Command<CommandName>;

export interface CommandExecutor {
  readonly execute: <T extends CommandName>(command: Command<T>) => Promise<CommandResult<T>>;
}

export function createCommandExecutor(deps: CommandExecutorDeps): CommandExecutor {
  const knownProviders = new Set<string>(getProviders() as ReadonlyArray<string>);

  async function dispatch(command: AnyCommand): Promise<unknown> {
    switch (command.name) {
      case "login": {
        const c = command as Command<"login">;
        deps.authStore.saveAuthConfig(
          deps.authStore.setProvider(deps.authStore.load(), c.provider, c.apiKey),
        );
        return null;
      }
      case "logout": {
        const c = command as Command<"logout">;
        if (c.provider === undefined) {
          deps.authStore.saveAuthConfig(deps.authStore.clear());
          return null;
        }
        deps.authStore.saveAuthConfig(
          deps.authStore.removeProvider(deps.authStore.load(), c.provider),
        );
        return null;
      }
      case "setDefaultModel": {
        const c = command as Command<"setDefaultModel">;
        if (!knownProviders.has(c.provider)) {
          throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: c.provider });
        }
        const existing = deps.settingsStore.load();
        const next: Settings = { ...existing, defaultProvider: c.provider, defaultModel: c.modelId };
        deps.settingsStore.write(next, deps.defaultScope);
        return null;
      }
      case "getDefaultModel": {
        const settings = deps.settingsStore.load();
        if (settings.defaultProvider === undefined || settings.defaultModel === undefined) return null;
        return { provider: settings.defaultProvider, modelId: settings.defaultModel };
      }
      case "unsetDefaultTeam": {
        deps.settingsStore.unsetDefaultTeam();
        return null;
      }
      case "setDefaultTeam": {
        const c = command as Command<"setDefaultTeam">;
        if (!deps.teamRegistry.isInstalled(c.teamId)) {
          throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `team '${c.teamId}' not found` });
        }
        const loc = deps.teamRegistry.locate(c.teamId);
        const existing = deps.settingsStore.load();
        const next: Settings = { ...existing, defaultTeam: c.teamId };
        deps.settingsStore.write(next, loc === "project" ? "project" : "global");
        return null;
      }
      case "team": {
        const c = command as Command<"team">;
        if (c.teamId === undefined) {
          const settings = deps.settingsStore.load();
          const installed = deps.teamRegistry.listInstalled();
          return {
            kind: "info" as const,
            defaultTeam: settings.defaultTeam ?? null,
            installed,
          };
        }
        if (!deps.teamRegistry.isInstalled(c.teamId)) {
          throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `team '${c.teamId}' not found` });
        }
        const agents = await deps.loadActiveTeam(c.teamId);
        return {
          kind: "switched" as const,
          teamId: c.teamId,
          agents,
        };
      }
      case "getGitStatus": {
        return deps.gitService.getSnapshot();
      }
    }
  }

  async function execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
    return (await dispatch(command as AnyCommand)) as CommandResult<T>;
  }

  return { execute };
}
