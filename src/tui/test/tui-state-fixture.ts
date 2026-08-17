import type { TuiState } from "../state";
import { makeAgentUiState } from "./agent-fixture";

type KanbanState = TuiState["kanban"];

const DEFAULT_KANBAN: KanbanState = Object.freeze({
  view: "hidden",
  board: [],
  cursor: null,
  expanded: false,
  edit: null,
  editField: "content",
} as const);

type FlatKanbanOverrides = {
  readonly kanbanView?: KanbanState["view"];
  readonly kanbanBoard?: KanbanState["board"];
  readonly kanbanCursor?: KanbanState["cursor"];
  readonly kanbanExpanded?: KanbanState["expanded"];
  readonly kanbanEdit?: KanbanState["edit"];
  readonly kanbanEditField?: KanbanState["editField"];
};

export function makeTuiState(
  overrides: Partial<Omit<TuiState, "kanban">> & FlatKanbanOverrides & { readonly kanban?: Partial<KanbanState> } = {},
): TuiState {
  const {
    kanban: kanbanOverride,
    kanbanView,
    kanbanBoard,
    kanbanCursor,
    kanbanExpanded,
    kanbanEdit,
    kanbanEditField,
    ...topLevel
  } = overrides;
  const kanban: KanbanState = {
    ...DEFAULT_KANBAN,
    ...kanbanOverride,
    ...pickKanban({ kanbanView, kanbanBoard, kanbanCursor, kanbanExpanded, kanbanEdit, kanbanEditField }),
  };
  return {
    cwd: null,
    gitBranch: null,
    gitDirty: false,
    version: "",
    installedTeams: null,
    teamId: null,
    sessionId: null,
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
    kanban,
    question: null,
    pendingQuit: false,
    editorText: "",
    editorCursorAtStart: true,
    terminalFocused: false,
    requireUserAttention: false,
    ...topLevel,
  };
}

type MutableKanban = { -readonly [K in keyof KanbanState]?: KanbanState[K] };

function pickKanban(overrides: FlatKanbanOverrides): MutableKanban {
  const partial: MutableKanban = {};
  if (overrides.kanbanView !== undefined) partial.view = overrides.kanbanView;
  if (overrides.kanbanBoard !== undefined) partial.board = overrides.kanbanBoard;
  if (overrides.kanbanCursor !== undefined) partial.cursor = overrides.kanbanCursor;
  if (overrides.kanbanExpanded !== undefined) partial.expanded = overrides.kanbanExpanded;
  if (overrides.kanbanEdit !== undefined) partial.edit = overrides.kanbanEdit;
  if (overrides.kanbanEditField !== undefined) partial.editField = overrides.kanbanEditField;
  return partial;
}

export function teamState(teamId = "t1", status: "idle" | "busy" = "idle"): TuiState {
  const agent = makeAgentUiState(`${teamId}:general-1`, { isLeader: true, status });
  return makeTuiState({
    teamId,
    leaderAgentId: agent.agentId,
    focusedAgentId: agent.agentId,
    agents: new Map([[agent.agentId, agent]]),
  });
}
