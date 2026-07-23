import type { Tool } from "./types";
import { createBashTool } from "./bash";
import { createEditTool } from "./edit";
import { createNotifyTool } from "./notify";
import { createReadArtifactTool } from "./read-artifact";
import { createReadFileTool } from "./read-file";
import { createTodoWriteTool } from "./todo-write";
import { createWebFetchTool } from "./web-fetch";
import { createWebSearchProvider, createWebSearchTool } from "./web-search";
import { createWriteArtifactTool } from "./write-artifact";
import { createWriteFileTool } from "./write-file";
import type { EventManager } from "../event";
import type { ArtifactStore } from "../storage";

export interface ToolRegistry {
  register(name: string, tool: Tool): void;
  resolve(spec: string): Tool[];
  list(): Tool[];
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly globs = new Map<string, Bun.Glob>();

  constructor(cwd: string, eventManager: EventManager, artifactStore: ArtifactStore) {
    for (const builtin of builtins(cwd, eventManager, artifactStore)) {
      this.register(builtin.name, builtin.tool);
    }
  }

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  resolve(spec: string): Tool[] {
    const pattern = parseToolPattern(spec);
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

interface BuiltinTool {
  name: string;
  tool: Tool;
}

function builtins(workspaceRoot: string, eventManager: EventManager, artifactStore: ArtifactStore): BuiltinTool[] {
  return [
    { name: "bash", tool: createBashTool({ workspaceRoot }) as Tool },
    { name: "read_file", tool: createReadFileTool({ workspaceRoot }) as Tool },
    { name: "write_file", tool: createWriteFileTool({ workspaceRoot }) as Tool },
    { name: "edit", tool: createEditTool({ workspaceRoot }) as Tool },
    { name: "read_artifact", tool: createReadArtifactTool({ artifactStore }) as Tool },
    { name: "write_artifact", tool: createWriteArtifactTool({ artifactStore }) as Tool },
    { name: "todo_write", tool: createTodoWriteTool() as Tool },
    { name: "notify", tool: createNotifyTool({ eventManager }) as Tool },
    { name: "web_fetch", tool: createWebFetchTool() as Tool },
    { name: "web_search", tool: createWebSearchTool({ provider: createWebSearchProvider() }) as Tool },
  ];
}

function parseToolPattern(toolSpec: string): string {
  const lastColon = toolSpec.lastIndexOf(":");
  if (lastColon === -1) return toolSpec;
  return toolSpec.substring(lastColon + 1);
}
