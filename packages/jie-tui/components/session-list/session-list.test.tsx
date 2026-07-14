import { SessionList } from "./session-list";
import type { SessionSummary as SessionInfo } from "@cuzfrog/jie-platform";
import { render } from "../../test-renderer";

function sessions(items: ReadonlyArray<SessionInfo>): ReadonlyArray<SessionInfo> {
  return items;
}

const NOW = new Date("2026-07-13T12:00:00.000Z").getTime();

function isoMinus(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("SessionList", () => {
  test("renders 'No sessions' when given an empty list", () => {
    const out = render(<SessionList sessions={sessions([])} width={40} focusedIndex={-1} />);
    expect(out.lastFrame()).toContain("No sessions");
  });

  test("renders one row per session, newest first", () => {
    const list: ReadonlyArray<SessionInfo> = [
      { sessionId: "01-newer", messageCount: 5, lastActivity: isoMinus(2) },
      { sessionId: "02-older", messageCount: 1, lastActivity: isoMinus(120) },
    ];
    const out = render(<SessionList sessions={list} width={60} focusedIndex={-1} />);
    const frame = out.lastFrame() ?? "";
    expect(frame).toContain("01-newer");
    expect(frame).toContain("02-older");
    const newerAt = frame.indexOf("01-newer");
    const olderAt = frame.indexOf("02-older");
    expect(newerAt).toBeGreaterThan(-1);
    expect(olderAt).toBeGreaterThan(newerAt);
  });

  test("highlights the focused row with a leading caret", () => {
    const list: ReadonlyArray<SessionInfo> = [
      { sessionId: "01-top", messageCount: 1, lastActivity: isoMinus(1) },
      { sessionId: "02-bot", messageCount: 2, lastActivity: isoMinus(60) },
    ];
    const out = render(<SessionList sessions={list} width={60} focusedIndex={1} />);
    const frame = out.lastFrame() ?? "";
    const lines = frame.split("\n");
    const topLine = lines.find((l) => l.includes("01-top")) ?? "";
    const botLine = lines.find((l) => l.includes("02-bot")) ?? "";
    expect(topLine.startsWith(" ")).toBe(true);
    expect(botLine.includes(">")).toBe(true);
  });

  test("shows message count for each session", () => {
    const list: ReadonlyArray<SessionInfo> = [
      { sessionId: "s", messageCount: 42, lastActivity: isoMinus(1) },
    ];
    const out = render(<SessionList sessions={list} width={60} focusedIndex={-1} />);
    expect(out.lastFrame()).toContain("42");
  });
});
