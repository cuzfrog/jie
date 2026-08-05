import type { WriteGateRule } from "../types";
import { checkWriteGates } from "./write-gate";

function gate(pattern: string, roles: ReadonlyArray<string>): WriteGateRule {
  return { pattern, roles };
}

describe("checkWriteGates", () => {
  test("allows any path when no gates are declared", () => {
    expect(() => checkWriteGates("docs/CONTEXT.md", "implementer", [])).not.toThrow();
  });

  test("allows a path that matches no gate", () => {
    expect(() => checkWriteGates("src/main.ts", "implementer", [gate("**/CONTEXT.md", ["architect"])])).not.toThrow();
  });

  test("denies when the matched gate excludes the caller role", () => {
    expect(() => checkWriteGates("docs/CONTEXT.md", "implementer", [gate("**/CONTEXT.md", ["architect"])])).toThrow(
      expect.objectContaining({
        code: "WRITE_GATE_DENIED",
        message: "Write blocked by a team write gate: path 'docs/CONTEXT.md' matches write gate '**/CONTEXT.md' (allowed roles: architect)",
      }),
    );
  });

  test("allows when the caller role is listed in the matched gate", () => {
    expect(() => checkWriteGates("docs/CONTEXT.md", "architect", [gate("**/CONTEXT.md", ["architect", "planner"])])).not.toThrow();
  });

  test("role 'any' in a gate admits every caller", () => {
    expect(() => checkWriteGates("docs/CONTEXT.md", "reviewer", [gate("**/CONTEXT.md", ["any"])])).not.toThrow();
  });

  test("a **/ pattern also matches the workspace root level", () => {
    expect(() => checkWriteGates("CONTEXT.md", "implementer", [gate("**/CONTEXT.md", ["architect"])])).toThrow(
      expect.objectContaining({ code: "WRITE_GATE_DENIED" }),
    );
  });

  test("every matching gate must admit the caller", () => {
    const gates = [gate("docs/**", ["writer"]), gate("docs/public/**", ["writer", "publisher"])];
    expect(() => checkWriteGates("docs/public/readme.md", "publisher", gates)).toThrow(
      expect.objectContaining({ code: "WRITE_GATE_DENIED" }),
    );
    expect(() => checkWriteGates("docs/public/readme.md", "writer", gates)).not.toThrow();
  });
});
