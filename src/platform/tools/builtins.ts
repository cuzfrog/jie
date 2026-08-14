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
import { createCallAgentTool } from "./call-agent";
import { createReadArtifactTool } from "./read-artifact";
import { createReadFileTool } from "./read-file";
import { createKanbanClaimTool } from "./claim-kanban";
import { createKanbanUpdateTool } from "./update-kanban";
import { createKanbanWriteTool } from "./write-kanban";
import { createWebFetchTool } from "./web-fetch";
import { createWebSearchProvider, createWebSearchTool } from "./web-search";
import { createWriteArtifactTool } from "./write-artifact";
import { createWriteFileTool } from "./write-file";
import type { SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { MemoryManager } from "../memory";
import type { ArtifactStore, KanbanStore } from "../storage";
import { createAskUserQuestionsTool } from "./ask-user-questions";
import type { QuestionBroker } from "./ask-user-questions-broker";

export function createBuiltinTools(
  cwd: string,
  eventManager: EventManager,
  artifactStore: ArtifactStore,
  memoryManager: MemoryManager,
  settingsStore: SettingsStore,
  kanbanStore: KanbanStore,
  questionBroker: QuestionBroker,
): BuiltinTool[] {
  const fileMutationQueue = createFileMutationQueue();
  return [
    { name: "bash", tool: createBashTool({ workspaceRoot: cwd }) },
    { name: "read_file", tool: createReadFileTool({ workspaceRoot: cwd }) },
    { name: "write_file", tool: createWriteFileTool({ workspaceRoot: cwd, fileMutationQueue }) },
    { name: "edit_file", tool: createEditTool({ workspaceRoot: cwd, fileMutationQueue }) },
    { name: "ls", tool: createLsTool({ workspaceRoot: cwd }) },
    { name: "find_file", tool: createFindFileTool({ workspaceRoot: cwd }) },
    { name: "grep_file", tool: createGrepFileTool({ workspaceRoot: cwd }) },
    { name: "read_artifact", tool: createReadArtifactTool({ artifactStore }) },
    { name: "write_artifact", tool: createWriteArtifactTool({ artifactStore }) },
    { name: "find_artifact", tool: createFindArtifactTool({ artifactStore }) },
    { name: "write_kanban", tool: createKanbanWriteTool({ kanbanStore }) },
    { name: "update_kanban", tool: createKanbanUpdateTool({ kanbanStore }) },
    { name: "claim_kanban", tool: createKanbanClaimTool({ kanbanStore }) },
    { name: "memory_add", tool: createMemoryAddTool({ memoryManager, settingsStore }) },
    { name: "memory_search", tool: createMemorySearchTool({ memoryManager, settingsStore }) },
    { name: "notify", tool: createNotifyTool({ eventManager }) },
    { name: "ask_user_questions", tool: createAskUserQuestionsTool({ questionBroker }) },
    { name: "call_agent", tool: createCallAgentTool() },
    { name: "web_fetch", tool: createWebFetchTool() },
    { name: "web_search", tool: createWebSearchTool({ provider: createWebSearchProvider() }) },
  ];
}
