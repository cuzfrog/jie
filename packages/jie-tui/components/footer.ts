import { Container, Text, type TUI } from "@earendil-works/pi-tui";
import { type AgentStatus, type ModelReference, type StateStore } from "../state";
import type { GitSnapshot } from "@cuzfrog/jie-platform";
import { Themes } from "./themes";

const PLACEHOLDER_TOKEN_USAGE = "0%/200k";
const accent = Themes.footerTheme.accent;
const muted = Themes.footerTheme.muted;

export interface FooterModel {
  readonly cwd: string;
  readonly git: GitSnapshot;
}

export interface FooterContext {
  readonly focusedStatus: AgentStatus | null;
  readonly focusedAgentKey: string | null;
  readonly teamId: string | null;
  readonly showRail: boolean;
  readonly focusedModel: ModelReference | null;
}

export class Footer extends Container {
  private readonly lineOne: Text;
  private readonly lineTwo: Text;
  private currentModel: FooterModel;
  private currentContext: FooterContext;

  constructor(tui: TUI) {
    super();
    this.lineOne = new Text("");
    this.lineTwo = new Text("");
    this.currentModel = { cwd: "", git: { branch: "", dirty: false, ahead: 0, behind: 0 } };
    this.currentContext = {
      focusedStatus: null,
      focusedAgentKey: null,
      teamId: null,
      showRail: false,
      focusedModel: null,
    };
    this.addChild(this.lineOne);
    this.addChild(this.lineTwo);
    void tui;
  }

  setContext(model: FooterModel, context: FooterContext): void {
    this.currentModel = model;
    this.currentContext = context;
  }

  update(model: FooterModel, stateStore: StateStore): void {
    const state = stateStore.getState();
    const focused = stateStore.getFocusedAgent();
    this.setContext(model, {
      focusedStatus: focused?.status ?? null,
      focusedAgentKey: focused?.agentKey ?? null,
      teamId: state.teamId,
      showRail: state.showTeamRailPanel,
      focusedModel: focused?.model ?? null,
    });
  }

  override render(width: number): string[] {
    this.lineOne.setText(this.formatLineOne(this.currentModel, this.currentContext, width));
    this.lineTwo.setText(this.formatLineTwo(this.currentContext));
    return super.render(width);
  }

  private formatLineOne(model: FooterModel, context: FooterContext, width: number): string {
    const branchPart = model.git.branch === "" ? "" : ` (${model.git.branch}${model.git.dirty ? "*" : ""})`;
    const leftPlain = `${model.cwd}${branchPart}`;
    const focusedKey = context.focusedAgentKey ?? "—";
    const rightPlain = context.teamId === null ? `no-team:${focusedKey}` : `${context.teamId}:${focusedKey}`;
    const gap = Math.max(2, width - leftPlain.length - rightPlain.length);
    return `${accent(leftPlain)}${" ".repeat(gap)}${muted(rightPlain)}`;
  }

  private formatLineTwo(context: FooterContext): string {
    const stats = PLACEHOLDER_TOKEN_USAGE;
    const hint = this.hintText(context);
    const model = this.modelText(context.focusedModel);
    return `${muted(stats)}  ${muted(hint)}  ${model}`;
  }

  private hintText(context: FooterContext): string {
    if (context.showRail) return "ctrl+↑↓ switch agent  shift+left close agents";
    return "shift+left for agents";
  }

  private modelText(model: ModelReference | null): string {
    if (model === null) return muted("—");
    return `${muted(`(${model.provider})`)} ${accent(model.id)} ${muted(`| ${model.effort}`)}`;
  }
}
