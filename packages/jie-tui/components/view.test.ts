import { PassThrough } from "node:stream";
import { Container, TuiMainScreen } from "@earendil-works/pi-tui";
import { Actions } from "../state";
import { StreamTerminalImpl } from "../stream-terminal";
import { makeTuiState } from "../test";
import { _FlushLoader, _resolveGlobalKey, _resolveKanbanKey, _resolveTeamCursorDirection, _shouldCommitTeamCursor, _syncWorkingSlot } from "./view";

describe("FlushLoader", () => {
  test("renders the spinner at the chat column, without the loader's left padding", () => {
    const loader = makeFlushLoader("Working…", ["⠋"]);
    try {
      const lines = loader.render(80);
      expect(lines[0]).toBe("");
      expect(lines[1]!.trimEnd()).toBe("⠋ Working…");
    } finally {
      loader.stop();
    }
  });

  test("renders a frameless indicator label at the chat column", () => {
    const loader = makeFlushLoader("Interrupted", []);
    try {
      const lines = loader.render(80);
      expect(lines[0]).toBe("");
      expect(lines[1]!.trimEnd()).toBe("Interrupted");
    } finally {
      loader.stop();
    }
  });
});

function makeFlushLoader(message: string, frames: ReadonlyArray<string>): InstanceType<typeof _FlushLoader> {
  const stdout = Object.assign(new PassThrough(), { columns: 80, rows: 30 });
  const ui = new TuiMainScreen(new StreamTerminalImpl(new PassThrough(), stdout));
  const identity = (text: string): string => text;
  return new _FlushLoader(ui, identity, identity, message, { frames: [...frames] });
}

describe("syncWorkingSlot", () => {
  let slot: Container;
  let working: InstanceType<typeof _FlushLoader>;
  let teamWorking: InstanceType<typeof _FlushLoader>;
  let interrupted: InstanceType<typeof _FlushLoader>;

  beforeEach(() => {
    slot = new Container();
    working = makeFlushLoader("Working…", ["⠋"]);
    teamWorking = makeFlushLoader("Team working…", ["⠙"]);
    interrupted = makeFlushLoader("Interrupted", []);
  });

  afterEach(() => {
    working.stop();
    teamWorking.stop();
    interrupted.stop();
  });

  test("an empty slot shows the focused indicator in focused mode", () => {
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "focused")).toBe(true);
    expect(slot.children).toEqual([working]);
  });

  test("an empty slot shows the team indicator in team mode", () => {
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "team")).toBe(true);
    expect(slot.children).toEqual([teamWorking]);
  });

  test("an empty slot shows the interrupted indicator in interrupted mode without starting it", () => {
    const start = vi.spyOn(interrupted, "start");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "interrupted")).toBe(true);
    expect(slot.children).toEqual([interrupted]);
    expect(start).not.toHaveBeenCalled();
  });

  test("none mode leaves an empty slot untouched", () => {
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "none")).toBe(false);
    expect(slot.children).toEqual([]);
  });

  test("returns false and does not restart when the target indicator is already shown", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "focused");
    const start = vi.spyOn(working, "start");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "focused")).toBe(false);
    expect(slot.children).toEqual([working]);
    expect(start).not.toHaveBeenCalled();
  });

  test("switching from focused to team stops the focused spinner and starts the team spinner", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "focused");
    const stopWorking = vi.spyOn(working, "stop");
    const startTeam = vi.spyOn(teamWorking, "start");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "team")).toBe(true);
    expect(stopWorking).toHaveBeenCalledTimes(1);
    expect(startTeam).toHaveBeenCalledTimes(1);
    expect(slot.children).toEqual([teamWorking]);
  });

  test("leaving team mode for none stops the team spinner and clears the slot", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "team");
    const stopTeam = vi.spyOn(teamWorking, "stop");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "none")).toBe(true);
    expect(stopTeam).toHaveBeenCalledTimes(1);
    expect(slot.children).toEqual([]);
  });

  test("the interrupted indicator gives way to the focused spinner", () => {
    _syncWorkingSlot(slot, working, teamWorking, interrupted, "interrupted");
    expect(_syncWorkingSlot(slot, working, teamWorking, interrupted, "focused")).toBe(true);
    expect(slot.children).toEqual([working]);
  });
});

