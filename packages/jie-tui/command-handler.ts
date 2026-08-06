import { isEffortLevel, JiePlatformError, type CommandName, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, TuiState, type AgentUiState, type StateStore } from "./state";
import { bashDirective, parseBashCommand } from "./bash";
import { matchesModelFilter, type ModelRef } from "./model-filter";

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

type InterceptName = "model" | "model-filter" | "effort" | "reload" | "resume" | "rename" | "kanban" | Extract<CommandName, "login" | "logout" | "team">;

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

    if (name.startsWith("skill:")) {
      this.routeSkillInvocation(name, trimmed);
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

  private routeSkillInvocation(name: string, trimmed: string): void {
    const skillName = name.slice("skill:".length);
    if (skillName === "") {
      this.stateStore.dispatch(Actions.setErrorMessage("usage: /skill:<name> [args]"));
      return;
    }
    const agent = routeTargetAgent(this.stateStore);
    if (agent === null) {
      this.stateStore.dispatch(Actions.setErrorMessage("no team loaded — load a team first"));
      return;
    }
    if (!agent.skills.some((skill) => skill.name === skillName)) {
      this.stateStore.dispatch(Actions.setErrorMessage(`skill '${skillName}' is not available on agent '${agent.agentKey}'`));
      return;
    }
    this.platform.prompt(agent.teamId, agent.agentKey, trimmed);
  }

  private runIntercepts(name: string, args: ReadonlyArray<string>): InterceptResult {
    switch (name) {
      case "login": return this.interceptLogin(args);
      case "logout": return this.interceptLogout(args);
      case "model": return this.interceptModel(args);
      case "model-filter": return this.interceptModelFilter(args);
      case "effort": return this.interceptEffort(args);
      case "reload": return this.interceptReload();
      case "team": return this.interceptTeam(args);
      case "resume": return this.interceptResume(args);
      case "rename": return this.interceptRename(args);
      case "kanban": return this.interceptKanban(args);
      default: return null;
    }
  }

  private interceptLogin(args: ReadonlyArray<string>): InterceptResult {
    if (args.length !== 2) return { kind: "error", text: "/login <provider> <apiKey>" };
    const [provider, apiKey] = args;
    if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
    void this.platform.execute({ name: "login", provider, apiKey })
      .then(() => undefined, (error: unknown) => {
        const reason = errorReason(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/login failed: ${reason}`));
      });
    return { kind: "reply", text: `logged in to ${provider}` };
  }

  private interceptLogout(args: ReadonlyArray<string>): InterceptResult {
    const provider = args[0];
    if (provider === undefined) return { kind: "error", text: "/logout <provider>|*" };
    void this.platform.execute({ name: "logout", provider })
      .then(() => undefined, (error: unknown) => {
        const reason = errorReason(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/logout failed: ${reason}`));
      });
    return { kind: "reply", text: provider === "*" ? "logged out of all providers" : `logged out of ${provider}` };
  }

  private interceptModel(args: ReadonlyArray<string>): InterceptResult {
    if (args.length !== 1) return { kind: "error", text: "/model <provider>/<modelId>" };
    const parsed = parseModelArg(args[0]!);
    if (parsed.kind === "error") return parsed;
    void this.platform.execute({ name: "setDefaultModel", provider: parsed.provider, id: parsed.modelId })
      .then(() => undefined, (error: unknown) => {
        const reason = errorReason(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/model failed: ${reason}`));
      });
    return { kind: "reply", text: `default model set to ${parsed.provider}/${parsed.modelId}` };
  }

  private interceptModelFilter(args: ReadonlyArray<string>): InterceptResult {
    const action = args[0];
    if (action === "list") {
      if (args.length !== 1) return { kind: "error", text: MODEL_FILTER_USAGE };
      void this.platform.execute({ name: "getModelFilters" })
        .then((filters) => {
          const text = filters.length === 0 ? "no model filters set" : `model filters: ${filters.join(" · ")}`;
          this.stateStore.dispatch(Actions.setTransientMessage(text));
        }, (error: unknown) => {
          this.stateStore.dispatch(Actions.setErrorMessage(`/model-filter failed: ${errorReason(error)}`));
        });
      return { kind: "silent" };
    }
    const pattern = args[1];
    const adding = action === "add";
    if ((!adding && action !== "remove") || pattern === undefined || pattern === "") {
      return { kind: "error", text: MODEL_FILTER_USAGE };
    }
    void Promise.all([this.platform.execute({ name: "getModelFilters" }), this.platform.execute({ name: "listModels" })])
      .then(([filters, models]) => {
        const next = adding ? appendPattern(filters, pattern) : removePattern(filters, pattern);
        if (next === null) {
          this.stateStore.dispatch(Actions.setErrorMessage(`/model-filter: pattern '${pattern}' is not set`));
          return;
        }
        const rejection = adding ? filterAdditionRejection(pattern, filters, next, models.filter((model) => model.available)) : null;
        if (rejection !== null) {
          this.stateStore.dispatch(Actions.setErrorMessage(rejection));
          return;
        }
        void this.platform.execute({ name: "setModelFilters", filters: next })
          .then(() => {
            this.stateStore.dispatch(Actions.setTransientMessage(`model filter ${adding ? "added" : "removed"}: ${pattern}`));
          }, (error: unknown) => {
            this.stateStore.dispatch(Actions.setErrorMessage(`/model-filter failed: ${errorReason(error)}`));
          });
      }, (error: unknown) => {
        this.stateStore.dispatch(Actions.setErrorMessage(`/model-filter failed: ${errorReason(error)}`));
      });
    return { kind: "silent" };
  }

  private interceptEffort(args: ReadonlyArray<string>): InterceptResult {
    const argument = args[0];
    if (argument === undefined) {
      void this.platform.execute({ name: "getDefaultEffort" })
        .then((effort) => {
          this.stateStore.dispatch(Actions.setTransientMessage(`default effort: ${effort}`));
        }, (error: unknown) => {
          const reason = errorReason(error);
          this.stateStore.dispatch(Actions.setErrorMessage(`/effort failed: ${reason}`));
        });
      return { kind: "silent" };
    }
    if (!isEffortLevel(argument)) {
      return { kind: "error", text: `/effort: invalid '${argument}' (expected off | low | medium | high | max)` };
    }
    void this.platform.execute({ name: "setDefaultEffort", effort: argument })
      .then(() => undefined, (error: unknown) => {
        const reason = errorReason(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/effort failed: ${reason}`));
      });
    return { kind: "reply", text: `effort set to ${argument}` };
  }

  private interceptReload(): InterceptResult {
    if (TuiState.isBusy(this.stateStore.getState())) {
      return { kind: "error", text: "wait for the current response to finish before reloading" };
    }
    void this.platform.execute({ name: "reload" })
      .then((teams) => {
        const activeTeamId = this.stateStore.getState().teamId;
        const active = teams.find((team) => team.id === activeTeamId);
        if (active !== undefined) this.stateStore.dispatch(Actions.switchTeam(active));
      }, (error: unknown) => {
        const reason = errorReason(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/reload failed: ${reason}`));
      });
    return { kind: "reply", text: "reloaded settings, manifests, and context files" };
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
        const reason = errorReason(error);
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
      .then(() => {
        this.stateStore.dispatch(Actions.setSessionName(name));
      }, (error: unknown) => {
        const reason = errorReason(error);
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
        const reason = errorReason(error);
        this.stateStore.dispatch(Actions.setErrorMessage(`/resume failed: ${reason}`));
      });
    return { kind: "reply", text: `resuming session '${sessionId}'` };
  }

  private interceptKanban(args: ReadonlyArray<string>): InterceptResult {
    const subcommand = args[0];
    if (subcommand === undefined) {
      this.stateStore.dispatch(Actions.cycleKanbanView());
      return { kind: "silent" };
    }
    const teamId = this.stateStore.getState().teamId;
    if (teamId === null) return { kind: "error", text: "/kanban: no team loaded" };
    if (subcommand === "add") {
      const parsed = parseKanbanAddArgs(args.slice(1));
      if (parsed.kind === "error") return parsed;
      void this.platform.execute({ name: "kanbanAdd", teamId, title: parsed.title, description: parsed.description })
        .then((result) => {
          this.stateStore.dispatch(Actions.setKanbanBoard(result.board));
          this.stateStore.dispatch(Actions.setTransientMessage(`added kanban card ${result.card.id}`));
        }, (error: unknown) => {
          const reason = errorReason(error);
          this.stateStore.dispatch(Actions.setErrorMessage(`/kanban add failed: ${reason}`));
        });
      return { kind: "silent" };
    }
    if (subcommand === "remove" || subcommand === "complete") {
      const cardId = args[1];
      if (cardId === undefined) return { kind: "error", text: `/kanban ${subcommand} <cardId>` };
      const command = subcommand === "remove"
        ? { name: "kanbanRemove", teamId, cardId } as const
        : { name: "kanbanComplete", teamId, cardId } as const;
      void this.platform.execute(command)
        .then((result) => {
          this.stateStore.dispatch(Actions.setKanbanBoard(result.board));
        }, (error: unknown) => {
          const reason = errorReason(error);
          this.stateStore.dispatch(Actions.setErrorMessage(`/kanban ${subcommand} failed: ${reason}`));
        });
      return { kind: "silent" };
    }
    return { kind: "error", text: `/kanban: unknown subcommand '${subcommand}'` };
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

const INTERCEPT_NAMES = ["login", "logout", "model", "model-filter", "effort", "reload", "team", "resume", "rename", "kanban"] as const satisfies ReadonlyArray<InterceptName>;

function parseKanbanAddArgs(args: ReadonlyArray<string>): { kind: "ok"; title?: string; description: string } | { kind: "error"; text: string } {
  if (args[0] === "--title") {
    if (args[1] === undefined) return { kind: "error", text: "/kanban add --title <title> <description>" };
    const description = args.slice(2).join(" ");
    if (description.trim() === "") return { kind: "error", text: "/kanban add --title <title> <description>" };
    return { kind: "ok", title: args[1], description };
  }
  const description = args.join(" ");
  if (description.trim() === "") return { kind: "error", text: "/kanban add <description>" };
  return { kind: "ok", description };
}

const MODEL_FILTER_USAGE = "/model-filter <add|remove|list> <pattern>";

export const SLASH_COMMAND_NAMES: ReadonlyArray<TuiCommandName> = [...LOCAL_COMMAND_NAMES, ...INTERCEPT_NAMES];

function parseModelArg(arg: string): { kind: "ok"; provider: string; modelId: string } | { kind: "error"; text: string } {
  const slash = arg.indexOf("/");
  if (slash === -1) return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
  const provider = arg.slice(0, slash);
  const modelId = arg.slice(slash + 1);
  return { kind: "ok", provider, modelId };
}

function appendPattern(filters: ReadonlyArray<string>, pattern: string): ReadonlyArray<string> {
  return filters.includes(pattern) ? filters : [...filters, pattern];
}

function removePattern(filters: ReadonlyArray<string>, pattern: string): ReadonlyArray<string> | null {
  if (!filters.includes(pattern)) return null;
  return filters.filter((existing) => existing !== pattern);
}

function filterAdditionRejection(
  pattern: string,
  existing: ReadonlyArray<string>,
  combined: ReadonlyArray<string>,
  available: ReadonlyArray<ModelRef>,
): string | null {
  if (available.length === 0 || available.some((model) => matchesModelFilter(model, combined))) return null;
  const basis = existing.length === 0 ? "it matches none" : `combined with existing filters (${existing.join(", ")}) it matches none`;
  return `/model-filter: pattern '${pattern}' rejected — ${basis} of the ${available.length} available models`;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function routeTarget(stateStore: StateStore): AgentRoute | null {
  const agent = routeTargetAgent(stateStore);
  return agent === null ? null : { teamId: agent.teamId, agentKey: agent.agentKey };
}

function routeTargetAgent(stateStore: StateStore): AgentUiState | null {
  const state = stateStore.getState();
  return agentAt(state, state.focusedAgentId) ?? agentAt(state, state.leaderAgentId);
}

function agentAt(state: TuiState, agentId: TuiState["focusedAgentId"]): AgentUiState | null {
  if (agentId === null) return null;
  return state.agents.get(agentId) ?? null;
}
