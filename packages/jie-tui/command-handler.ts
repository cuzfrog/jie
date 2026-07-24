import { isEffortLevel, JiePlatformError, type CommandName, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type StateStore, type TuiState } from "./state";
import { bashDirective, parseBashCommand } from "./bash";

type CommandOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "clearState" }
  | { readonly kind: "showHelp" }
  | { readonly kind: "stop" };

interface SlashCommand {
  readonly name: string;
  readonly run: (args: ReadonlyArray<string>) => CommandOutcome;
}

type InterceptResult = { kind: "reply"; text: string } | { kind: "error"; text: string } | { kind: "silent" } | null;

interface AgentRoute {
  readonly teamId: string;
  readonly agentKey: string;
}

type InterceptName = "model" | "effort" | "resume" | "rename" | Extract<CommandName, "login" | "logout" | "team">;

type TuiCommandName = "help" | "clear" | "exit" | InterceptName;

export interface CommandHandler {
  handle(text: string): void;
}

export class CommandHandlerImpl implements CommandHandler {
  private readonly stateStore: StateStore;
  private readonly platform: JiePlatform;

  constructor(stateStore: StateStore, platform: JiePlatform) {
    this.stateStore = stateStore;
    this.platform = platform;
  }

  handle(text: string): void {
    this.stateStore.dispatch(Actions.clearBanners());
    const trimmed = text.trim();
    if (trimmed.startsWith("!")) {
      this.routeBash(trimmed);
      return;
    }
    if (!trimmed.startsWith("/")) {
      this.routePrompt(trimmed);
      return;
    }
    const parts = trimmed.split(/\s+/);
    const rawName = parts[0]!;
    const name = rawName.slice(1);
    const args = parts.slice(1);

    const intercepted = this.runIntercepts(name, args);
    if (intercepted !== null) {
      if (intercepted.kind === "reply") this.stateStore.dispatch(Actions.setTransientMessage(intercepted.text));
      else if (intercepted.kind === "error") this.stateStore.dispatch(Actions.setErrorMessage(intercepted.text));
      return;
    }

    const outcome = runCommand(trimmed);
    switch (outcome.kind) {
      case "clearState":
        this.stateStore.dispatch(Actions.clearTuiState());
        return;
      case "showHelp":
        this.stateStore.dispatch(Actions.showHelp());
        return;
      case "stop":
        this.stateStore.dispatch(Actions.requestQuit());
        return;
      case "reply":
        this.stateStore.dispatch(Actions.setTransientMessage(outcome.text));
        return;
      case "error":
        this.stateStore.dispatch(Actions.setErrorMessage(outcome.text));
        return;
    }
  }

  private routeBash(trimmed: string): void {
    const bash = parseBashCommand(trimmed);
    if (bash === null) {
      this.stateStore.dispatch(Actions.setErrorMessage("bash mode requires a command after !"));
      return;
    }
    const target = routeTarget(this.stateStore);
    if (target === null) {
      this.stateStore.dispatch(Actions.setErrorMessage("no team loaded — load a team first"));
      return;
    }
    this.platform.prompt(target.teamId, target.agentKey, bashDirective(bash));
  }

  private routePrompt(trimmed: string): void {
    const target = routeTarget(this.stateStore);
    if (target === null) {
      this.stateStore.dispatch(Actions.setErrorMessage("no team loaded — load a team first"));
      return;
    }
    this.platform.prompt(target.teamId, target.agentKey, trimmed);
  }

  private runIntercepts(name: string, args: ReadonlyArray<string>): InterceptResult {
    switch (name) {
      case "login": return this.interceptLogin(args);
      case "logout": return this.interceptLogout(args);
      case "model": return this.interceptModel(args);
      case "effort": return this.interceptEffort(args);
      case "team": return this.interceptTeam(args);
      case "resume": return this.interceptResume(args);
      case "rename": return this.interceptRename(args);
      default: return null;
    }
  }

