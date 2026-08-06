import type { KanbanCard } from "../kanban";
import type { TuiState } from "./state";
import { clampKanbanCursor } from "./kanban-cursor";

export function reduceKanbanBoard(state: TuiState, board: ReadonlyArray<KanbanCard>): TuiState {
  return { ...state, kanbanBoard: board, kanbanCursor: clampKanbanCursor(board, state.kanbanCursor) };
}