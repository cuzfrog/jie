import { Type } from "typebox";
import type { SettingsStore } from "../config";
import type { MemoryAtom, MemoryStore } from "../memory";
import type { Tool, ToolResult } from "./types";

const MEMORY_SEARCH_DESCRIPTION = `Search the team's long-term memory — atoms distilled from past sessions (facts, decisions,
methods, and standing instructions). Use it to recall established knowledge before re-establishing it, and to
check whether a question was already settled. Searches the whole team pool, not just this session.`;

interface MemorySearchInput {
  query: string;
  limit?: number;
}

export function createMemorySearchTool(deps: { memoryStore: MemoryStore; settingsStore: SettingsStore }): Tool<MemorySearchInput> {
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
      let atoms: ReadonlyArray<MemoryAtom>;
      try {
        atoms = await deps.memoryStore.search(query, executionContext.teamId, input.limit ?? 5);
      } catch {
        return { content: "no matching memories" };
      }
      if (atoms.length === 0) return { content: "no matching memories" };
      const lines = atoms.map((atom) => {
        const date = atom.createdAt.slice(0, 10);
        return `- [${atom.type}] ${atom.content} (scene: ${atom.scene}, session: ${atom.sourceSessionId}, ${date})`;
      });
      return { content: lines.join("\n") };
    },
  };
}