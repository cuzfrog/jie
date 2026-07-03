import { Container, Loader, Text, type TUI } from "@earendil-works/pi-tui";
import { type AgentStatus, type ModelReference, type StateStore } from "../state";
import type { GitSnapshot } from "@cuzfrog/jie-platform/services";

const PLACEHOLDER_TOKEN_USAGE = "0%/200k";

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
  transientMessage: string | null;
  errorBanner: string | null;
}

export class StatusBar extends Container {
  private readonly cwdLine: Text;
  private readonly hintLine: Text;
  private readonly bannerLine: Text;
  private loader: Loader | null;
  private readonly tui: TUI;

  constructor(tui: TUI) {
    super();
    this.cwdLine = new Text("");
    this.hintLine = new Text("");
    this.bannerLine = new Text("");
    this.loader = null;
    this.tui = tui;
    this.addChild(this.bannerLine);
    this.addChild(this.cwdLine);
    this.addChild(this.hintLine);
  }

  setModel(model: StatusBarModel, context: StatusBarContext): void {
    this.bannerLine.setText(context.errorBanner ?? context.transientMessage ?? "");
    this.cwdLine.setText(this.formatCwdLine(model, context));
    this.hintLine.setText(this.formatHintLine(context));
    this.syncLoader(context.focusedStatus);
  }

  private formatCwdLine(model: StatusBarModel, context: StatusBarContext): string {
    const branchPart = model.git.branch === "" ? "" : ` (${model.git.branch}${model.git.dirty ? "*" : ""})`;
    const leftSide = `${model.cwd}${branchPart}`;
    const focusedKey = context.focusedAgentKey ?? "—";
    const rightSide = context.teamId === null ? `no-team:${focusedKey}` : `${context.teamId}:${focusedKey}`;
    return `${leftSide}  ${rightSide}`;
  }

  private formatHintLine(context: StatusBarContext): string {
    return `${PLACEHOLDER_TOKEN_USAGE}  ${this.hintText(context)}  ${this.modelText(context.focusedModel)}`;
  }

  update(model: StatusBarModel, stateStore: StateStore): void {
    const state = stateStore.getState();
    const focused = stateStore.getFocusedAgent();
    this.setModel(model, {
      focusedStatus: focused?.status ?? null,
      focusedAgentKey: focused?.agentKey ?? null,
      teamId: state.teamId,
      showRail: state.showTeamRailPanel,
      focusedModel: focused?.model ?? null,
      transientMessage: state.transientMessage,
      errorBanner: state.errorBanner,
    });
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
