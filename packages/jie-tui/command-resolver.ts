import { isEffortLevel, type Command, type JiePlatform } from "@cuzfrog/jie-platform";
import { TuiState } from "./state";
import { COMMAND_METADATA, resolveCommandName, type CommandMeta } from "./command-metadata";
import { matchesModelFilter, type ModelRef } from "./model-filter";

export type ResolvedCommand =
  | { readonly kind: "ui"; readonly action: UiAction }
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "platform"; readonly slashName: string; readonly command: Command; readonly transient?: string }
  | { readonly kind: "error"; readonly text: string };

export type UiAction = "clearState" | "showHelp" | "stop" | "cycleKanbanView";

type AgentRoute = { readonly teamId: string; readonly agentKey: string };

export interface CommandResolver {
  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand>;
}

export class CommandResolverImpl implements CommandResolver {
  private readonly platform: JiePlatform;

  constructor(platform: JiePlatform) {
    this.platform = platform;
  }

  resolve(state: TuiState, name: string, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const canonical = resolveCommandName(name);
    const meta = COMMAND_METADATA.find((command) => command.name === canonical);
    if (meta === undefined) {
      return { kind: "error", text: `unknown slash command: /${name}` };
    }

    switch (canonical) {
      case "help":
        return { kind: "ui", action: "showHelp" };
      case "clear":
        return { kind: "ui", action: "clearState" };
      case "exit":
        return { kind: "ui", action: "stop" };
      case "login":
        return this.resolveLogin(meta, args);
      case "logout":
        return this.resolveLogout(meta, args);
      case "model":
        return this.resolveModel(meta, args);
      case "model-filter":
        return this.resolveModelFilter(args);
      case "effort":
        return this.resolveEffort(args);
      case "compact":
        return this.resolveCompact(state);
      case "reload":
        return this.resolveReload(state);
      case "team":
        return this.resolveTeam(meta, args);
      case "resume":
        return this.resolveResume(state, args);
      case "rename":
        return this.resolveRename(state, args);
      case "kanban":
        return this.resolveKanban(state, args);
      case "notification":
        return this.resolveNotification(args);
      default:
        return { kind: "error", text: `unknown slash command: /${name}` };
    }
  }

  private resolveLogin(meta: CommandMeta, args: ReadonlyArray<string>): ResolvedCommand {
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/login <provider> <apiKey>" };
    const provider = parsed.provider;
    const apiKey = parsed.apiKey;
    if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
    return {
      kind: "platform",
      slashName: "login",
      command: { name: "login", provider, apiKey },
      transient: `logged in to ${provider}`,
    };
  }

  private resolveLogout(meta: CommandMeta, args: ReadonlyArray<string>): ResolvedCommand {
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/logout <provider>|*" };
    const provider = parsed.provider;
    if (provider === undefined) return { kind: "error", text: "/logout <provider>|*" };
    return {
      kind: "platform",
      slashName: "logout",
      command: { name: "logout", provider },
      transient: provider === "*" ? "logged out of all providers" : `logged out of ${provider}`,
    };
  }

  private resolveModel(meta: CommandMeta, args: ReadonlyArray<string>): ResolvedCommand {
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/model <provider>/<modelId>" };
    const modelRef = parsed.modelRef;
    if (modelRef === undefined) return { kind: "error", text: "/model <provider>/<modelId>" };
    const parsedModel = CommandResolverImpl.parseModelArg(modelRef);
    if (parsedModel.kind === "error") return { kind: "error", text: parsedModel.text };
    return {
      kind: "platform",
      slashName: "model",
      command: { name: "setDefaultModel", provider: parsedModel.provider, id: parsedModel.modelId },
      transient: `default model set to ${parsedModel.provider}/${parsedModel.modelId}`,
    };
  }