  private interceptLogin(args: ReadonlyArray<string>): InterceptResult {
    if (args.length !== 2) return { kind: "error", text: "/login <provider> <apiKey>" };
    const [provider, apiKey] = args;
    if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
    void this.platform.execute({ name: "login", provider, apiKey })
      .then(() => undefined, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/login failed: ${reason}`));
      });
    return { kind: "reply", text: `logged in to ${provider}` };
  }

  private interceptLogout(args: ReadonlyArray<string>): InterceptResult {
    const provider = args[0];
    void this.platform.execute({ name: "logout", provider })
      .then(() => undefined, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/logout failed: ${reason}`));
      });
    return { kind: "reply", text: provider === undefined ? "logged out of all providers" : `logged out of ${provider}` };
  }

  private interceptModel(args: ReadonlyArray<string>): InterceptResult {
    if (args.length !== 1) return { kind: "error", text: "/model <provider>/<modelId>" };
    const parsed = parseModelArg(args[0]!);
    if (parsed.kind === "error") return parsed;
    void this.platform.execute({ name: "setDefaultModel", provider: parsed.provider, id: parsed.modelId })
      .then(() => undefined, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/model failed: ${reason}`));
      });
    return { kind: "reply", text: `default model set to ${parsed.provider}/${parsed.modelId}` };
  }

  private interceptEffort(args: ReadonlyArray<string>): InterceptResult {
    const argument = args[0];
    if (argument === undefined) {
      void this.platform.execute({ name: "getDefaultEffort" })
        .then((effort) => {
          this.stateStore.dispatch(Actions.setTransientMessage(`default effort: ${effort}`));
        }, (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.stateStore.dispatch(Actions.setErrorMessage(`/effort failed: ${reason}`));
        });
      return { kind: "silent" };
    }
    if (!isEffortLevel(argument)) {
      return { kind: "error", text: `/effort: invalid '${argument}' (expected off | low | medium | high | max)` };
    }
    void this.platform.execute({ name: "setDefaultEffort", effort: argument })
      .then(() => undefined, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/effort failed: ${reason}`));
      });
    return { kind: "reply", text: `default effort set to ${argument}` };
  }

  private interceptTeam(args: ReadonlyArray<string>): InterceptResult {
    const argument = args[0];
    if (argument === undefined) return { kind: "error", text: "/team <teamId>" };
    void this.platform.execute({ name: "team", teamId: argument })
      .then((identity) => {
        this.stateStore.dispatch(Actions.switchTeam(identity));
      }, (error: unknown) => {
        if (error instanceof JiePlatformError) {
          this.stateStore.dispatch(Actions.setErrorMessage(error.message));
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`load team '${argument}' failed: ${reason}`));
      });
    return { kind: "reply", text: `loading team '${argument}'` };
  }

  private interceptRename(args: ReadonlyArray<string>): InterceptResult {
    const name = args.join(" ");
    if (name === "") return { kind: "error", text: "/rename <name>" };
    const teamId = this.stateStore.getState().teamId;
    if (teamId === null) return { kind: "error", text: "/rename: no team loaded" };
    void this.platform.execute({ name: "renameSession", teamId, sessionName: name })
      .then(() => undefined, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/rename failed: ${reason}`));
      });
    return { kind: "reply", text: `session renamed to ${name}` };
  }

  private interceptResume(args: ReadonlyArray<string>): InterceptResult {
    const sessionId = args[0];
    if (sessionId === undefined) return { kind: "error", text: "/resume <sessionId>" };
    const teamId = this.stateStore.getState().teamId;
    if (teamId === null) return { kind: "error", text: "/resume: no team loaded" };
    void this.platform.execute({ name: "resumeSession", teamId, sessionId })
      .then((identity) => {
        this.stateStore.dispatch(Actions.switchTeam(identity));
      }, (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/resume failed: ${reason}`));
      });
    return { kind: "reply", text: `resuming session '${sessionId}'` };
  }
}

function runCommand(input: string): CommandOutcome {
  const parts = input.split(/\s+/);
  const rawName = parts[0]!;
  const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  const slashCommand = COMMANDS.get(name);
  if (slashCommand === undefined) return { kind: "error", text: `unknown slash command: ${rawName}` };
  return slashCommand.run(parts.slice(1));
}

const helpCommand: SlashCommand = {
  name: "help",
  run: () => ({ kind: "showHelp" }),
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

const LOCAL_COMMAND_NAMES = ["help", "clear", "exit"] as const satisfies ReadonlyArray<TuiCommandName>;

const INTERCEPT_NAMES = ["login", "logout", "model", "effort", "team", "resume", "rename"] as const satisfies ReadonlyArray<InterceptName>;

export const SLASH_COMMAND_NAMES: ReadonlyArray<TuiCommandName> = [...LOCAL_COMMAND_NAMES, ...INTERCEPT_NAMES];

function parseModelArg(arg: string): { kind: "ok"; provider: string; modelId: string } | { kind: "error"; text: string } {
  const slash = arg.indexOf("/");
  if (slash === -1) return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
  const provider = arg.slice(0, slash);
  const modelId = arg.slice(slash + 1);
  return { kind: "ok", provider, modelId };
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
