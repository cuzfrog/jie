import type { TuiState } from "../state";

export function makeTuiState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    cwd: null,
    gitBranch: null,
    gitDirty: false,
    teamId: null,
    leaderAgentId: null,
    agents: new Map(),
    focusedAgentId: null,
    transientMessage: null,
    errorBanner: null,
    thinkingExpanded: false,
    toolCardsExpanded: false,
    pendingQuit: false,
    editorText: "",
    ...overrides,
  };
}
