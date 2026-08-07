import type { KanbanCard } from "@cuzfrog/jie-platform";
import { Actions } from "./actions";
import { kanbanReducer } from "./kanban-reducer";
import { makeTuiState } from "../test";

function card(id: string, status: KanbanCard["status"], content = id): KanbanCard {
  return { id, content, status };
}

describe("kanbanReducer — setKanbanBoard", () => {
  test("replaces the board and clamps the cursor onto it", () => {
    const state = makeTuiState({ kanbanCursor: "old" });
    const next = kanbanReducer(state, Actions.setKanbanBoard([card("#1", "pending")]));
    expect(next.kanbanBoard).toEqual([card("#1", "pending")]);
    expect(next.kanbanCursor).toBe("#1");
  });

  test("keeps the cursor when it is still on the board", () => {
    const state = makeTuiState({ kanbanCursor: "#2" });
    const next = kanbanReducer(state, Actions.setKanbanBoard([card("#1", "pending"), card("#2", "in_progress")]));
    expect(next.kanbanCursor).toBe("#2");
  });

  test("an empty board clears the cursor", () => {
    const state = makeTuiState({ kanbanCursor: "#1" });
    expect(kanbanReducer(state, Actions.setKanbanBoard([])).kanbanCursor).toBeNull();
  });
});

describe("kanbanReducer — moveKanbanCursor", () => {
  const board = [
    card("P1", "pending"), card("P2", "pending"),
    card("I1", "in_progress"),
    card("C1", "completed"), card("C2", "completed"), card("C3", "completed"),
  ];

  test("down walks the current status column", () => {
    const state = makeTuiState({ kanbanBoard: board, kanbanCursor: "P1" });
    expect(kanbanReducer(state, Actions.moveKanbanCursor("down")).kanbanCursor).toBe("P2");
  });

  test("up and down clamp at the column ends", () => {
    const atTop = makeTuiState({ kanbanBoard: board, kanbanCursor: "P1" });
    expect(kanbanReducer(atTop, Actions.moveKanbanCursor("up")).kanbanCursor).toBe("P1");
    const atBottom = makeTuiState({ kanbanBoard: board, kanbanCursor: "P2" });
    expect(kanbanReducer(atBottom, Actions.moveKanbanCursor("down")).kanbanCursor).toBe("P2");
  });

  test("right jumps to the nearest non-empty column, clamping the row to its length", () => {
    const state = makeTuiState({ kanbanBoard: board, kanbanCursor: "P2" });
    expect(kanbanReducer(state, Actions.moveKanbanCursor("right")).kanbanCursor).toBe("I1");
  });

  test("left skips empty columns", () => {
    const sparse = [card("P1", "pending"), card("C1", "completed")];
    const state = makeTuiState({ kanbanBoard: sparse, kanbanCursor: "C1" });
    expect(kanbanReducer(state, Actions.moveKanbanCursor("left")).kanbanCursor).toBe("P1");
  });

  test("left at the leftmost non-empty column keeps the cursor", () => {
    const state = makeTuiState({ kanbanBoard: board, kanbanCursor: "P1" });
    expect(kanbanReducer(state, Actions.moveKanbanCursor("left")).kanbanCursor).toBe("P1");
  });

  test("an unknown cursor starts from the first visible card", () => {
    const state = makeTuiState({ kanbanBoard: board, kanbanCursor: "nope" });
    expect(kanbanReducer(state, Actions.moveKanbanCursor("down")).kanbanCursor).toBe("P2");
  });

  test("an empty board yields a null cursor", () => {
    expect(kanbanReducer(makeTuiState(), Actions.moveKanbanCursor("down")).kanbanCursor).toBeNull();
  });

  test("cards beyond the 8-row visible window are not reachable", () => {
    const cards = Array.from({ length: 10 }, (_, index) => card(`P${index + 1}`, "pending"));
    const state = makeTuiState({ kanbanBoard: cards, kanbanCursor: "P8" });
    expect(kanbanReducer(state, Actions.moveKanbanCursor("down")).kanbanCursor).toBe("P8");
  });

  test("setting a board clamps a cursor outside the visible window to the first card", () => {
    const cards = Array.from({ length: 10 }, (_, index) => card(`P${index + 1}`, "pending"));
    const state = makeTuiState({ kanbanCursor: "P9" });
    expect(kanbanReducer(state, Actions.setKanbanBoard(cards)).kanbanCursor).toBe("P1");
  });
});

