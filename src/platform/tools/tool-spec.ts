import { JiePlatformError } from "../jie-platform-errors";

export interface ToolSpec {
  readonly name: string;
  readonly args: ReadonlyArray<string>;
}

export function parseToolSpec(spec: string): ToolSpec {
  const open = spec.indexOf("(");
  if (open === -1) return { name: spec, args: [] };
  if (!spec.endsWith(")")) {
    throw new JiePlatformError("INVALID_TOOL_SPEC", { detail: `tool spec '${spec}': unmatched '('` });
  }
  const name = spec.slice(0, open);
  if (name === "") {
    throw new JiePlatformError("INVALID_TOOL_SPEC", { detail: `tool spec '${spec}': missing tool name` });
  }
  const inner = spec.slice(open + 1, -1);
  if (inner === "") return { name, args: [] };
  const args = inner.split(",").map((a) => a.trim());
  for (const arg of args) {
    if (arg === "") {
      throw new JiePlatformError("INVALID_TOOL_SPEC", { detail: `tool spec '${spec}': empty argument` });
    }
  }
  return { name, args };
}
