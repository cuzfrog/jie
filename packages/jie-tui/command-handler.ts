import { JiePlatformError, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type StateStore, type TuiState } from "./state";
import { bashDirective, parseBashCommand } from "./bash";

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

export interface CommandHandler {
  handle(text: string): void;
}

export function createTuiCommandHandler(deps: CommandHandlerDeps): CommandHandler {
  const handle = (text: string): void => {
    deps.stateStore.dispatch(Actions.clearBanners());
    const trimmed = text.trim();
    if (trimmed.startsWith("!")) {
      routeBash(trimmed, deps);
      return;
    }
    if (!trimmed.startsWith("/")) {
      routePrompt(trimmed, deps);
      return;
    }
    const parts = trimmed.split(/\s+/);
    const rawName = parts[0]!;
    const name = rawName.slice(1);
    const args = parts.slice(1);

    const intercepted = runIntercepts(name, args, deps);
    if (intercepted !== null) {
      if (intercepted.kind === "reply") deps.stateStore.dispatch(Actions.setTransientMessage(intercepted.text));
      else deps.stateStore.dispatch(Actions.setErrorMessage(intercepted.text));
      return;
    }

    const outcome = runCommand(trimmed);
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

function routeBash(trimmed: string, deps: CommandHandlerDeps): void {
  const bash = parseBashCommand(trimmed);
  if (bash === null) {
    deps.stateStore.dispatch(Actions.setErrorMessage("bash mode requires a command after !"));
    return;
  }
  const target = routeTarget(deps.stateStore);
  if (target === null) {
    deps.stateStore.dispatch(Actions.setErrorMessage("no team loaded — load a team first"));
    return;
  }
  deps.platform.prompt(target.teamId, target.agentKey, bashDirective(bash));
}

function routePrompt(trimmed: string, deps: CommandHandlerDeps): void {
  const target = routeTarget(deps.stateStore);
  if (target === null) {
    deps.stateStore.dispatch(Actions.setErrorMessage("no team loaded — load a team first"));
    return;
  }
  deps.platform.prompt(target.teamId, target.agentKey, trimmed);
}

interface AgentRoute {
  readonly teamId: string;
  readonly agentKey: string;
}

function routeTarget(stateStore: StateStore): AgentRoute | null {
  const state = stateStore.getState();
  return agentTarget(state, state.focusedAgentId) ?? agentTarget(state, state.leaderAgentId);
}

function agentTarget(state: TuiState, agentId: TuiState["focusedAgentId"]): AgentRoute | null {
  if (agentId === null) return null;
  const agent = state.agents.get(agentId);
  return agent === undefined ? null : { teamId: agent.teamId, agentKey: agent.agentKey };
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
  void deps.platform.execute({ name: "login", provider, apiKey })
    .then(() => undefined, (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      deps.stateStore.dispatch(Actions.setErrorMessage(`/login failed: ${reason}`));
    });
  return { kind: "reply", text: `logged in to ${provider}` };
}

function interceptLogout(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  const provider = args[0];
  void deps.platform.execute({ name: "logout", provider })
    .then(() => undefined, (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      deps.stateStore.dispatch(Actions.setErrorMessage(`/logout failed: ${reason}`));
    });
  return { kind: "reply", text: provider === undefined ? "logged out of all providers" : `logged out of ${provider}` };
}

function interceptModel(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length !== 1) return { kind: "error", text: "/model <provider>/<modelId>" };
  const parsed = parseModelArg(args[0]!);
  if (parsed.kind === "error") return parsed;
  void deps.platform.execute({ name: "setDefaultModel", provider: parsed.provider, id: parsed.modelId, effort: "off", contextWindow: null })
    .then(() => undefined, (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      deps.stateStore.dispatch(Actions.setErrorMessage(`/model failed: ${reason}`));
    });
  return { kind: "reply", text: `default model set to ${parsed.provider}/${parsed.modelId}` };
}

function interceptTeam(args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  if (args.length === 0) {
    void deps.platform.execute({ name: "getTeamInfo" })
      .then((info) => {
        deps.stateStore.dispatch(Actions.setTransientMessage(formatTeamListReply(info.defaultTeam, info.installed)));
      }, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        deps.stateStore.dispatch(Actions.setErrorMessage(`/team failed: ${reason}`));
      });
    return { kind: "reply", text: "loading team list…" };
  }
  const argument = args[0]!;
  void deps.platform.execute({ name: "team", teamId: argument })
    .then((identity) => {
      deps.stateStore.dispatch(Actions.switchTeam(identity));
    }, (error: unknown) => {
      if (error instanceof JiePlatformError) {
        deps.stateStore.dispatch(Actions.setErrorMessage(error.message));
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      deps.stateStore.dispatch(Actions.setErrorMessage(`load team '${argument}' failed: ${reason}`));
    });
  return { kind: "reply", text: `loading team '${argument}'` };
}

function interceptResume(_args: ReadonlyArray<string>, deps: CommandHandlerDeps): InterceptResult {
  const teamId = deps.stateStore.getState().teamId;
  if (teamId === null) return { kind: "error", text: "/resume: no team loaded" };
  void deps.platform.execute({ name: "listSessions", teamId })
    .then((sessions) => {
      deps.stateStore.dispatch(Actions.openSessionPicker(sessions));
    }, (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      deps.stateStore.dispatch(Actions.setErrorMessage(`/resume failed: ${reason}`));
    });
  return { kind: "reply", text: "loading sessions…" };
}

const INTERCEPTS: ReadonlyMap<string, InterceptFn> = new Map<string, InterceptFn>([
  ["login", interceptLogin],
  ["logout", interceptLogout],
  ["model", interceptModel],
  ["team", interceptTeam],
  ["resume", interceptResume],
  ["continue", interceptResume],
]);
