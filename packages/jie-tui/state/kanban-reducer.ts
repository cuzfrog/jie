import type { KanbanCard, KanbanStatus } from "@cuzfrog/jie-platform";
import { ActionTypes, type Action } from "./actions";
import { TuiState, type KanbanEditField } from "./state";

type KanbanDirection = Extract<Action, { type: typeof ActionTypes.MOVE_KANBAN_CURSOR }>["payload"]["direction"];
type EditFieldDirection = Extract<Action, { type: typeof ActionTypes.MOVE_KANBAN_EDIT_FIELD }>["payload"]["direction"];

const COLUMN_ORDER: ReadonlyArray<KanbanStatus> = ["pending", "in_progress", "completed"];

export function kanbanReducer(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.SET_KANBAN_BOARD: {
      const next = { ...state, kanbanBoard: action.payload.board };
      return { ...next, kanbanCursor: clampCursor(TuiState.kanbanVisibleCards(next), state.kanbanCursor) };
    }
    case ActionTypes.MOVE_KANBAN_CURSOR:
      return { ...state, kanbanCursor: moveCursor(TuiState.kanbanVisibleCards(state), state.kanbanCursor, action.payload.direction) };
    case ActionTypes.MOVE_KANBAN_EDIT_FIELD:
      return { ...state, kanbanEditField: moveEditField(state.kanbanEditField, action.payload.direction) };
    case ActionTypes.CYCLE_KANBAN_VIEW:
      return reduceViewCycle(state);
    case ActionTypes.TOGGLE_KANBAN_EXPAND:
      return { ...state, kanbanExpanded: !state.kanbanExpanded, kanbanEditField: !state.kanbanExpanded ? "content" : state.kanbanEditField };
    case ActionTypes.COMMIT_KANBAN_EDIT:
      return { ...state, kanbanEdit: action.payload.cardId, kanbanEditField: action.payload.field };
    case ActionTypes.CANCEL_KANBAN_EDIT:
    case ActionTypes.SAVE_KANBAN_EDIT:
      return { ...state, kanbanEdit: null };
    default:
      return state;
  }
}

function reduceViewCycle(state: TuiState): TuiState {
  if (state.focusedAgentId === null) return state;
  if (state.kanbanView === "hidden") return { ...state, kanbanView: "list" };
  if (state.kanbanView === "list") {
    return {
      ...state,
      kanbanView: "panel",
      teamPanelVisible: false,
      teamCursorAgentId: null,
      kanbanCursor: clampCursor(TuiState.kanbanVisibleCards(state), state.kanbanCursor),
    };
  }
  return { ...state, kanbanView: "hidden", kanbanEdit: null, kanbanExpanded: false };
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

function moveEditField(field: KanbanEditField, direction: EditFieldDirection): KanbanEditField {
  if (direction === "up" && field === "description") return "content";
  if (direction === "down" && field === "content") return "description";
  return field;
}

function adjacentColumn(cards: ReadonlyArray<KanbanCard>, status: KanbanStatus, step: 1 | -1): ReadonlyArray<KanbanCard> | null {
  const start = COLUMN_ORDER.indexOf(status);
  for (let offset = step; start + offset >= 0 && start + offset < COLUMN_ORDER.length; offset += step) {
    const column = columnOf(cards, COLUMN_ORDER[start + offset]!);
    if (column.length > 0) return column;
  }
  return null;
}
