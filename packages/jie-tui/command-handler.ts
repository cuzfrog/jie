import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type StateStore } from "./state";

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
  readonly stateStore: StateStore;
  readonly platform: JiePlatform;
}

export interface TuiCommandHandler {
  readonly handle: (text: string) => void;
}

export function createTuiCommandHandler(deps: CommandHandlerDeps): TuiCommandHandler {
  const handle = (text: string): void => {
    deps.stateStore.dispatch(Actions.clearBanners());
    const parts = text.split(/\s+/);
    const rawName = parts[0]!;
    const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
    const args = parts.slice(1);

    const intercepted = runIntercepts(name, args, deps);
    if (intercepted !== null) {
      if (intercepted.kind === "reply") deps.stateStore.dispatch(Actions.setTransientMessage(intercepted.text));
      else deps.stateStore.dispatch(Actions.setErrorMessage(intercepted.text));
      return;
    }

    const outcome = runCommand(text);
    switch (outcome.kind) {
      case "clearState":
        deps.stateStore.dispatch(Actions.clearTuiState());
        return;
      case "stop":
        deps.stateStore.dispatch(Actions.requestQuit());
        return;
      case "reply":
        deps.stateStore.dispatch(Actions.setTransientMessage(outcome.text));
        return;
      case "error":
        deps.stateStore.dispatch(Actions.setErrorMessage(outcome.text));
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
  return { kind: "ok", provider, modelId };
}

function formatTeamListReply(defaultTeam: string | null, installed: ReadonlyArray<string>): string {
  return `defaultTeam: ${defaultTeam ?? "unset"} | installed: ${installed.join(", ")}`;
}

function interceptLogin(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length !== 2) return { kind: "error", text: "/login <provider> <apiKey>" };
  const [provider, apiKey] = args;
  if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
  try {
    deps.platform.login(provider, apiKey);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "error", text: `/login failed: ${reason}` };
  }
  return { kind: "reply", text: `logged in to ${provider}` };
}

function interceptLogout(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  const provider = args[0];
  try {
    deps.platform.logout(provider);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "error", text: `/logout failed: ${reason}` };
  }
  return { kind: "reply", text: provider === undefined ? "logged out of all providers" : `logged out of ${provider}` };
}

function interceptModel(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length !== 1) return { kind: "error", text: "/model <provider>/<modelId>" };
  const parsed = parseModelArg(args[0]!);
  if (parsed.kind === "error") return parsed;
  try {
    deps.platform.setDefaultModel(parsed.provider, parsed.modelId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "error", text: `/model failed: ${reason}` };
  }
  return { kind: "reply", text: `default model set to ${parsed.provider}/${parsed.modelId}` };
}

function interceptTeam(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args[0] === "--unset") {
    try {
      deps.platform.unsetDefaultTeam();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { kind: "error", text: `/team --unset failed: ${reason}` };
    }
    return { kind: "reply", text: "default team unset; takes effect on next `jie` invocation" };
  }
  if (args.length === 0) {
    const defaultTeam = deps.platform.getDefaultTeam();
    const installed = deps.platform.listInstalledTeams();
    return { kind: "reply", text: formatTeamListReply(defaultTeam, installed) };
  }
  const argument = args[0]!;
  void deps.platform.loadTeam(argument).then(
    () => undefined,
    (error: unknown) => {
      const code = error instanceof Error && "code" in error ? (error as { code?: unknown }).code : undefined;
      const message = code === "TEAM_NOT_FOUND" ? `team '${argument}' not found` : `loadTeam(${argument}) failed`;
      deps.stateStore.dispatch(Actions.setErrorMessage(message));
    },
  );
  return { kind: "reply", text: `switching to team '${argument}'…` };
}

const INTERCEPTS: ReadonlyMap<string, InterceptFn> = new Map<string, InterceptFn>([
  ["login", interceptLogin],
  ["logout", interceptLogout],
  ["model", interceptModel],
  ["team", interceptTeam],
]);