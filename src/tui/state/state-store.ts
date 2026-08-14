import { logger } from "../../utils";
import type { TuiState } from "./state";
import { reduce } from "./reducer";
import type { Action } from "./actions";

const log = logger.getSubLogger({ name: "jie.tui.state-store" });

const INITIAL_TUI_STATE: TuiState = Object.freeze({
  cwd: null,
  gitBranch: null,
  gitDirty: false,
  version: "",
  installedTeams: null,
  teamId: null,
  sessionName: null,
  leaderAgentId: null,
  agents: new Map(),
  focusedAgentId: null,
  teamCursorAgentId: null,
  interruptedAgentId: null,
  nextEntrySeq: 0,
  transientMessage: null,
  transientSetAt: null,
  errorBanner: null,
  thinkingExpanded: false,
  toolCardsExpanded: false,
  teamPanelVisible: false,
  helpPanelVisible: false,
  kanban: Object.freeze({
    view: "hidden",
    board: [],
    cursor: null,
    expanded: false,
    edit: null,
    editField: "content",
  } as const),
  question: null,
  pendingQuit: false,
  editorText: "",
  editorCursorAtStart: true,
  terminalFocused: false,
} as const);

/** a subscriber can perform side effect */
type ActionCallback = (action: Action, afterState: TuiState, beforeState: TuiState) => Promise<void>;

export interface StateStore {
  getState(): TuiState;
  dispatch(action: Action): void;
  /** a subscriber can perform side effect upon action; return unsubscribe stub. */
  subscribe(listener: ActionCallback): () => void;
}

export class StateStoreImpl implements StateStore {
  private state: TuiState = INITIAL_TUI_STATE;
  private readonly callbacks = new Set<ActionCallback>();

  getState(): TuiState {
    return this.state;
  }

  dispatch(action: Action): void {
    const beforeState = this.state;
    const afterState = reduce(beforeState, action);
    this.state = afterState;
    for (const callback of this.callbacks) {
      void Promise.resolve(callback(action, afterState, beforeState)).catch((error: unknown) => {
        log.error({ action, error }, "subscriber callback failed");
      });
    }
  }

  subscribe(listener: ActionCallback): () => void {
    this.callbacks.add(listener);
    return (): void => {
      this.callbacks.delete(listener);
    };
  }
}
