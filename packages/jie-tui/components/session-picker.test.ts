import type { SessionSummary } from "@cuzfrog/jie-platform";
import { visibleWidth } from "@earendil-works/pi-tui";
import { Actions, createStateStore, type StateStore } from "../state";
import { SessionPicker, type SessionPickerCallbacks } from "./session-picker";

const SESSIONS: ReadonlyArray<SessionSummary> = [
  { sessionId: "alpha-1", messageCount: 3, lastActivity: "2026-07-21T00:00:00.000Z" },
  { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-20T00:00:00.000Z" },
];

interface Booted {
  readonly store: StateStore;
  readonly picker: SessionPicker;
  readonly selected: string[];
  readonly cancels: number[];
}

function bootPicker(): Booted {
  const store = createStateStore();
  store.dispatch(Actions.openSessionPicker(SESSIONS));
  const selected: string[] = [];
  const cancels: number[] = [];
  const callbacks: SessionPickerCallbacks = {
    onSelect: (sessionId) => {
      selected.push(sessionId);
    },
    onCancel: () => {
      cancels.push(1);
    },
  };
  return { store, picker: new SessionPicker(SESSIONS, store, callbacks), selected, cancels };
}

describe("SessionPicker", () => {
  test("render shows the header, filter line and session rows", () => {
    const { picker } = bootPicker();
    const lines = picker.render(60).join("\n");
    expect(lines).toContain("Resume session");
    expect(lines).toContain("filter: ");
    expect(lines).toContain("alpha-1");
    expect(lines).toContain("beta-2");
  });

  test("typing updates the query slice and filters by prefix", () => {
    const { store, picker } = bootPicker();
    for (const ch of "be") picker.handleInput(ch);
    expect(store.getState().sessionPickerQuery).toBe("be");
    const lines = picker.render(60).join("\n");
    expect(lines).toContain("beta-2");
    expect(lines).not.toContain("alpha-1");
  });

  test("backspace shrinks the query", () => {
    const { store, picker } = bootPicker();
    picker.handleInput("b");
    picker.handleInput("\x7f");
    expect(store.getState().sessionPickerQuery).toBe("");
  });

  test("a query matching nothing renders a sessions-specific no-match line", () => {
    const { picker } = bootPicker();
    for (const ch of "zz") picker.handleInput(ch);
    const lines = picker.render(60).join("\n");
    expect(lines).toContain("No matching sessions");
    expect(lines).not.toContain("No matching commands");
  });

  test("up and down move the slice focus with wrapping", () => {
    const { store, picker } = bootPicker();
    picker.handleInput("\x1b[B");
    expect(store.getState().sessionPickerFocus).toBe(1);
    picker.handleInput("\x1b[B");
    expect(store.getState().sessionPickerFocus).toBe(0);
    picker.handleInput("\x1b[A");
    expect(store.getState().sessionPickerFocus).toBe(1);
  });

  test("enter selects the focused session", () => {
    const { picker, selected } = bootPicker();
    picker.handleInput("\x1b[B");
    picker.handleInput("\r");
    expect(selected).toEqual(["beta-2"]);
  });

  test("escape cancels", () => {
    const { picker, cancels } = bootPicker();
    picker.handleInput("\x1b");
    expect(cancels).toEqual([1]);
  });

  test("control sequences are not typed into the query", () => {
    const { store, picker } = bootPicker();
    picker.handleInput("\x01");
    expect(store.getState().sessionPickerQuery).toBe("");
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const store = createStateStore();
    const sessions: ReadonlyArray<SessionSummary> = [
      { sessionId: "x".repeat(300), messageCount: 9, lastActivity: "2026-07-21T00:00:00.000Z" },
      { sessionId: "中文🎉".repeat(40), messageCount: 1, lastActivity: "2026-07-20T00:00:00.000Z" },
    ];
    store.dispatch(Actions.openSessionPicker(sessions));
    const picker = new SessionPicker(sessions, store, { onSelect: () => undefined, onCancel: () => undefined });
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of picker.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
