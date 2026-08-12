import { parseCliArgs } from "../scripts/merge-pr";

describe("merge-pr argument parsing", () => {
  test("parses PR number with defaults", () => {
    const result = parseCliArgs(["42"]);
    expect(result.prNumber).toBe(42);
    expect(result.method).toBe("squash");
    expect(result.shouldDelete).toBe(false);
  });

  test("parses method and delete flag", () => {
    const result = parseCliArgs(["123", "--method", "rebase", "--delete"]);
    expect(result.prNumber).toBe(123);
    expect(result.method).toBe("rebase");
    expect(result.shouldDelete).toBe(true);
  });

  test("accepts short flags", () => {
    const result = parseCliArgs(["7", "-m", "merge", "-d"]);
    expect(result.prNumber).toBe(7);
    expect(result.method).toBe("merge");
    expect(result.shouldDelete).toBe(true);
  });

  test("rejects missing PR number", () => {
    expect(() => parseCliArgs(["--method", "squash"])).toThrow("Invalid PR number");
  });

  test("rejects non-numeric PR number", () => {
    expect(() => parseCliArgs(["abc"])).toThrow("Invalid PR number");
  });

  test("rejects invalid merge method", () => {
    expect(() => parseCliArgs(["1", "--method", "foo"])).toThrow("Invalid merge method");
  });

  test("rejects multiple positional arguments", () => {
    expect(() => parseCliArgs(["1", "2"])).toThrow("Expected a single PR number");
  });
});
