import type { Tool } from "./types.ts";

export interface ToolRegistry {

  register(name: string, tool: Tool): void;

  resolve(spec: string): Tool[];

  list(): Tool[];
}

export function createToolRegistry(): ToolRegistry {
  return new InMemoryToolRegistry();
}

class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly globs = new Map<string, Bun.Glob>();

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  resolve(spec: string): Tool[] {
    const pattern = specPattern(spec);
    let glob = this.globs.get(pattern);
    if (glob === undefined) {
      glob = new Bun.Glob(pattern);
      this.globs.set(pattern, glob);
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

function specPattern(spec: string): string {
  const lastColon = spec.lastIndexOf(":");
  if (lastColon === -1) return spec;
  return spec.substring(lastColon + 1);
}