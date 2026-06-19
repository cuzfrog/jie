import type { Tool } from "./types.ts";

/** Central catalog of tools available to agents. The platform feeds it
 *  at startup; the registry is storage-agnostic (a Tool is a Tool,
 *  regardless of MCP origin). */
export interface ToolRegistry {
  /** Add a tool. Duplicate names replace the prior entry (last
   *  writer wins). */
  register(name: string, tool: Tool): void;

  /** Match the spec string against registered tool names using
   *  anchored shell-style glob (`*`, `?`). A spec of the form
   *  `mcp:<server>:<pattern>` (or any string containing `:`) uses
   *  the part after the last `:` as the glob pattern, so the
   *  registered tool names are matched directly. In v1 (no MCP
   *  client), the registry holds no `mcp:`-prefixed tools, so
   *  `mcp:<server>:<bare-name>` returns `[]` because no tool is
   *  named `<bare-name>`. Returns matched `Tool` instances; zero
   *  matches is not an error. */
  resolve(spec: string): Tool[];

  /** All registered tools. */
  list(): Tool[];
}

export function createToolRegistry(): ToolRegistry {
  return new InMemoryToolRegistry();
}

/** Default implementation. Tools are kept in a `Map` (insertion
 *  order preserved, replace-on-duplicate). Glob matching is
 *  delegated to `Bun.Glob` per the platform's runtime-deps block. */
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