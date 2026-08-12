import type { Tool } from "./types";

export interface ToolRegistry {
  register(name: string, tool: Tool): void;
  resolve(spec: string): Tool[];
  list(): Tool[];
}

export interface BuiltinTool {
  readonly name: string;
  readonly tool: Tool;
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly globs = new Map<string, Bun.Glob>();

  constructor(builtinTools: ReadonlyArray<BuiltinTool> = []) {
    for (const builtin of builtinTools) this.register(builtin.name, builtin.tool);
  }

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  resolve(spec: string): Tool[] {
    let glob = this.globs.get(spec);
    if (glob === undefined) {
      glob = new Bun.Glob(spec);
      this.globs.set(spec, glob);
    }
    const matched: Tool[] = [];
    for (const [name, tool] of this.tools) {
      if (glob.match(name)) matched.push(tool);
    }
    return matched;
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}
