import { Container, Loader, Text, type TUI } from "@earendil-works/pi-tui";
import type { AgentStatus, TuiState } from "../state";

export interface StatusBarModel {
  cwd: string;
  branch: string;
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

  setModel(model: StatusBarModel, ctx: StatusBarContext): void {
    const leftSide = model.branch === "" ? model.cwd : `${model.cwd} (${model.branch})`;
    const focusedKey = ctx.focusedAgentKey ?? "—";
    const rightSide = ctx.teamId === null ? `no-team:${focusedKey}` : `${ctx.teamId}:${focusedKey}`;
    this.cwdLine.setText(`${leftSide}  ${rightSide}`);

    const hintText = this.hintText(ctx);
    const modelText = this.modelText(model);
    this.hintLine.setText(`${hintText}  ${modelText}`);

    this.syncLoader(ctx.focusedStatus);
  }

  private hintText(ctx: StatusBarContext): string {
    if (ctx.showRail) return "ctrl+↑↓ switch agent  ctrl+left close agents";
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

export function statusBarContextFromState(state: TuiState): StatusBarContext {
  const focused = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId);
  return {
    focusedStatus: focused?.status ?? null,
    focusedAgentKey: focused?.agentKey ?? null,
    teamId: state.teamId,
    showRail: state.showTeamRailPanel,
  };
}

export function statusBarModelFromOpts(opts: { cwd: string; branch: string; provider: string; modelId: string; effort: string }): StatusBarModel {
  return {
    cwd: opts.cwd,
    branch: opts.branch,
    provider: opts.provider,
    modelId: opts.modelId,
    effort: opts.effort,
  };
}
