import { Type } from "typebox";
import { logger } from "@cuzfrog/jie-utils";
import type { SettingsStore } from "../config";
import type { Memory, MemoryManager } from "../memory";
import type { Tool, ToolResult } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

const MEMORY_SEARCH_DESCRIPTION = `Search the team's long-term memory — distilled memories from past sessions (facts, decisions,
methods, and standing instructions). Use it to recall established knowledge before re-establishing it, and to
check whether a question was already settled. Searches the whole team pool, not just this session.`;

interface MemorySearchInput {
  query: string;
  limit?: number;
}

export function createMemorySearchTool(deps: { memoryManager: MemoryManager; settingsStore: SettingsStore }): Tool<MemorySearchInput> {
  return {
    name: "memory_search",
    description: MEMORY_SEARCH_DESCRIPTION,
    label: "Search Memory",
    parameters: Type.Object({
      query: Type.String({ minLength: 1 }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    async execute(input: MemorySearchInput, executionContext): Promise<ToolResult> {
      if (deps.settingsStore.load().memory?.enabled === false) {
        return { content: "long-term memory is disabled" };
      }
      const query = input.query.trim();
      if (query === "") return { content: "no matching memories" };
      let memories: ReadonlyArray<Memory>;
      try {
        memories = deps.memoryManager.search(query, executionContext.teamId, input.limit ?? 5);
      } catch (error) {
        log.warn(`memory search failed: ${error instanceof Error ? error.message : String(error)}`);
        return { content: "no matching memories" };
      }
      if (memories.length === 0) return { content: "no matching memories" };
      const lines = memories.map((m) => {
        const date = m.createdAt.slice(0, 10);
        return `- [${m.type}] ${m.content} (scene: ${m.scene}, session: ${m.sourceSessionId}, ${date})`;
      });
      return { content: lines.join("\n") };
    },
  };
}
