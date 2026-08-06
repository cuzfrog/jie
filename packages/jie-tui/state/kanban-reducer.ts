import type { KanbanCard, KanbanStatus } from "@cuzfrog/jie-platform";
import { ActionTypes, type Action } from "./actions";
import { TuiState } from "./state";

type KanbanDirection = Extract<Action, { type: typeof ActionTypes.MOVE_KANBAN_CURSOR }>["payload"]["direction"];

const COLUMN_ORDER: ReadonlyArray<KanbanStatus> = ["pending", "in_progress", "completed"];

export function kanbanReducer(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.SET_KANBAN_BOARD: {
      const next = { ...state, kanbanBoard: action.payload.board };
      return { ...next, kanbanCursor: clampCursor(TuiState.kanbanVisibleCards(next), state.kanbanCursor) };
    }
    case ActionTypes.MOVE_KANBAN_CURSOR:
      return { ...state, kanbanCursor: moveCursor(TuiState.kanbanVisibleCards(state), state.kanbanCursor, action.payload.direction) };
    case ActionTypes.TOGGLE_KANBAN_PANEL:
      return reducePanelToggle(state);
    case ActionTypes.TOGGLE_KANBAN_EXPAND:
      return { ...state, kanbanExpanded: !state.kanbanExpanded };
    case ActionTypes.COMMIT_KANBAN_EDIT:
      return { ...state, kanbanEdit: action.payload.cardId };
    case ActionTypes.CANCEL_KANBAN_EDIT:
    case ActionTypes.SAVE_KANBAN_EDIT:
      return { ...state, kanbanEdit: null };
    default:
      return state;
  }
}

function reducePanelToggle(state: TuiState): TuiState {
  if (state.focusedAgentId === null) return state;
  if (state.kanbanPanelVisible) return { ...state, kanbanPanelVisible: false, kanbanEdit: null, kanbanExpanded: false };
  return {
    ...state,
    kanbanPanelVisible: true,
    teamPanelVisible: false,
    teamCursorAgentId: null,
    kanbanCursor: clampCursor(TuiState.kanbanVisibleCards(state), state.kanbanCursor),
  };
}

function moveCursor(cards: ReadonlyArray<KanbanCard>, currentId: string | null, direction: KanbanDirection): string | null {
  if (cards.length === 0) return null;
  const current = cards.find((card) => card.id === currentId) ?? cards[0]!;
  const column = columnOf(cards, current.status);
  const row = column.findIndex((card) => card.id === current.id);
  if (direction === "up" || direction === "down") {
    const next = direction === "up" ? row - 1 : row + 1;
    if (next < 0 || next >= column.length) return current.id;
    return column[next]!.id;
  }
  const target = adjacentColumn(cards, current.status, direction === "left" ? -1 : 1);
  if (target === null) return current.id;
  return target[Math.min(row, target.length - 1)]!.id;
}

function clampCursor(visible: ReadonlyArray<KanbanCard>, cursorId: string | null): string | null {
  if (visible.length === 0) return null;
  if (cursorId !== null && visible.some((card) => card.id === cursorId)) return cursorId;
  return visible[0]!.id;
}

function columnOf(cards: ReadonlyArray<KanbanCard>, status: KanbanStatus): ReadonlyArray<KanbanCard> {
  return cards.filter((card) => card.status === status);
}

function adjacentColumn(cards: ReadonlyArray<KanbanCard>, status: KanbanStatus, step: 1 | -1): ReadonlyArray<KanbanCard> | null {
  const start = COLUMN_ORDER.indexOf(status);
  for (let offset = step; start + offset >= 0 && start + offset < COLUMN_ORDER.length; offset += step) {
    const column = columnOf(cards, COLUMN_ORDER[start + offset]!);
    if (column.length > 0) return column;
  }
  return null;
}
