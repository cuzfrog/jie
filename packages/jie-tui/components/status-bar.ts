import { Container, Loader, Text, type TUI } from "@earendil-works/pi-tui";
import { type AgentStatus, type ModelReference, type TuiState, TuiStateSelectors } from "../state";
import type { GitSnapshot } from "../git-service";

export interface StatusBarModel {
  cwd: string;
  git: GitSnapshot;
}

export interface StatusBarContext {
  focusedStatus: AgentStatus | null;
  focusedAgentKey: string | null;
  teamId: string | null;
  showRail: boolean;
  focusedModel: ModelReference | null;
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
    const modelText = this.modelText(context.focusedModel);
    this.hintLine.setText(`0%/200k  ${hintText}  ${modelText}`);

    this.syncLoader(context.focusedStatus);
  }

  setFromOptsAndState(opts: StatusBarModel, state: TuiState): void {
    this.setModel(opts, statusBarContextFromState(state));
  }

  private hintText(context: StatusBarContext): string {
    if (context.showRail) return "ctrl+↑↓ switch agent  ctrl+left close agents";
    return "ctrl+left for agents";
  }

  private modelText(model: ModelReference | null): string {
    if (model === null) return "—";
    return `(${model.provider}) ${model.id} | ${model.effort}`;
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
  const focused = TuiStateSelectors.getFocusedAgent(state);
  return {
    focusedStatus: focused?.status ?? null,
    focusedAgentKey: focused?.agentKey ?? null,
    teamId: state.teamId,
    showRail: state.showTeamRailPanel,
    focusedModel: focused?.model ?? null,
  };
}

export { statusBarContextFromState as _statusBarContextFromState };
