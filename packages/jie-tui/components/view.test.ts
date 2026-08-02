import { PassThrough } from "node:stream";
import { TUI } from "@earendil-works/pi-tui";
import { Actions } from "../state";
import { StreamTerminalImpl } from "../stream-terminal";
import { makeTuiState } from "../test";
import { _FlushLoader, _resolveGlobalKey, _resolveTeamCursorDirection, _shouldCommitTeamCursor } from "./view";

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
  const ui = new TUI(new StreamTerminalImpl(new PassThrough(), stdout));
  const identity = (text: string): string => text;
  return new _FlushLoader(ui, identity, identity, message, { frames: [...frames] });
}

describe("resolveGlobalKey", () => {
  test("ctrl+t maps to toggleThinking", () => {
    expect(_resolveGlobalKey("\x14")).toEqual(Actions.toggleThinking());
  });

  test("ctrl+o maps to toggleToolCards", () => {
    expect(_resolveGlobalKey("\x0f")).toEqual(Actions.toggleToolCards());
  });

  test("ctrl+down maps to toggling the team panel", () => {
    expect(_resolveGlobalKey("\x1b[1;5B")).toEqual(Actions.toggleTeamPanel());
  });

  test("plain, shift and other ctrl arrows are left to the editor", () => {
    expect(_resolveGlobalKey("\x1b[A")).toBeNull();
    expect(_resolveGlobalKey("\x1b[B")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2A")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2B")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5A")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2D")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5D")).toBeNull();
  });

  test("any other key is left to the editor", () => {
    expect(_resolveGlobalKey("a")).toBeNull();
    expect(_resolveGlobalKey("\r")).toBeNull();
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