describe("kanbanReducer — view cycle", () => {
  test("does nothing without a focused agent", () => {
    const state = makeTuiState();
    expect(kanbanReducer(state, Actions.cycleKanbanView())).toBe(state);
  });

  test("cycles hidden to list without touching the team panel", () => {
    const state = makeTuiState({ focusedAgentId: "t:a-1", teamPanelVisible: true, teamCursorAgentId: "t:b-1" });
    const next = kanbanReducer(state, Actions.cycleKanbanView());
    expect(next.kanbanView).toBe("list");
    expect(next.teamPanelVisible).toBe(true);
    expect(next.teamCursorAgentId).toBe("t:b-1");
  });

  test("cycles list to panel, hides the team panel and clamps the cursor", () => {
    const state = makeTuiState({
      focusedAgentId: "t:a-1",
      kanbanView: "list",
      teamPanelVisible: true,
      teamCursorAgentId: "t:b-1",
      kanbanBoard: [card("#1", "pending")],
    });
    const next = kanbanReducer(state, Actions.cycleKanbanView());
    expect(next.kanbanView).toBe("panel");
    expect(next.teamPanelVisible).toBe(false);
    expect(next.teamCursorAgentId).toBeNull();
    expect(next.kanbanCursor).toBe("#1");
  });

  test("cycles panel to hidden and clears the edit and the expanded mode", () => {
    const state = makeTuiState({ focusedAgentId: "t:a-1", kanbanView: "panel", kanbanEdit: "#1", kanbanExpanded: true });
    const next = kanbanReducer(state, Actions.cycleKanbanView());
    expect(next.kanbanView).toBe("hidden");
    expect(next.kanbanEdit).toBeNull();
    expect(next.kanbanExpanded).toBe(false);
  });
});

describe("kanbanReducer — expand and edit", () => {
  test("toggleKanbanExpand flips kanbanExpanded", () => {
    const state = makeTuiState();
    const expanded = kanbanReducer(state, Actions.toggleKanbanExpand());
    expect(expanded.kanbanExpanded).toBe(true);
    expect(kanbanReducer(expanded, Actions.toggleKanbanExpand()).kanbanExpanded).toBe(false);
  });

  test("commitKanbanEdit sets the editing card and the edit field", () => {
    expect(kanbanReducer(makeTuiState(), Actions.commitKanbanEdit("#1")).kanbanEdit).toBe("#1");
    expect(kanbanReducer(makeTuiState(), Actions.commitKanbanEdit("#1", "description")).kanbanEditField).toBe("description");
  });

  test("moveKanbanEditField toggles between content and description", () => {
    const state = makeTuiState({ kanbanEditField: "content" });
    const down = kanbanReducer(state, Actions.moveKanbanEditField("down"));
    expect(down.kanbanEditField).toBe("description");
    expect(kanbanReducer(down, Actions.moveKanbanEditField("up")).kanbanEditField).toBe("content");
  });

  test("toggleKanbanExpand resets the edit field to content", () => {
    const state = makeTuiState({ kanbanEditField: "description" });
    expect(kanbanReducer(state, Actions.toggleKanbanExpand()).kanbanEditField).toBe("content");
  });

  test("cancelKanbanEdit and saveKanbanEdit clear the editing card", () => {
    const editing = makeTuiState({ kanbanEdit: "#1" });
    expect(kanbanReducer(editing, Actions.cancelKanbanEdit()).kanbanEdit).toBeNull();
    expect(kanbanReducer(editing, Actions.saveKanbanEdit("#1", "new content")).kanbanEdit).toBeNull();
  });
});

test("non-kanban actions pass through unchanged", () => {
  const state = makeTuiState();
  expect(kanbanReducer(state, Actions.toggleThinking())).toBe(state);
});
