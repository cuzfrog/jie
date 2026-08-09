import type { Tool } from "./types";
import type { BuiltinTool } from "./tool-registry";
import { createBashTool } from "./bash";
import { createEditTool } from "./edit_file";
import { createFileMutationQueue } from "./file-mutation-queue";
import { createFindArtifactTool } from "./find-artifact";
import { createFindFileTool } from "./find-file";
import { createGrepFileTool } from "./grep-file";
import { createLsTool } from "./ls";
import { createMemoryAddTool } from "./memory-add";
import { createMemorySearchTool } from "./memory-search";
import { createNotifyTool } from "./notify";
import { createReadArtifactTool } from "./read-artifact";
import { createReadFileTool } from "./read-file";
import { createKanbanWriteTool } from "./write-kanban";
import { createWebFetchTool } from "./web-fetch";
import { createWebSearchProvider, createWebSearchTool } from "./web-search";
import { createWriteArtifactTool } from "./write-artifact";
import { createWriteFileTool } from "./write-file";
import type { SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { MemoryManager } from "../memory";
import type { ArtifactStore, KanbanStore } from "../storage";

export function createBuiltinTools(
  cwd: string,
  eventManager: EventManager,
  artifactStore: ArtifactStore,
  memoryManager: MemoryManager,
  settingsStore: SettingsStore,
  kanbanStore: KanbanStore,
): BuiltinTool[] {
  const fileMutationQueue = createFileMutationQueue();
  return [
    { name: "bash", tool: createBashTool({ workspaceRoot: cwd }) as Tool },
    { name: "read_file", tool: createReadFileTool({ workspaceRoot: cwd }) as Tool },
    { name: "write_file", tool: createWriteFileTool({ workspaceRoot: cwd, fileMutationQueue }) as Tool },
    { name: "edit_file", tool: createEditTool({ workspaceRoot: cwd, fileMutationQueue }) as Tool },
    { name: "ls", tool: createLsTool({ workspaceRoot: cwd }) as Tool },
    { name: "find_file", tool: createFindFileTool({ workspaceRoot: cwd }) as Tool },
    { name: "grep_file", tool: createGrepFileTool({ workspaceRoot: cwd }) as Tool },
    { name: "read_artifact", tool: createReadArtifactTool({ artifactStore }) as Tool },
    { name: "write_artifact", tool: createWriteArtifactTool({ artifactStore }) as Tool },
    { name: "find_artifact", tool: createFindArtifactTool({ artifactStore }) as Tool },
    { name: "write_kanban", tool: createKanbanWriteTool({ kanbanStore }) as Tool },
    { name: "memory_add", tool: createMemoryAddTool({ memoryManager, settingsStore }) as Tool },
    { name: "memory_search", tool: createMemorySearchTool({ memoryManager, settingsStore }) as Tool },
    { name: "notify", tool: createNotifyTool({ eventManager }) as Tool },
    { name: "web_fetch", tool: createWebFetchTool() as Tool },
    { name: "web_search", tool: createWebSearchTool({ provider: createWebSearchProvider() }) as Tool },
  ];
}
