import { getProviders } from "@earendil-works/pi-ai";
import type { AuthStore, Settings, SettingsStore, Scope } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import { Actions, type Action, type TuiState } from "./state";

const KNOWN_PROVIDERS: ReadonlySet<string> = new Set<string>(getProviders());

type CommandOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "clearState" }
  | { readonly kind: "stop" };

interface SlashCommand {
  readonly name: string;
  readonly run: (args: ReadonlyArray<string>) => CommandOutcome;
}

export interface CommandHandlerDeps {
  readonly getState: () => TuiState;
  readonly dispatch: (action: Action) => void;
  readonly requestQuit: () => void;
  readonly teamRegistry: TeamRegistry;
  readonly loadTeam: (teamId: string) => Promise<void>;
  readonly authStore: AuthStore;
  readonly settingsStore: SettingsStore;
  readonly settingsScope: Scope;
}

export interface TuiCommandHandler {
  handle: (text: string) => void;
}

export function createTuiCommandHandler(deps: CommandHandlerDeps): TuiCommandHandler {
  const handle = (text: string): void => {
    deps.dispatch(Actions.clearBanners());
    const parts = text.split(/\s+/);
    const rawName = parts[0]!;
    const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
    const args = parts.slice(1);

    const intercepted = runIntercepts(name, args, deps);
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

function runCommand(input: string): CommandOutcome {
  const parts = input.split(/\s+/);
  const rawName = parts[0]!;
  const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  const slashCommand = COMMANDS.get(name);
  if (slashCommand === undefined) return { kind: "error", text: `unknown slash command: ${rawName}` };
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

const COMMANDS: ReadonlyMap<string, SlashCommand> = new Map<string, SlashCommand>([
  [helpCommand.name, helpCommand],
  [clearCommand.name, clearCommand],
  [exitCommand.name, exitCommand],
]);

type InterceptResult = { kind: "reply"; text: string } | { kind: "error"; text: string } | null;
type InterceptFn = (args: ReadonlyArray<string>, deps: CommandHandlerDeps) => InterceptResult;

function runIntercepts(name: string, args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  const fn = INTERCEPTS.get(name);
  if (fn === undefined) return null;
  return fn(args, deps);
}

function parseModelArg(arg: string): { kind: "ok"; provider: string; modelId: string } | { kind: "error"; text: string } {
  const slash = arg.indexOf("/");
  if (slash === -1) return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
  const provider = arg.slice(0, slash);
  const modelId = arg.slice(slash + 1);
  if (!KNOWN_PROVIDERS.has(provider)) return { kind: "error", text: `unknown provider: ${provider}` };
  return { kind: "ok", provider, modelId };
}

function formatTeamListReply(defaultTeam: string | null, installed: ReadonlyArray<string>): string {
  return `defaultTeam: ${defaultTeam ?? "unset"} | installed: ${installed.join(", ")}`;
}

function interceptLogin(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length !== 2) return { kind: "error", text: "/login <provider> <apiKey>" };
  const [provider, apiKey] = args;
  if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
  deps.authStore.saveAuthConfig(deps.authStore.setProvider(deps.authStore.load(), provider, apiKey));
  return { kind: "reply", text: `logged in to ${provider}` };
}

function interceptLogout(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length === 0) {
    deps.authStore.saveAuthConfig(deps.authStore.clear());
    return { kind: "reply", text: "logged out of all providers" };
  }
  const provider = args[0]!;
  deps.authStore.saveAuthConfig(deps.authStore.removeProvider(deps.authStore.load(), provider));
  return { kind: "reply", text: `logged out of ${provider}` };
}

function interceptModel(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length !== 1) return { kind: "error", text: "/model <provider>/<modelId>" };
  const parsed = parseModelArg(args[0]!);
  if (parsed.kind === "error") return parsed;
  const existing = deps.settingsStore.load();
  const next: Settings = { ...existing, defaultProvider: parsed.provider, defaultModel: parsed.modelId };
  deps.settingsStore.write(next, deps.settingsScope);
  return { kind: "reply", text: `default model set to ${parsed.provider}/${parsed.modelId}` };
}

function interceptTeam(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args[0] === "--unset") {
    deps.settingsStore.unsetDefaultTeam();
    return { kind: "reply", text: "default team unset; takes effect on next `jie` invocation" };
  }
  if (args.length === 0) {
    const merged = deps.settingsStore.load();
    const installed = deps.teamRegistry.listInstalled();
    return { kind: "reply", text: formatTeamListReply(merged.defaultTeam ?? null, installed) };
  }
  const argument = args[0]!;
  if (!deps.teamRegistry.isInstalled(argument)) {
    return {
      kind: "reply",
      text: `team '${argument}' is not installed; checked .jie/teams/${argument}/ and ~/.jie/teams/${argument}/`,
    };
  }
  void deps.loadTeam(argument).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    deps.dispatch(Actions.setErrorMessage(`loadTeam(${argument}) failed: ${reason}`));
  });
  return { kind: "reply", text: `switching to team '${argument}'…` };
}

const INTERCEPTS: ReadonlyMap<string, InterceptFn> = new Map<string, InterceptFn>([
  ["login", interceptLogin],
  ["logout", interceptLogout],
  ["model", interceptModel],
  ["team", interceptTeam],
]);