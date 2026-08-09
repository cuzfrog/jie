import { parseToolSpec } from "./tool-spec";
import { JiePlatformError } from "../jie-platform-errors";

describe("parseToolSpec", () => {
  test("bare name has no args", () => {
    expect(parseToolSpec("write_file")).toEqual({ name: "write_file", args: [] });
  });

  test("name with empty parens has no args", () => {
    expect(parseToolSpec("notify()")).toEqual({ name: "notify", args: [] });
  });

  test("single arg", () => {
    expect(parseToolSpec("notify(task.recorded)")).toEqual({
      name: "notify",
      args: ["task.recorded"],
    });
  });

  test("multiple args are split and trimmed", () => {
    expect(parseToolSpec("notify(task.recorded, task.done)")).toEqual({
      name: "notify",
      args: ["task.recorded", "task.done"],
    });
  });

  test("whitespace around args is stripped", () => {
    expect(parseToolSpec("write_file( **/CONTEXT.md )")).toEqual({
      name: "write_file",
      args: ["**/CONTEXT.md"],
    });
  });

  test("unmatched opening paren throws INVALID_TOOL_SPEC", () => {
    expect(() => parseToolSpec("notify(task.recorded")).toThrow(JiePlatformError);
    try {
      parseToolSpec("notify(task.recorded");
    } catch (error) {
      expect(error).toBeInstanceOf(JiePlatformError);
      expect((error as JiePlatformError).code).toBe("INVALID_TOOL_SPEC");
    }
  });

  test("missing name throws INVALID_TOOL_SPEC", () => {
    try {
      parseToolSpec("(task.recorded)");
    } catch (error) {
      expect(error).toBeInstanceOf(JiePlatformError);
      expect((error as JiePlatformError).code).toBe("INVALID_TOOL_SPEC");
    }
  });

  test("empty argument throws INVALID_TOOL_SPEC", () => {
    try {
      parseToolSpec("notify(a,,b)");
    } catch (error) {
      expect(error).toBeInstanceOf(JiePlatformError);
      expect((error as JiePlatformError).code).toBe("INVALID_TOOL_SPEC");
    }
  });
});
