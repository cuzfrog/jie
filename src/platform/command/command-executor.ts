import type { Api, Model } from "@earendil-works/pi-ai";
import type { AuthStore, ModelRegistry, SettingsStore } from "../config";
import { Events, type EventManager } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import type { LlmService } from "../llm";
import type { GitService } from "../services";
import type { KanbanStore } from "../storage";
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
    private readonly eventManager: EventManager,
    private readonly kanbanStore: KanbanStore,
    private readonly llmService: LlmService,
  ) {
    this.handlers = {
      login: this.login.bind(this),
      logout: this.logout.bind(this),
      setApiKey: this.setApiKey.bind(this),
      setDefaultModel: this.setDefaultModel.bind(this),
      getDefaultModel: this.getDefaultModel.bind(this),
      setDefaultEffort: this.setDefaultEffort.bind(this),
      getDefaultEffort: this.getDefaultEffort.bind(this),
      listModels: this.listModels.bind(this),
      listFilteredModels: this.listFilteredModels.bind(this),
      listProviders: this.listProviders.bind(this),
      setModelFilters: this.setModelFilters.bind(this),
      getModelFilters: this.getModelFilters.bind(this),
      validateModelFilter: this.validateModelFilter.bind(this),
      setDefaultTeam: this.setDefaultTeam.bind(this),
      team: this.team.bind(this),
      reload: this.reload.bind(this),
      resumeSession: this.resumeSession.bind(this),
      renameSession: this.renameSession.bind(this),
      getTeamInfo: this.getTeamInfo.bind(this),
      getGitStatus: this.getGitStatus.bind(this),
      stop: this.stop.bind(this),
      listSessions: this.listSessions.bind(this),
      getNotificationSoundEnabled: this.getNotificationSoundEnabled.bind(this),
      setNotificationSoundEnabled: this.setNotificationSoundEnabled.bind(this),
      compact: this.compact.bind(this),
      kanbanAdd: this.kanbanAdd.bind(this),
      kanbanRemove: this.kanbanRemove.bind(this),
      kanbanSetStatus: this.kanbanSetStatus.bind(this),
      kanbanEdit: this.kanbanEdit.bind(this),
      kanbanHandoff: this.kanbanHandoff.bind(this),
      kanbanToggleTodo: this.kanbanToggleTodo.bind(this),
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
    if (command.provider === "*") {
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
    this.eventManager.publish(Events.userModelUpdate({ kind: "user" }, command.provider, command.id));
    return null;
  }

  private getDefaultModel(): CommandResult<"getDefaultModel"> {
    const settings = this.settingsStore.load();
    if (settings.defaultProvider === undefined || settings.defaultModel === undefined) return null;
    return {
      provider: settings.defaultProvider,
      id: settings.defaultModel,
      effort: settings.defaultEffort ?? "off",
      contextWindow: null,
    };
  }

  private setDefaultEffort(command: Command<"setDefaultEffort">): CommandResult<"setDefaultEffort"> {
    this.settingsStore.setDefaultEffort(command.effort);
    this.eventManager.publish(Events.userEffortUpdate({ kind: "user" }, command.effort));
    return null;
  }

  private getDefaultEffort(): CommandResult<"getDefaultEffort"> {
    return this.settingsStore.load().defaultEffort ?? "off";
  }

  private listModels(): CommandResult<"listModels"> {
    const auth = this.authStore.load();
    return this.modelRegistry.listProviders().flatMap((provider) => {
      const available = provider.configured || auth[provider.id] !== undefined;
      return this.modelRegistry.listModels(provider.id).map((model) => ({
        provider: provider.id,
        id: model.id,
        name: model.name,
        available,
      }));
    });
  }

  private listFilteredModels(): CommandResult<"listFilteredModels"> {
    const filters = this.settingsStore.load().modelFilters ?? [];
    const models = this.listModels().filter((model) => model.available);
    if (filters.length === 0) return { models, filteredOut: 0 };
    const target = (model: { readonly provider: string; readonly id: string }) => `${model.provider}/${model.id}`.toLowerCase();
    const matched = models.filter((model) => filters.some((filter) => target(model).includes(filter.toLowerCase())));
    return { models: matched, filteredOut: models.length - matched.length };
  }

  private listProviders(): CommandResult<"listProviders"> {
    return this.modelRegistry.listProviders().map((provider) => {
      const description = provider.envKeys[0] ?? (provider.configured ? "configured" : undefined);
      return description === undefined ? { id: provider.id } : { id: provider.id, description };
    });
  }

  private setModelFilters(command: Command<"setModelFilters">): CommandResult<"setModelFilters"> {
    this.settingsStore.setModelFilters(command.filters);
    return null;
  }

  private getModelFilters(): CommandResult<"getModelFilters"> {
    return this.settingsStore.load().modelFilters ?? [];
  }

  private validateModelFilter(command: Command<"validateModelFilter">): CommandResult<"validateModelFilter"> {
    const pattern = command.pattern;
    const existingFilters = command.existingFilters;
    if (existingFilters.includes(pattern)) return null;
    const combined = [...existingFilters, pattern];
    const models = this.listModels().filter((model) => model.available);
    if (models.length === 0) return null;
    const target = (model: { readonly provider: string; readonly id: string }) => `${model.provider}/${model.id}`.toLowerCase();
    if (models.some((model) => combined.some((filter) => target(model).includes(filter.toLowerCase())))) return null;
    const basis = existingFilters.length === 0 ? "it matches none" : `combined with existing filters (${existingFilters.join(", ")}) it matches none`;
    return `/model-filter: pattern '${pattern}' rejected — ${basis} of the ${models.length} available models`;
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

  private reload(): Promise<CommandResult<"reload">> {
    return this.teamManager.reload();
  }

  private resumeSession(command: Command<"resumeSession">): Promise<CommandResult<"resumeSession">> {
    return this.teamManager.resumeSession(command.teamId, command.sessionId);
  }

  private renameSession(command: Command<"renameSession">): CommandResult<"renameSession"> {
    this.teamManager.renameSession(command.teamId, command.sessionName);
    return null;
  }

  private getTeamInfo(): CommandResult<"getTeamInfo"> {
    const settings = this.settingsStore.load();
    return {
      defaultTeam: settings.defaultTeam ?? null,
      installed: this.teamManager.listInstalled().map((id) => ({ id, agentCount: this.teamManager.agentCount(id), location: this.teamManager.locate(id) })),
    };
  }

  private getGitStatus(): CommandResult<"getGitStatus"> {
    return this.gitService.getSnapshot();
  }

  private stop(): CommandResult<"stop"> {
    this.teamManager.stop();
    return null;
  }

  private async compact(command: Command<"compact">): Promise<CommandResult<"compact">> {
    await this.teamManager.compact(command.teamId, command.agentKey);
    return null;
  }

  private listSessions(command: Command<"listSessions">): CommandResult<"listSessions"> {
    return this.teamManager.listSessions(command.teamId);
  }

  private getNotificationSoundEnabled(): CommandResult<"getNotificationSoundEnabled"> {
    return this.settingsStore.load().notification?.soundEnabled ?? true;
  }

  private setNotificationSoundEnabled(command: Command<"setNotificationSoundEnabled">): CommandResult<"setNotificationSoundEnabled"> {
    this.settingsStore.setNotificationSoundEnabled(command.enabled);
    return null;
  }

  private async kanbanAdd(command: Command<"kanbanAdd">): Promise<CommandResult<"kanbanAdd">> {
    const sessionId = this.sessionIdFor(command.teamId);
    const content = await this.distillTitle(command.title, command.description);
    if (content.trim() === "") {
      throw new JiePlatformError("KANBAN_TEXT_EMPTY");
    }
    const description = command.description === "" || command.description === content ? undefined : command.description;
    const scope = command.scope ?? "team";
    const card = this.kanbanStore.add(command.teamId, sessionId, content, description, scope);
    if (card === null) {
      throw new JiePlatformError("KANBAN_DUPLICATE_CONTENT", { detail: content });
    }
    return { board: this.kanbanStore.load(command.teamId, sessionId), card };
  }

  private kanbanRemove(command: Command<"kanbanRemove">): CommandResult<"kanbanRemove"> {
    const sessionId = this.sessionIdFor(command.teamId);
    if (!this.kanbanStore.remove(command.teamId, sessionId, command.cardId)) {
      throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: command.cardId });
    }
    return { board: this.kanbanStore.load(command.teamId, sessionId) };
  }

  private kanbanSetStatus(command: Command<"kanbanSetStatus">): CommandResult<"kanbanSetStatus"> {
    const sessionId = this.sessionIdFor(command.teamId);
    if (!this.kanbanStore.setStatus(command.teamId, sessionId, command.cardId, command.status)) {
      throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: command.cardId });
    }
    return { board: this.kanbanStore.load(command.teamId, sessionId) };
  }

  private kanbanEdit(command: Command<"kanbanEdit">): CommandResult<"kanbanEdit"> {
    const sessionId = this.sessionIdFor(command.teamId);
    if (command.field === "description") {
      const description = command.text.trim() === "" ? undefined : command.text;
      if (this.kanbanStore.editDescription(command.teamId, sessionId, command.cardId, description) === null) {
        throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: command.cardId });
      }
      return { board: this.kanbanStore.load(command.teamId, sessionId) };
    }
    if (command.text.trim() === "") {
      throw new JiePlatformError("KANBAN_TEXT_EMPTY");
    }
    if (this.kanbanStore.editContent(command.teamId, sessionId, command.cardId, command.text) === null) {
      const notFound = !this.kanbanStore.load(command.teamId, sessionId).some((card) => card.id === command.cardId);
      if (notFound) {
        throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: command.cardId });
      }
      throw new JiePlatformError("KANBAN_DUPLICATE_CONTENT", { detail: command.text });
    }
    return { board: this.kanbanStore.load(command.teamId, sessionId) };
  }

  private kanbanHandoff(command: Command<"kanbanHandoff">): CommandResult<"kanbanHandoff"> {
    const sourceSessionId = this.sessionIdFor(command.teamId);
    const { sourceTeamId, cardId } = this.resolveHandoffTarget(command);
    const targetTeam = this.teamManager.locate(command.targetTeamId);
    if (targetTeam === null) {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `target team '${command.targetTeamId}' not found` });
    }
    const sessionId = sourceTeamId === command.teamId ? sourceSessionId : "";
    const card = this.kanbanStore.handoff(sourceTeamId, sessionId, cardId, command.targetTeamId);
    if (card === null) {
      throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: command.cardId });
    }
    return { board: this.kanbanStore.load(sourceTeamId, sessionId), card };
  }

  private kanbanToggleTodo(command: Command<"kanbanToggleTodo">): CommandResult<"kanbanToggleTodo"> {
    const sessionId = this.sessionIdFor(command.teamId);
    const board = this.kanbanStore.load(command.teamId, sessionId);
    const card = board.find((c) => c.id === command.cardId);
    if (card === undefined) {
      throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: command.cardId });
    }
    if (card.todos === undefined || !card.todos.some((todo) => todo.text === command.todo)) {
      throw new JiePlatformError("KANBAN_TODO_NOT_FOUND", { detail: command.todo });
    }
    const todos = card.todos.map((todo) => (todo.text === command.todo ? { ...todo, done: !todo.done } : todo));
    this.kanbanStore.update(command.teamId, sessionId, card.content, { todos });
    return { board: this.kanbanStore.load(command.teamId, sessionId) };
  }

  private resolveHandoffTarget(command: Command<"kanbanHandoff">): { sourceTeamId: string; cardId: string } {
    if (command.cardId.includes("/")) {
      const [sourceTeamId, cardId] = command.cardId.split("/", 2);
      return { sourceTeamId, cardId };
    }
    return { sourceTeamId: command.teamId, cardId: command.cardId };
  }

  private sessionIdFor(teamId: string): string {
    const sessionId = this.teamManager.currentSessionId(teamId);
    if (sessionId === null) {
      throw new JiePlatformError("NO_TEAM", { detail: `no session loaded for team '${teamId}'` });
    }
    return sessionId;
  }

  private async distillTitle(title: string | undefined, description: string): Promise<string> {
    if (title !== undefined) return title;
    if (description.length <= 60) return description;
    const model = this.resolveLlmModel();
    if (model === null) return description;
    try {
      const distilled = sanitizeTitle(
        await this.llmService.complete({
          model,
          systemPrompt: "Distill a one-line task title from the user's longer task description. Reply with only the title itself, no quotes, no punctuation, no prefix.",
          prompt: description,
          maxTokens: 20,
        }),
      );
      return distilled === "" ? description : distilled;
    } catch {
      return description;
    }
  }

  private resolveLlmModel(): Model<Api> | null {
    const settings = this.settingsStore.load();
    if (settings.defaultProvider === undefined || settings.defaultModel === undefined) return null;
    try {
      return this.modelRegistry.resolve(settings.defaultProvider, settings.defaultModel) ?? null;
    } catch {
      return null;
    }
  }
}

function sanitizeTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/^[-*•]\s+/, "").trim();
}
