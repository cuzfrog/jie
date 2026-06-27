import type { Tool } from "./types.ts";
import { createBashTool } from "./bash.ts";
import { createNotifyTool } from "./notify.ts";
import { createReadArtifactTool } from "./read-artifact.ts";
import { createReadFileTool } from "./read-file.ts";
import { createWebFetchTool } from "./web-fetch.ts";
import { createWebSearchProvider, createWebSearchTool } from "./web-search.ts";
import { createWriteArtifactTool } from "./write-artifact.ts";
import { createWriteFileTool } from "./write-file.ts";
import type { EventManager } from "../event/index.ts";
import type { ArtifactStore } from "../storage/index.ts";

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
  registry.register("write_artifact", createWriteArtifactTool({ artifacts: params.artifactStore }) as Tool);
  registry.register("notify", createNotifyTool({ events: params.eventManager }) as Tool);
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
