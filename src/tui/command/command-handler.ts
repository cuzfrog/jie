import { JiePlatformError, type Command, type CommandName, type CommandResult, type JiePlatform, type KanbanCard, type TeamInfo } from "../../platform";
import { Actions, TuiState, type AgentUiState, type StateStore } from "../state";
import { bashDirective, parseBashCommand } from "../bash";
import type { CommandResolver } from "./command-resolver";
import type { ResolvedCommand, UiAction } from "./slash-command";

type AgentRoute = {
  readonly teamId: string;
  readonly agentKey: string;
};

export interface CommandHandler {
  handle(text: string): void;
}

export class CommandHandlerImpl implements CommandHandler {
  private readonly stateStore: StateStore;
  private readonly platform: JiePlatform;
  private readonly commandResolver: CommandResolver;

  constructor(stateStore: StateStore, platform: JiePlatform, commandResolver: CommandResolver) {
    this.stateStore = stateStore;
    this.platform = platform;
    this.commandResolver = commandResolver;
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

    if (name.startsWith("skill:")) {
      this.routeSkillInvocation(name, trimmed);
      return;
    }

    const resolved = this.commandResolver.resolve(this.stateStore.getState(), name, args);
    if (resolved instanceof Promise) {
      void resolved
        .then((value) => this.handleResolved(value))
        .catch((error) => this.stateStore.dispatch(Actions.setErrorMessage(errorReason(error))));
    } else {
      this.handleResolved(resolved);
    }
  }

  private handleResolved(resolved: ResolvedCommand): void {
    switch (resolved.kind) {
      case "ui":
        this.dispatchUiAction(resolved.action);
        return;
      case "set":
        this.dispatchSetAction(resolved.key, resolved.value);
        return;
      case "reply":
        this.stateStore.dispatch(Actions.setTransientMessage(resolved.text));
        return;
      case "error":
        this.stateStore.dispatch(Actions.setErrorMessage(resolved.text));
        return;
      case "platform": {
        if (resolved.transient !== undefined) {
          this.stateStore.dispatch(Actions.setTransientMessage(resolved.transient));
        }
        void this.platform.execute(resolved.command)
          .then((result) => this.handleCommandResult(resolved.command, result))
          .catch((error) => this.handlePlatformError(resolved, error));
        return;
      }
    }
  }

  private dispatchUiAction(action: UiAction): void {
    switch (action) {
      case "showHelp":
        this.stateStore.dispatch(Actions.showHelp());
        return;
      case "stop":
        this.stateStore.dispatch(Actions.requestQuit());
        return;
      case "cycleKanbanView":
        this.stateStore.dispatch(Actions.cycleKanbanView());
        return;
    }
  }

  private dispatchSetAction(key: "thinkingExpanded" | "toolCardsExpanded", value: boolean): void {
    if (key === "thinkingExpanded") {
      this.stateStore.dispatch(Actions.setThinkingExpanded(value));
      return;
    }
    this.stateStore.dispatch(Actions.setToolCardsExpanded(value));
  }

  private handleCommandResult(command: Command, result: CommandResult<CommandName>): void {
    switch (command.name) {
      case "team":
      case "resumeSession":
      case "newSession":
        this.stateStore.dispatch(Actions.switchTeam(result as TeamInfo));
        return;
      case "reload": {
        const activeTeamId = this.stateStore.getState().teamId;
        const teams = result as ReadonlyArray<TeamInfo>;
        const active = teams.find((team) => team.id === activeTeamId);
        if (active !== undefined) this.stateStore.dispatch(Actions.switchTeam(active));
        return;
      }
      case "renameSession":
        this.stateStore.dispatch(Actions.setSessionName(command.sessionName));
        return;
      case "kanbanAdd": {
        const kanbanResult = result as { readonly board: ReadonlyArray<KanbanCard>; readonly card: KanbanCard };
        this.stateStore.dispatch(Actions.setKanbanBoard(kanbanResult.board));
        this.stateStore.dispatch(Actions.setTransientMessage(`added kanban card ${kanbanResult.card.id}`));
        return;
      }
      case "kanbanRemove":
      case "kanbanClear":
      case "kanbanSetStatus":
      case "kanbanEdit":
      case "kanbanToggleTodo":
        this.stateStore.dispatch(Actions.setKanbanBoard((result as { readonly board: ReadonlyArray<KanbanCard> }).board));
        return;
      case "kanbanHandoff": {
        const kanbanResult = result as { readonly board: ReadonlyArray<KanbanCard>; readonly card: KanbanCard };
        this.stateStore.dispatch(Actions.setKanbanBoard(kanbanResult.board));
        this.stateStore.dispatch(Actions.setTransientMessage(`handed off kanban card ${kanbanResult.card.id}`));
        return;
      }
      default:
        return;
    }
  }

  private handlePlatformError(resolved: Extract<ResolvedCommand, { kind: "platform" }>, error: unknown): void {
    const reason = errorReason(error);
    if (resolved.command.name === "team") {
      if (error instanceof JiePlatformError) {
        this.stateStore.dispatch(Actions.setErrorMessage(error.message));
        return;
      }
      this.stateStore.dispatch(Actions.setErrorMessage(`load team '${resolved.command.teamId}' failed: ${reason}`));
      return;
    }
    this.stateStore.dispatch(Actions.setErrorMessage(`/${resolved.slashName} failed: ${reason}`));
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
