import type { Tool } from "./types";
import { createBashTool } from "./bash";
import { createEditTool } from "./edit";
import { createFileMutationQueue } from "./file-mutation-queue";
import { createMemorySearchTool } from "./memory-search";
import { createNotifyTool } from "./notify";
import { createReadArtifactTool } from "./read-artifact";
import { createReadFileTool } from "./read-file";
import { createKanbanWriteTool } from "./kanban-write";
import { createTaskLifecycleGuard } from "./task-lifecycle";
import { createWebFetchTool } from "./web-fetch";
import { createWebSearchProvider, createWebSearchTool } from "./web-search";
import { createWriteArtifactTool } from "./write-artifact";
import { createWriteFileTool } from "./write-file";
import type { SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { MemoryStore } from "../memory";
import type { ArtifactStore } from "../storage";

export interface ToolRegistry {
  register(name: string, tool: Tool): void;
  resolve(spec: string): Tool[];
  list(): Tool[];
}

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly globs = new Map<string, Bun.Glob>();

  constructor(
    cwd: string,
    eventManager: EventManager,
    artifactStore: ArtifactStore,
    memoryStore: MemoryStore,
    settingsStore: SettingsStore,
  ) {
    for (const builtin of builtins(cwd, eventManager, artifactStore, memoryStore, settingsStore)) {
      this.register(builtin.name, builtin.tool);
    }
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

interface BuiltinTool {
  name: string;
  tool: Tool;
}

function builtins(
  workspaceRoot: string,
  eventManager: EventManager,
  artifactStore: ArtifactStore,
  memoryStore: MemoryStore,
  settingsStore: SettingsStore,
): BuiltinTool[] {
  const fileMutationQueue = createFileMutationQueue();
  const taskLifecycleGuard = createTaskLifecycleGuard(artifactStore);
  return [
    { name: "bash", tool: createBashTool({ workspaceRoot }) as Tool },
    { name: "read_file", tool: createReadFileTool({ workspaceRoot }) as Tool },
    { name: "write_file", tool: createWriteFileTool({ workspaceRoot, fileMutationQueue }) as Tool },
    { name: "edit", tool: createEditTool({ workspaceRoot, fileMutationQueue }) as Tool },
    { name: "read_artifact", tool: createReadArtifactTool({ artifactStore }) as Tool },
    { name: "write_artifact", tool: createWriteArtifactTool({ artifactStore }) as Tool },
    { name: "kanban_write", tool: createKanbanWriteTool() as Tool },
    { name: "memory_search", tool: createMemorySearchTool({ memoryStore, settingsStore }) as Tool },
    { name: "notify", tool: createNotifyTool({ eventManager, taskLifecycleGuard }) as Tool },
    { name: "web_fetch", tool: createWebFetchTool() as Tool },
    { name: "web_search", tool: createWebSearchTool({ provider: createWebSearchProvider() }) as Tool },
  ];
}
