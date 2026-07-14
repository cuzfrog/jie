import type { SessionSummary } from "@cuzfrog/jie-platform";
import { filterSessions } from "./filter";

function session(id: string, messageCount = 1, lastActivity = new Date().toISOString()): SessionSummary {
  return { sessionId: id, messageCount, lastActivity };
}

describe("filterSessions", () => {
  test("empty query returns the input order", () => {
    const list: ReadonlyArray<SessionSummary> = [session("a"), session("b"), session("c")];
    expect(filterSessions("", list).map((s) => s.sessionId)).toEqual(["a", "b", "c"]);
  });

  test("matches a substring case-insensitively", () => {
    const list: ReadonlyArray<SessionSummary> = [session("alpha"), session("beta"), session("gamma")];
    expect(filterSessions("PHA", list).map((s) => s.sessionId)).toEqual(["alpha"]);
  });

  test("returns empty array when no session matches", () => {
    const list: ReadonlyArray<SessionSummary> = [session("alpha"), session("beta")];
    expect(filterSessions("zz", list)).toEqual([]);
  });

  test("preserves the input order on partial matches", () => {
    const list: ReadonlyArray<SessionSummary> = [
      session("01-alpha"),
      session("02-bravo"),
      session("03-alpha-clone"),
      session("04-charlie"),
    ];
    expect(filterSessions("alpha", list).map((s) => s.sessionId)).toEqual([
      "01-alpha",
      "03-alpha-clone",
    ]);
  });

  test("scores substring-at-start above substring-in-middle", () => {
    const list: ReadonlyArray<SessionSummary> = [session("beta-foo"), session("alpha-bar")];
    expect(filterSessions("alpha", list).map((s) => s.sessionId)).toEqual(["alpha-bar"]);
    expect(filterSessions("foo", list).map((s) => s.sessionId)).toEqual(["beta-foo"]);
  });

  test("treats whitespace-only query as empty", () => {
    const list: ReadonlyArray<SessionSummary> = [session("a"), session("b")];
    expect(filterSessions("   ", list).map((s) => s.sessionId)).toEqual(["a", "b"]);
  });

  test("does not match across sessionId boundaries", () => {
    const list: ReadonlyArray<SessionSummary> = [session("ab"), session("cd")];
    expect(filterSessions("bc", list)).toEqual([]);
  });

  test("startsWith matches precede contains matches in original order", () => {
    const list: ReadonlyArray<SessionSummary> = [
      session("alpha-foo"),
      session("01-alpha"),
      session("alpha-bar"),
      session("02-alpha"),
    ];
    expect(filterSessions("alpha", list).map((s) => s.sessionId)).toEqual([
      "alpha-foo",
      "alpha-bar",
      "01-alpha",
      "02-alpha",
    ]);
  });
});