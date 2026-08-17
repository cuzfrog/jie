import { makeTuiState } from "../../test";
import { DynamicHintImpl } from "./dynamic-hint";

function card(status: "pending" | "in_progress" | "in_review" | "completed", id = "c1") {
  return { id, content: "task", status, todos: [] as { text: string; done: boolean }[] };
}

const dynamicHint = new DynamicHintImpl();

describe("DynamicHintImpl", () => {
  test("kanban hidden with open cards shows ctl+k for kanban(N)", () => {
    const state = makeTuiState({
      kanban: { view: "hidden", board: [card("pending"), card("completed", "c2")], cursor: null, expanded: false, edit: null, editField: "content" },
    });
    const plain = stripAnsi(dynamicHint.format(state, 80));
    expect(plain).toBe("ctl+k for kanban(1)");
  });

  test("kanban view list or panel suppresses the kanban hint", () => {
    const listState = makeTuiState({
      kanban: { view: "list", board: [card("pending")], cursor: null, expanded: false, edit: null, editField: "content" },
    });
    expect(stripAnsi(dynamicHint.format(listState, 80))).toBe("/help to show commands and shortcuts");
    const panelState = makeTuiState({
      kanban: { view: "panel", board: [card("pending")], cursor: null, expanded: false, edit: null, editField: "content" },
    });
    expect(stripAnsi(dynamicHint.format(panelState, 80))).toBe("/help to show commands and shortcuts");
  });

  test("team hint appears when a team is loaded and the editor cursor is at the start", () => {
    const state = makeTuiState({ teamId: "my-team", editorCursorAtStart: true });
    const plain = stripAnsi(dynamicHint.format(state, 80));
    expect(plain).toBe("← to toggle team panel");
  });

  test("team hint is suppressed when the editor cursor is not at the start", () => {
    const state = makeTuiState({ teamId: "my-team", editorCursorAtStart: false });
    const plain = stripAnsi(dynamicHint.format(state, 80));
    expect(plain).toBe("/help to show commands and shortcuts");
  });

  test("team hint is suppressed when no team is loaded", () => {
    const state = makeTuiState({ teamId: null, editorCursorAtStart: true });
    const plain = stripAnsi(dynamicHint.format(state, 80));
    expect(plain).toBe("/help to show commands and shortcuts");
  });

  test("kanban and team hints are joined with | and kanban comes first", () => {
    const state = makeTuiState({
      teamId: "my-team",
      editorCursorAtStart: true,
      kanban: { view: "hidden", board: [card("in_progress")], cursor: null, expanded: false, edit: null, editField: "content" },
    });
    const plain = stripAnsi(dynamicHint.format(state, 80));
    expect(plain).toBe("ctl+k for kanban(1) | ← to toggle team panel");
  });

  test("width overflow picks exactly one full hint", () => {
    const state = makeTuiState({
      teamId: "my-team",
      editorCursorAtStart: true,
      kanban: { view: "hidden", board: [card("in_review")], cursor: null, expanded: false, edit: null, editField: "content" },
    });
    const first = new DynamicHintImpl(() => 0).format(state, 25);
    const last = new DynamicHintImpl(() => 0.999).format(state, 25);
    expect(stripAnsi(first)).toBe("ctl+k for kanban(1)");
    expect(stripAnsi(last)).toBe("← to toggle team panel");
  });

  test("available width of zero still returns a truncated string without throwing", () => {
    const state = makeTuiState({
      kanban: { view: "hidden", board: [card("pending")], cursor: null, expanded: false, edit: null, editField: "content" },
    });
    const out = dynamicHint.format(state, 0);
    expect(out.length).toBeGreaterThan(0);
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
