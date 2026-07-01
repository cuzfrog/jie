import { getProviders } from "@earendil-works/pi-ai";
import type { AuthStore, Settings, SettingsStore, Scope } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import { Actions, type Action, type TuiState } from "./state";

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set<string>(getProviders());

export type CommandOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "clearState" }
  | { readonly kind: "stop" };

export interface SlashCommand {
  readonly name: string;
  readonly run: (args: ReadonlyArray<string>) => CommandOutcome;
}

export interface CommandHandlerDeps {
  readonly getState: () => TuiState;
  readonly dispatch: (action: Action) => void;
  readonly requestQuit: () => void;
  readonly teamRegistry?: TeamRegistry;
  readonly loadTeam?: (teamId: string) => Promise<void>;
  readonly authStore?: AuthStore;
  readonly settingsStore?: SettingsStore;
  readonly settingsScope?: Scope;
}

export interface TuiCommandHandler {
  handle: (text: string) => void;
}

export function createTuiCommandHandler(deps: CommandHandlerDeps): TuiCommandHandler {
  const handle = (text: string): void => {
    deps.dispatch(Actions.clearTransientMessage());
    const parts = text.split(/\s+/);
    const rawName = parts[0]!;
    const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
    const args = parts.slice(1);

    const intercepted = tryDiskWrite(name, args, deps) ?? tryLoadTeam(name, args, deps.teamRegistry, deps.loadTeam);
    if (intercepted !== null) {
      if (intercepted.kind === "reply") deps.dispatch(Actions.setTransientMessage(intercepted.text));
      else deps.dispatch(Actions.setErrorMessage(intercepted.text));
      return;
    }

    const outcome = runCommand(text);
    switch (outcome.kind) {
      case "clearState":
        deps.dispatch(Actions.clearTuiState());
        return;
      case "stop":
        deps.requestQuit();
        return;
      case "reply":
        deps.dispatch(Actions.setTransientMessage(outcome.text));
        return;
      case "error":
        deps.dispatch(Actions.setErrorMessage(outcome.text));
        return;
    }
  };

  return { handle };
}

export function runCommand(input: string): CommandOutcome {
  const parts = input.split(/\s+/);
  const rawName = parts[0]!;
  const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  const slashCommand = COMMANDS.get(name);
  if (slashCommand === undefined) return UNKNOWN_REPLY(rawName);
  return slashCommand.run(parts.slice(1));
}

const HELP_TEXT = "type a prompt...  /clear /help /exit /team /model /login /logout";

const helpCommand: SlashCommand = {
  name: "help",
  run: () => ({ kind: "reply", text: HELP_TEXT }),
};

const clearCommand: SlashCommand = {
  name: "clear",
  run: () => ({ kind: "clearState" }),
};

const exitCommand: SlashCommand = {
  name: "exit",
  run: () => ({ kind: "stop" }),
};

const teamCommand: SlashCommand = {
  name: "team",
  run: (args) => {
    const argument = args[0];
    if (argument === undefined) {
      return { kind: "reply", text: "/team <id>: pass a team id" };
    }
    if (argument === "--unset") {
      return { kind: "reply", text: "/team --unset" };
    }
    return {
      kind: "reply",
      text: `team '${argument}' is not installed; checked .jie/teams/${argument}/ and ~/.jie/teams/${argument}/`,
    };
  },
};

const COMMANDS: ReadonlyMap<string, SlashCommand> = new Map<string, SlashCommand>([
  [helpCommand.name, helpCommand],
  [clearCommand.name, clearCommand],
  [exitCommand.name, exitCommand],
  [teamCommand.name, teamCommand],
]);

const UNKNOWN_REPLY = (name: string): CommandOutcome => ({
  kind: "error",
  text: `unknown slash command: ${name}`,
});

type InterceptResult = { kind: "reply"; text: string } | { kind: "error"; text: string } | null;
type InterceptFn = (args: ReadonlyArray<string>, deps: CommandHandlerDeps) => InterceptResult;

const INTERCEPTS: ReadonlyMap<string, InterceptFn> = new Map<string, InterceptFn>([
  ["login", (args, deps) => {
    if (deps.authStore === undefined) return null;
    if (args.length !== 2) return { kind: "error", text: "/login <provider> <apiKey>" };
    const [provider, apiKey] = args;
    if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
    deps.authStore.write(deps.authStore.setProvider(deps.authStore.load(), provider, apiKey));
    return { kind: "reply", text: `logged in to ${provider}` };
  }],
  ["logout", (args, deps) => {
    if (deps.authStore === undefined) return null;
    if (args.length === 0) {
      deps.authStore.write(deps.authStore.clear());
      return { kind: "reply", text: "logged out of all providers" };
    }
    const provider = args[0]!;
    deps.authStore.write(deps.authStore.removeProvider(deps.authStore.load(), provider));
    return { kind: "reply", text: `logged out of ${provider}` };
  }],
  ["model", (args, deps) => {
    if (deps.settingsStore === undefined) return null;
    if (args.length !== 1) return { kind: "error", text: "/model <provider>/<modelId>" };
    const arg = args[0]!;
    const slash = arg.indexOf("/");
    if (slash === -1) return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
    const provider = arg.slice(0, slash);
    const modelId = arg.slice(slash + 1);
    if (!KNOWN_PROVIDERS.has(provider)) return { kind: "error", text: `unknown provider: ${provider}` };
    const existing = deps.settingsStore.load();
    const next: Settings = { ...existing, defaultProvider: provider, defaultModel: modelId };
    deps.settingsStore.write(next, deps.settingsScope ?? "global");
    return { kind: "reply", text: `default model set to ${provider}/${modelId}` };
  }],
  ["team", (args, deps) => {
    if (args[0] === "--unset") {
      if (deps.settingsStore === undefined) return null;
      deps.settingsStore.unsetDefaultTeam();
      return { kind: "reply", text: "default team unset; takes effect on next `jie` invocation" };
    }
    if (args.length === 0) {
      if (deps.settingsStore === undefined) return null;
      const merged = deps.settingsStore.load();
      const installed = deps.teamRegistry?.listInstalled() ?? [];
      return { kind: "reply", text: `defaultTeam: ${merged.defaultTeam ?? "unset"} | installed: ${installed.join(", ")}` };
    }
    return null;
  }],
]);

function tryDiskWrite(name: string, args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  const fn = INTERCEPTS.get(name);
  if (fn === undefined) return null;
  return fn(args, deps);
}

function tryLoadTeam(
  name: string,
  args: ReadonlyArray<string>,
  teamRegistry: TeamRegistry | undefined,
  loadTeam: ((teamId: string) => Promise<void>) | undefined,
): { kind: "reply"; text: string } | { kind: "error"; text: string } | null {
  if (name !== "team") return null;
  if (teamRegistry === undefined || loadTeam === undefined) return null;
  const argument = args[0];
  if (argument === undefined || argument === "--unset") return null;
  if (!teamRegistry.isInstalled(argument)) return null;
  void loadTeam(argument).catch((error) => {
    console.error(`loadTeam(${argument}) failed:`, error);
  });
  return { kind: "reply", text: `switching to team '${argument}'…` };
}