  private resolveModelFilter(args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const meta = COMMAND_METADATA.find((m) => m.name === "model-filter")!;
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: CommandResolverImpl.MODEL_FILTER_USAGE };
    const action = parsed.action;
    if (action === undefined) return { kind: "error", text: CommandResolverImpl.MODEL_FILTER_USAGE };
    if (action === "list") {
      return parsed.pattern === undefined ? this.queryModelFilterList() : { kind: "error", text: CommandResolverImpl.MODEL_FILTER_USAGE };
    }

    const pattern = parsed.pattern;
    const adding = action === "add";
    if ((!adding && action !== "remove") || pattern === undefined || pattern === "") {
      return { kind: "error", text: CommandResolverImpl.MODEL_FILTER_USAGE };
    }
    return this.queryModelFilterModify(adding, pattern);
  }

  private async queryModelFilterList(): Promise<ResolvedCommand> {
    try {
      const filters = await this.platform.execute({ name: "getModelFilters" });
      const text = filters.length === 0 ? "no model filters set" : `model filters: ${filters.join(" · ")}`;
      return { kind: "reply", text };
    } catch (error) {
      return { kind: "error", text: CommandResolverImpl.formatError("model-filter", error) };
    }
  }

  private async queryModelFilterModify(adding: boolean, pattern: string): Promise<ResolvedCommand> {
    try {
      const [filters, models] = await Promise.all([this.platform.execute({ name: "getModelFilters" }), this.platform.execute({ name: "listModels" })]);
      const next = adding ? CommandResolverImpl.appendPattern(filters, pattern) : CommandResolverImpl.removePattern(filters, pattern);
      if (next === null) {
        return { kind: "error", text: `/model-filter: pattern '${pattern}' is not set` };
      }
      const available = models.filter((model) => model.available);
      const rejection = adding ? CommandResolverImpl.filterAdditionRejection(pattern, filters, next, available) : null;
      if (rejection !== null) {
        return { kind: "error", text: rejection };
      }
      return {
        kind: "platform",
        slashName: "model-filter",
        command: { name: "setModelFilters", filters: next },
        transient: `model filter ${adding ? "added" : "removed"}: ${pattern}`,
      };
    } catch (error) {
      return { kind: "error", text: CommandResolverImpl.formatError("model-filter", error) };
    }
  }

  private resolveEffort(args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const meta = COMMAND_METADATA.find((m) => m.name === "effort")!;
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/effort: invalid arguments" };
    const argument = parsed.level;
    if (argument === undefined) return this.queryDefaultEffort();
    if (!isEffortLevel(argument)) {
      return { kind: "error", text: `/effort: invalid '${argument}' (expected off | low | medium | high | max)` };
    }
    return {
      kind: "platform",
      slashName: "effort",
      command: { name: "setDefaultEffort", effort: argument },
      transient: `effort set to ${argument}`,
    };
  }

  private async queryDefaultEffort(): Promise<ResolvedCommand> {
    try {
      const effort = await this.platform.execute({ name: "getDefaultEffort" });
      return { kind: "reply", text: `default effort: ${effort}` };
    } catch (error) {
      return { kind: "error", text: CommandResolverImpl.formatError("effort", error) };
    }
  }

  private resolveCompact(state: TuiState): ResolvedCommand {
    const focused = TuiState.getFocusedAgent(state);
    if (focused !== null && focused.status === "busy") {
      return { kind: "error", text: "wait for the current response to finish before compacting" };
    }
    const route = this.resolveRoute(state);
    if (route === null) return { kind: "error", text: "/compact: no focused agent" };
    return {
      kind: "platform",
      slashName: "compact",
      command: { name: "compact", teamId: route.teamId, agentKey: route.agentKey },
      transient: "compacting conversation...",
    };
  }

  private resolveReload(state: TuiState): ResolvedCommand {
    if (TuiState.isBusy(state)) {
      return { kind: "error", text: "wait for the current response to finish before reloading" };
    }
    return {
      kind: "platform",
      slashName: "reload",
      command: { name: "reload" },
      transient: "reloaded settings, manifests, and context files",
    };
  }

  private resolveTeam(meta: CommandMeta, args: ReadonlyArray<string>): ResolvedCommand {
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/team <teamId>" };
    const teamId = parsed.teamId;
    if (teamId === undefined) return { kind: "error", text: "/team <teamId>" };
    return {
      kind: "platform",
      slashName: "team",
      command: { name: "team", teamId },
      transient: `loading team '${teamId}'`,
    };
  }

  private resolveResume(state: TuiState, args: ReadonlyArray<string>): ResolvedCommand {
    const meta = COMMAND_METADATA.find((m) => m.name === "resume")!;
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/resume <sessionId>" };
    const sessionId = parsed.sessionId;
    if (sessionId === undefined) return { kind: "error", text: "/resume <sessionId>" };
    const teamId = state.teamId;
    if (teamId === null) return { kind: "error", text: "/resume: no team loaded" };
    return {
      kind: "platform",
      slashName: "resume",
      command: { name: "resumeSession", teamId, sessionId },
      transient: `resuming session '${sessionId}'`,
    };
  }

  private resolveRename(state: TuiState, args: ReadonlyArray<string>): ResolvedCommand {
    const meta = COMMAND_METADATA.find((m) => m.name === "rename")!;
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/rename <name>" };
    const name = parsed.name;
    if (name === undefined || name === "") return { kind: "error", text: "/rename <name>" };
    const teamId = state.teamId;
    if (teamId === null) return { kind: "error", text: "/rename: no team loaded" };
    return {
      kind: "platform",
      slashName: "rename",
      command: { name: "renameSession", teamId, sessionName: name },
      transient: `session renamed to ${name}`,
    };
  }

  private resolveKanban(state: TuiState, args: ReadonlyArray<string>): ResolvedCommand {
    const meta = COMMAND_METADATA.find((m) => m.name === "kanban")!;
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/kanban <add|remove|complete|review>" };
    const subcommand = parsed.subcommand;
    if (subcommand === undefined) {
      return { kind: "ui", action: "cycleKanbanView" };
    }

    const teamId = state.teamId;
    if (teamId === null) return { kind: "error", text: "/kanban: no team loaded" };
    const rest = parsed.rest ?? "";
    const restArgs = rest.split(/\s+/).filter((s) => s !== "");

    if (subcommand === "add") {
      const parsedAdd = CommandResolverImpl.parseKanbanAddArgs(restArgs);
      if (parsedAdd.kind === "error") return { kind: "error", text: parsedAdd.text };
      return {
        kind: "platform",
        slashName: "kanban add",
        command: { name: "kanbanAdd", teamId, title: parsedAdd.title, description: parsedAdd.description, scope: parsedAdd.scope },
      };
    }

    if (subcommand === "remove" || subcommand === "complete" || subcommand === "review") {
      const cardId = restArgs[0];
      if (cardId === undefined) return { kind: "error", text: `/kanban ${subcommand} <cardId>` };
      if (subcommand === "remove") {
        return { kind: "platform", slashName: `kanban ${subcommand}`, command: { name: "kanbanRemove", teamId, cardId } };
      }
      return {
        kind: "platform",
        slashName: `kanban ${subcommand}`,
        command: { name: "kanbanSetStatus", teamId, cardId, status: subcommand === "complete" ? "completed" : "in_review" },
      };
    }

    return { kind: "error", text: `/kanban: unknown subcommand '${subcommand}'` };
  }

  private resolveNotification(args: ReadonlyArray<string>): ResolvedCommand {
    const meta = COMMAND_METADATA.find((m) => m.name === "notification")!;
    const parsed = CommandResolverImpl.parseArgs(args, meta);
    if (parsed === null) return { kind: "error", text: "/notification sound enable|disable" };
    const subcommand = parsed.subcommand;
    if (subcommand !== "sound") {
      return { kind: "error", text: "/notification sound enable|disable" };
    }
    const value = parsed.value;
    if (value !== "enable" && value !== "disable") {
      return { kind: "error", text: "/notification sound enable|disable" };
    }
    const enabled = value === "enable";
    return {
      kind: "platform",
      slashName: "notification sound",
      command: { name: "setNotificationSoundEnabled", enabled },
      transient: `sound notifications ${enabled ? "enabled" : "disabled"}`,
    };
  }

  private static readonly MODEL_FILTER_USAGE = "/model-filter <add|remove|list> <pattern>";

  private resolveRoute(state: TuiState): AgentRoute | null {
    const focused = TuiState.getFocusedAgent(state);
    if (focused !== null) return { teamId: focused.teamId, agentKey: focused.agentKey };
    if (state.leaderAgentId !== null) {
      const leader = state.agents.get(state.leaderAgentId) ?? null;
      if (leader !== null) return { teamId: leader.teamId, agentKey: leader.agentKey };
    }
    return null;
  }

  private static formatError(slashName: string, error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    return `/${slashName} failed: ${reason}`;
  }

  private static parseArgs(args: ReadonlyArray<string>, meta: CommandMeta): Record<string, string | undefined> | null {
    if (meta.arguments === undefined || meta.arguments.length === 0) {
      return args.length === 0 ? {} : null;
    }

    const values: Record<string, string | undefined> = {};
    let remaining = [...args];
    for (let i = 0; i < meta.arguments.length; i++) {
      const spec = meta.arguments[i]!;
      if (remaining.length === 0) {
        if (!spec.optional) return null;
        values[spec.name] = undefined;
        continue;
      }
      if (spec.greedy) {
        values[spec.name] = remaining.join(" ");
        remaining = [];
      } else {
        values[spec.name] = remaining.shift()!;
      }
    }
    return remaining.length === 0 ? values : null;
  }

  private static parseModelArg(arg: string): { kind: "ok"; provider: string; modelId: string } | { kind: "error"; text: string } {
    const slash = arg.indexOf("/");
    if (slash === -1) return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
    const provider = arg.slice(0, slash);
    const modelId = arg.slice(slash + 1);
    return { kind: "ok", provider, modelId };
  }

  private static parseKanbanAddArgs(args: ReadonlyArray<string>): { kind: "ok"; title?: string; description: string; scope?: "session" } | { kind: "error"; text: string } {
    const flags = { title: undefined as string | undefined, ephemeral: false };
    let index = 0;
    while (index < args.length && args[index]!.startsWith("--")) {
      const flag = args[index]!;
      if (flag === "--title") {
        if (args[index + 1] === undefined) return { kind: "error", text: "/kanban add [--ephemeral] --title <title> <description>" };
        flags.title = args[index + 1]!;
        index += 2;
      } else if (flag === "--ephemeral") {
        flags.ephemeral = true;
        index += 1;
      } else {
        return { kind: "error", text: `/kanban add: unknown flag '${flag}'` };
      }
    }
    const description = args.slice(index).join(" ");
    if (description.trim() === "") return { kind: "error", text: "/kanban add [--ephemeral] [--title <title>] <description>" };
    return { kind: "ok", title: flags.title, description, ...(flags.ephemeral ? { scope: "session" as const } : {}) };
  }

  private static appendPattern(filters: ReadonlyArray<string>, pattern: string): ReadonlyArray<string> {
    return filters.includes(pattern) ? filters : [...filters, pattern];
  }

  private static removePattern(filters: ReadonlyArray<string>, pattern: string): ReadonlyArray<string> | null {
    if (!filters.includes(pattern)) return null;
    return filters.filter((existing) => existing !== pattern);
  }

  private static filterAdditionRejection(
    pattern: string,
    existing: ReadonlyArray<string>,
    combined: ReadonlyArray<string>,
    available: ReadonlyArray<ModelRef>,
  ): string | null {
    if (available.length === 0 || available.some((model) => matchesModelFilter(model, combined))) return null;
    const basis = existing.length === 0 ? "it matches none" : `combined with existing filters (${existing.join(", ")}) it matches none`;
    return `/model-filter: pattern '${pattern}' rejected — ${basis} of the ${available.length} available models`;
  }
}
