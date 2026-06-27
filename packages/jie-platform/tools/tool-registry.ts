import type { Tool } from "./types";
import { createBashTool } from "./bash";
import { createNotifyTool } from "./notify";
import { createReadArtifactTool } from "./read-artifact";
import { createReadFileTool } from "./read-file";
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
  registry.register("bash", createBashTool({ workspaceRoot: params.workspaceRoot }) as Tool);
  registry.register("read_file", createReadFileTool({ workspaceRoot: params.workspaceRoot }) as Tool);
  registry.register("write_file", createWriteFileTool({ workspaceRoot: params.workspaceRoot }) as Tool);
  registry.register("read_artifact", createReadArtifactTool({ artifactStore: params.artifactStore }) as Tool);
  registry.register("write_artifact", createWriteArtifactTool({ artifactStore: params.artifactStore }) as Tool);
  registry.register("notify", createNotifyTool({ eventManager: params.eventManager }) as Tool);
  registry.register("web_fetch", createWebFetchTool() as Tool);
  registry.register("web_search", createWebSearchTool({ provider: createWebSearchProvider() }) as Tool);
  return registry;
}

class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly globs = new Map<string, Bun.Glob>();

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  resolve(spec: string): Tool[] {
    const pattern = extractToolNameFromSpec(spec);
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

function extractToolNameFromSpec(toolSpec: string): string {
  const lastColon = toolSpec.lastIndexOf(":");
  if (lastColon === -1) return toolSpec;
  return toolSpec.substring(lastColon + 1);
}
