import { Container, Loader, Text, type TUI } from "@earendil-works/pi-tui";
import type { AgentStatus, TuiState } from "../state";
import type { GitSnapshot } from "../git-service";

export interface StatusBarModel {
  cwd: string;
  git: GitSnapshot;
  provider: string;
  modelId: string;
  effort: string;
}

export interface StatusBarContext {
  focusedStatus: AgentStatus | null;
  focusedAgentKey: string | null;
  teamId: string | null;
  showRail: boolean;
}

export class StatusBar extends Container {
  private readonly cwdLine: Text;
  private readonly hintLine: Text;
  private loader: Loader | null;
  private readonly tui: TUI;

  constructor(tui: TUI) {
    super();
    this.cwdLine = new Text("");
    this.hintLine = new Text("");
    this.loader = null;
    this.tui = tui;
    this.addChild(this.cwdLine);
    this.addChild(this.hintLine);
  }

  setModel(model: StatusBarModel, context: StatusBarContext): void {
    const branchPart = model.git.branch === "" ? "" : ` (${model.git.branch}${model.git.dirty ? "*" : ""})`;
    const leftSide = `${model.cwd}${branchPart}`;
    const focusedKey = context.focusedAgentKey ?? "—";
    const rightSide = context.teamId === null ? `no-team:${focusedKey}` : `${context.teamId}:${focusedKey}`;
    this.cwdLine.setText(`${leftSide}  ${rightSide}`);

    const hintText = this.hintText(context);
    const modelText = this.modelText(model);
    this.hintLine.setText(`${hintText}  ${modelText}`);

    this.syncLoader(context.focusedStatus);
  }

  setFromOptsAndState(opts: StatusBarModel, state: TuiState): void {
    this.setModel(opts, statusBarContextFromState(state));
  }

  private hintText(context: StatusBarContext): string {
    if (context.showRail) return "ctrl+↑↓ switch agent  ctrl+left close agents";
    return "ctrl+left for agents";
  }

  private modelText(model: StatusBarModel): string {
    if (model.provider === "" || model.modelId === "") return "—";
    const effort = model.effort === "" ? "" : ` | ${model.effort}`;
    return `(${model.provider}) ${model.modelId}${effort}`;
  }

  private syncLoader(status: AgentStatus | null): void {
    if (status === "busy") {
      if (this.loader === null) {
        const tui = this.tui;
        this.loader = new Loader(tui, (s) => s, (s) => s, "Working…");
        this.loader.start();
        this.addChild(this.loader);
      }
      return;
    }
    if (this.loader !== null) {
      this.removeChild(this.loader);
      this.loader.stop();
      this.loader = null;
    }
  }
}

function statusBarContextFromState(state: TuiState): StatusBarContext {
  const focused = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId);
  return {
    focusedStatus: focused?.status ?? null,
    focusedAgentKey: focused?.agentKey ?? null,
    teamId: state.teamId,
    showRail: state.showTeamRailPanel,
  };
}

export { statusBarContextFromState as _statusBarContextFromState };
