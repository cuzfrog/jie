import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { CommandResult } from "../../../platform";
import { TuiState, type StateStore, type TuiState as TuiStateType } from "../../state";
import { style } from "../themes";

type InstalledTeams = CommandResult<"getTeamInfo">["installed"];

export class WelcomeBanner implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    if (TuiState.hasChatContent(this.stateStore.getState())) return [];
    return welcomeLines(this.stateStore.getState(), width);
  }

  invalidate(): void {}
}

function welcomeLines(state: TuiStateType, width: number): string[] {
  const w = Math.max(1, width);
  return joinSections([identityLines(state), helpHintSection()], w);
}

function helpHintSection(): string[] {
  return [`${style("accent")("/help")}${style("muted")(" to show commands and shortcuts")}`];
}

function joinSections(sections: ReadonlyArray<ReadonlyArray<string>>, width: number): string[] {
  return sections.flatMap((section, index) => (index === 0 ? [...section] : ["", ...section])).map((line) => truncateToWidth(line, width));
}

function identityLines(state: TuiStateType): string[] {
  const version = state.version === "" ? "" : ` · v${state.version}`;
  const lines = [`${style("accent")(MARK_GLYPH)}${style("muted")(` (jiè)${version}  ${TAGLINE}`)}`];
  const teams = teamsLine(state);
  if (teams !== null) lines.push(teams);
  return lines;
}

function teamsLine(state: TuiStateType): string | null {
  const installed = state.installedTeams;
  if (installed === null || installed.length === 0) return null;
  const current = installed.find((team) => team.id === state.teamId);
  const rest = installed.filter((team) => team.id !== state.teamId);
  const ordered: InstalledTeams = current === undefined ? installed : [current, ...rest];
  const list = ordered.map((team) => `${team.id}(${team.agentCount})`).join(TEAMS_SEPARATOR);
  return `${style("accent")("Teams: ")}${style("muted")(list)}`;
}

const MARK_GLYPH = "界";
const TAGLINE = "native multi-agent coding";
const TEAMS_SEPARATOR = " · ";
