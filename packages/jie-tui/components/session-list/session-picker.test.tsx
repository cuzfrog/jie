import { render } from "../../test-renderer";
import { SessionPicker } from "./session-picker";
import type { SessionSummary } from "@cuzfrog/jie-platform";

function session(id: string, messageCount = 1, lastActivity = new Date().toISOString()): SessionSummary {
  return { sessionId: id, messageCount, lastActivity };
}

const NOW = new Date("2026-07-14T12:00:00.000Z").getTime();

function isoMinus(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

interface PickerHandles {
  readonly stdin: { write: (data: string) => void };
  readonly lastFrame: () => string | undefined;
}

function mountPicker(
  props: Omit<Parameters<typeof SessionPicker>[0], never>,
): PickerHandles & { captured: { query: string[]; focus: number[]; selected: SessionSummary[]; closed: boolean } } {
  const captured = { query: [] as string[], focus: [] as number[], selected: [] as SessionSummary[], closed: false };
  const out = render(
    <SessionPicker
      sessions={props.sessions}
      query={props.query}
      focusedIndex={props.focusedIndex}
      width={props.width}
      height={props.height}
      onQueryChange={(q): void => {
        captured.query.push(q);
      }}
      onFocusChange={(d): void => {
        captured.focus.push(d);
      }}
      onSelect={(s): void => {
        captured.selected.push(s);
      }}
      onClose={(): void => {
        captured.closed = true;
      }}
    />,
  );
  return { ...out, captured };
}

describe("SessionPicker", () => {
  test("renders the title and the available sessions", () => {
    const probe = mountPicker({
      sessions: [session("s1")],
      query: "",
      focusedIndex: 0,
      width: 60,
      height: 20,
    });
    const frame = probe.lastFrame() ?? "";
    expect(frame).toContain("Resume session");
    expect(frame).toContain("s1");
  });

  test("renders the query text passed in", () => {
    const probe = mountPicker({
      sessions: [],
      query: "alpha",
      focusedIndex: -1,
      width: 60,
      height: 20,
    });
    const frame = probe.lastFrame() ?? "";
    expect(frame).toContain("alpha");
  });

  test("filters the visible list by query", () => {
    const sessions: ReadonlyArray<SessionSummary> = [
      { sessionId: "01-alpha", messageCount: 1, lastActivity: isoMinus(1) },
      { sessionId: "02-bravo", messageCount: 2, lastActivity: isoMinus(2) },
    ];
    const probe = mountPicker({
      sessions,
      query: "alpha",
      focusedIndex: 0,
      width: 60,
      height: 20,
    });
    const frame = probe.lastFrame() ?? "";
    expect(frame).toContain("01-alpha");
    expect(frame).not.toContain("02-bravo");
  });

  test("emits onQueryChange with appended character on printable key", async () => {
    const probe = mountPicker({
      sessions: [],
      query: "",
      focusedIndex: -1,
      width: 60,
      height: 20,
    });
    probe.stdin.write("a");
    await flush();
    expect(probe.captured.query).toEqual(["a"]);
  });

  test("emits onFocusChange(+1) on down arrow", async () => {
    const probe = mountPicker({
      sessions: [session("a"), session("b")],
      query: "",
      focusedIndex: 0,
      width: 60,
      height: 20,
    });
    probe.stdin.write("\x1b[B");
    await flush();
    expect(probe.captured.focus).toEqual([1]);
  });

  test("emits onFocusChange(-1) on up arrow", async () => {
    const probe = mountPicker({
      sessions: [session("a"), session("b")],
      query: "",
      focusedIndex: 1,
      width: 60,
      height: 20,
    });
    probe.stdin.write("\x1b[A");
    await flush();
    expect(probe.captured.focus).toEqual([-1]);
  });

  test("emits onSelect with the focused session on Enter", async () => {
    const list: ReadonlyArray<SessionSummary> = [session("alpha"), session("bravo")];
    const probe = mountPicker({
      sessions: list,
      query: "",
      focusedIndex: 1,
      width: 60,
      height: 20,
    });
    probe.stdin.write("\r");
    await flush();
    expect(probe.captured.selected.map((s) => s.sessionId)).toEqual(["bravo"]);
  });

  test("emits onClose on Escape", async () => {
    const probe = mountPicker({
      sessions: [],
      query: "",
      focusedIndex: -1,
      width: 60,
      height: 20,
    });
    probe.stdin.write("\x1b");
    await flush();
    expect(probe.captured.closed).toBe(true);
  });

  test("emits onQueryChange with one less char on backspace", async () => {
    const probe = mountPicker({
      sessions: [],
      query: "ab",
      focusedIndex: -1,
      width: 60,
      height: 20,
    });
    probe.stdin.write("\x7f");
    await flush();
    expect(probe.captured.query).toEqual(["a"]);
  });
});