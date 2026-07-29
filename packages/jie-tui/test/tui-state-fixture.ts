import type { TuiState } from "../state";

export function makeTuiState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    cwd: null,
    gitBranch: null,
    gitDirty: false,
    version: "",
    installedTeams: null,
    teamId: null,
    leaderAgentId: null,
    agents: new Map(),
    focusedAgentId: null,
    teamCursorAgentId: null,
    interruptedAgentId: null,
    infoEntries: [],
    nextEntrySeq: 0,
    transientMessage: null,
    errorBanner: null,
    thinkingExpanded: false,
    toolCardsExpanded: false,
    teamPanelVisible: false,
    pendingQuit: false,
    editorText: "",
    ...overrides,
  };
}
