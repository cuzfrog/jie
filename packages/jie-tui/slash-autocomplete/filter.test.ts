import { filterCommands } from "./filter";

describe("filterCommands", () => {
  test("empty query returns the input order", () => {
    const list: ReadonlyArray<string> = ["help", "clear", "exit"];
    expect(filterCommands("", list)).toEqual(["help", "clear", "exit"]);
  });

  test("matches a prefix case-insensitively", () => {
    const list: ReadonlyArray<string> = ["help", "clear", "exit"];
    expect(filterCommands("CL", list)).toEqual(["clear"]);
  });

  test("returns empty array when no command matches the prefix", () => {
    const list: ReadonlyArray<string> = ["help", "clear"];
    expect(filterCommands("zz", list)).toEqual([]);
  });

  test("scores exact-name match at the top", () => {
    const list: ReadonlyArray<string> = ["help-me", "help", "team"];
    expect(filterCommands("help", list)).toEqual(["help", "help-me"]);
  });

  test("treats whitespace-only query as empty", () => {
    const list: ReadonlyArray<string> = ["help", "clear"];
    expect(filterCommands("   ", list)).toEqual(["help", "clear"]);
  });

  test("preserves order among equally-ranked candidates", () => {
    const list: ReadonlyArray<string> = ["login", "logout"];
    expect(filterCommands("lo", list)).toEqual(["login", "logout"]);
  });

  test("does not match anywhere except the prefix", () => {
    const list: ReadonlyArray<string> = ["help", "team"];
    expect(filterCommands("elp", list)).toEqual([]);
  });
});
