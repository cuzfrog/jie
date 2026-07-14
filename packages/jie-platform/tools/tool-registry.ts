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

interface CreateToolRegistryParams {
  workspaceRoot: string;
  eventManager: EventManager;
  artifactStore: ArtifactStore;
}

export function createToolRegistry(params: CreateToolRegistryParams): ToolRegistry {
  const registry = new InMemoryToolRegistry();
  for (const builtin of builtins(params)) {
    registry.register(builtin.name, builtin.tool);
  }
  return registry;
}

interface BuiltinTool {
  name: string;
  tool: Tool;
}

function builtins(params: CreateToolRegistryParams): BuiltinTool[] {
  return [
    { name: "bash", tool: createBashTool({ workspaceRoot: params.workspaceRoot }) as Tool },
    { name: "read_file", tool: createReadFileTool({ workspaceRoot: params.workspaceRoot }) as Tool },
    { name: "write_file", tool: createWriteFileTool({ workspaceRoot: params.workspaceRoot }) as Tool },
    { name: "edit", tool: createEditTool({ workspaceRoot: params.workspaceRoot }) as Tool },
    { name: "read_artifact", tool: createReadArtifactTool({ artifactStore: params.artifactStore }) as Tool },
    { name: "write_artifact", tool: createWriteArtifactTool({ artifactStore: params.artifactStore }) as Tool },
    { name: "todo_write", tool: createTodoWriteTool() as Tool },
    { name: "notify", tool: createNotifyTool({ eventManager: params.eventManager }) as Tool },
    { name: "web_fetch", tool: createWebFetchTool() as Tool },
    { name: "web_search", tool: createWebSearchTool({ provider: createWebSearchProvider() }) as Tool },
  ];
}

class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly globs = new Map<string, Bun.Glob>();

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

function parseToolPattern(toolSpec: string): string {
  const lastColon = toolSpec.lastIndexOf(":");
  if (lastColon === -1) return toolSpec;
  return toolSpec.substring(lastColon + 1);
}