describe("resolveGlobalKey", () => {
  test("ctrl+t maps to toggleThinking", () => {
    expect(_resolveGlobalKey("\x14", makeTuiState(), false)).toEqual(Actions.toggleThinking());
  });

  test("ctrl+o maps to toggleToolCards", () => {
    expect(_resolveGlobalKey("\x0f", makeTuiState(), false)).toEqual(Actions.toggleToolCards());
  });

  test("ctrl+k maps to cycleKanbanView", () => {
    expect(_resolveGlobalKey("\x0b", makeTuiState(), false)).toEqual(Actions.cycleKanbanView());
  });

  test("ctrl+t, ctrl+o and ctrl+k stay active while the autocomplete popup is open", () => {
    expect(_resolveGlobalKey("\x14", makeTuiState(), true)).toEqual(Actions.toggleThinking());
    expect(_resolveGlobalKey("\x0f", makeTuiState(), true)).toEqual(Actions.toggleToolCards());
    expect(_resolveGlobalKey("\x0b", makeTuiState(), true)).toEqual(Actions.cycleKanbanView());
  });

  test("left maps to toggling the team panel while the editor cursor sits at the buffer start", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true }), false)).toEqual(Actions.toggleTeamPanel());
  });

  test("left stays with the kanban panel while the kanban panel view is shown", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true, kanbanView: "panel" }), false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true, kanbanView: "list" }), false)).toEqual(Actions.toggleTeamPanel());
  });

  test("left is left to the editor once the cursor moves away from the buffer start", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: false }), false)).toBeNull();
  });

  test("left is left to the editor while the autocomplete popup is open", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true }), true)).toBeNull();
  });

  test("ctrl+down no longer toggles the team panel", () => {
    expect(_resolveGlobalKey("\x1b[1;5B", makeTuiState({ editorCursorAtStart: true }), false)).toBeNull();
  });

  test("plain, shift and other ctrl arrows are left to the editor", () => {
    const state = makeTuiState({ editorCursorAtStart: true });
    expect(_resolveGlobalKey("\x1b[A", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[B", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[C", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2A", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2B", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5A", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2D", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5D", state, false)).toBeNull();
  });

  test("any other key is left to the editor", () => {
    const state = makeTuiState({ editorCursorAtStart: true });
    expect(_resolveGlobalKey("a", state, false)).toBeNull();
    expect(_resolveGlobalKey("\r", state, false)).toBeNull();
  });
});

describe("resolveKanbanKey", () => {
  test("tab toggles the kanban expand while the panel is shown", () => {
    expect(_resolveKanbanKey("\t", makeTuiState({ kanbanView: "panel" }), false)).toEqual(Actions.toggleKanbanExpand());
  });

  test("esc collapses the expanded kanban panel", () => {
    expect(_resolveKanbanKey("\x1b", makeTuiState({ kanbanView: "panel", kanbanExpanded: true }), false)).toEqual(Actions.toggleKanbanExpand());
  });

  test("arrows move the kanban cursor", () => {
    const state = makeTuiState({ kanbanView: "panel" });
    expect(_resolveKanbanKey("\x1b[A", state, false)).toEqual(Actions.moveKanbanCursor("up"));
    expect(_resolveKanbanKey("\x1b[B", state, false)).toEqual(Actions.moveKanbanCursor("down"));
    expect(_resolveKanbanKey("\x1b[C", state, false)).toEqual(Actions.moveKanbanCursor("right"));
    expect(_resolveKanbanKey("\x1b[D", state, false)).toEqual(Actions.moveKanbanCursor("left"));
  });

  test("left at the buffer start still moves the kanban cursor", () => {
    expect(_resolveKanbanKey("\x1b[D", makeTuiState({ kanbanView: "panel", editorCursorAtStart: true }), false)).toEqual(Actions.moveKanbanCursor("left"));
  });

  test("ctrl+e commits the edit at the cursor", () => {
    expect(_resolveKanbanKey("\x05", makeTuiState({ kanbanView: "panel", kanbanCursor: "#1" }), false)).toEqual(Actions.commitKanbanEdit("#1"));
  });

  test("arrows select title and description while expanded", () => {
    const state = makeTuiState({ kanbanView: "panel", kanbanExpanded: true, kanbanEditField: "content" });
    expect(_resolveKanbanKey("\x1b[B", state, false)).toEqual(Actions.moveKanbanEditField("down"));
    expect(_resolveKanbanKey("\x1b[A", makeTuiState({ kanbanView: "panel", kanbanExpanded: true, kanbanEditField: "description" }), false)).toEqual(Actions.moveKanbanEditField("up"));
    expect(_resolveKanbanKey("\x1b[C", state, false)).toBeNull();
    expect(_resolveKanbanKey("\x1b[D", state, false)).toBeNull();
  });

  test("ctrl+e commits the selected field while expanded", () => {
    const state = makeTuiState({ kanbanView: "panel", kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "description" });
    expect(_resolveKanbanKey("\x05", state, false)).toEqual(Actions.commitKanbanEdit("#1", "description"));
  });

  test("ctrl+e does nothing without a cursor", () => {
    expect(_resolveKanbanKey("\x05", makeTuiState({ kanbanView: "panel" }), false)).toBeNull();
  });

  test("enter falls through to the editor while the panel is shown", () => {
    expect(_resolveKanbanKey("\r", makeTuiState({ kanbanView: "panel", kanbanCursor: "#1" }), false)).toBeNull();
  });

  test("null while the view is hidden or list", () => {
    expect(_resolveKanbanKey("\t", makeTuiState(), false)).toBeNull();
    expect(_resolveKanbanKey("\x1b[A", makeTuiState(), false)).toBeNull();
    expect(_resolveKanbanKey("\t", makeTuiState({ kanbanView: "list" }), false)).toBeNull();
    expect(_resolveKanbanKey("\x1b[A", makeTuiState({ kanbanView: "list" }), false)).toBeNull();
  });

  test("null while the autocomplete popup is open, so the popup keeps navigation", () => {
    const state = makeTuiState({ kanbanView: "panel" });
    expect(_resolveKanbanKey("\t", state, true)).toBeNull();
    expect(_resolveKanbanKey("\x1b[A", state, true)).toBeNull();
    expect(_resolveKanbanKey("\x05", state, true)).toBeNull();
  });

  test("null while editing a card, so every key reaches the editor", () => {
    const state = makeTuiState({ kanbanView: "panel", kanbanEdit: "#1" });
    expect(_resolveKanbanKey("\t", state, false)).toBeNull();
    expect(_resolveKanbanKey("\x1b", state, false)).toBeNull();
    expect(_resolveKanbanKey("\x1b[A", state, false)).toBeNull();
    expect(_resolveKanbanKey("\x05", state, false)).toBeNull();
  });

  test("null for any other key", () => {
    const state = makeTuiState({ kanbanView: "panel" });
    expect(_resolveKanbanKey("a", state, false)).toBeNull();
    expect(_resolveKanbanKey("\x1b[1;5B", state, false)).toBeNull();
  });
});

describe("resolveTeamCursorDirection", () => {
  test("down maps to 1 and up to -1 while the strip is shown", () => {
    const state = makeTuiState({ teamPanelVisible: true });
    expect(_resolveTeamCursorDirection("\x1b[B", state, false)).toBe(1);
    expect(_resolveTeamCursorDirection("\x1b[A", state, false)).toBe(-1);
  });

  test("null while the strip is hidden, so the editor keeps history navigation", () => {
    const state = makeTuiState({ teamPanelVisible: false });
    expect(_resolveTeamCursorDirection("\x1b[B", state, false)).toBeNull();
    expect(_resolveTeamCursorDirection("\x1b[A", state, false)).toBeNull();
  });

  test("null while the autocomplete popup is open, so the popup keeps navigation", () => {
    const state = makeTuiState({ teamPanelVisible: true });
    expect(_resolveTeamCursorDirection("\x1b[B", state, true)).toBeNull();
    expect(_resolveTeamCursorDirection("\x1b[A", state, true)).toBeNull();
  });

  test("null for any other key", () => {
    const state = makeTuiState({ teamPanelVisible: true });
    expect(_resolveTeamCursorDirection("a", state, false)).toBeNull();
    expect(_resolveTeamCursorDirection("\r", state, false)).toBeNull();
    expect(_resolveTeamCursorDirection("\x1b[1;5B", state, false)).toBeNull();
  });
});

describe("shouldCommitTeamCursor", () => {
  test("true when the strip is visible and the cursor differs from the focused agent", () => {
    const state = makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1", teamCursorAgentId: "t:b-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(true);
  });

  test("false when the cursor matches the focused agent", () => {
    const state = makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1", teamCursorAgentId: "t:a-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(false);
  });

  test("false when there is no cursor", () => {
    const state = makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(false);
  });

  test("false when the strip is hidden", () => {
    const state = makeTuiState({ teamPanelVisible: false, focusedAgentId: "t:a-1", teamCursorAgentId: "t:b-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(false);
  });
});
