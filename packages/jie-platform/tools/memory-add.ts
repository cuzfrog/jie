import { Type } from "typebox";
import { logger } from "@cuzfrog/jie-utils";
import type { SettingsStore } from "../config";
import type { MemoryManager } from "../memory";
import type { Tool, ToolResult } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

const MEMORY_ADD_DESCRIPTION = `Add a memory to the team's long-term memory. Memories survive sessions and are
recalled at session start and via memory_search. Use this to record facts, decisions,
methods, or standing instructions the user wants to keep.

Parameters:
- content: a self-contained statement with no pronouns needing the current conversation.
- type: one of fact, decision, method, instruction.
- priority: 0-100 (default 50). instruction is always stored at priority 100.
- scene: an optional one-line context; defaults to "manual".`;

interface MemoryAddInput {
  content: string;
  type: "fact" | "decision" | "method" | "instruction";
  priority?: number;
  scene?: string;
}

export function createMemoryAddTool(deps: { memoryManager: MemoryManager; settingsStore: SettingsStore }): Tool<MemoryAddInput> {
  return {
    name: "memory_add",
    description: MEMORY_ADD_DESCRIPTION,
    label: "Add Memory",
    isUtility: true,
    parameters: Type.Object({
      content: Type.String({ minLength: 1 }),
      type: Type.Union([
        Type.Literal("fact"),
        Type.Literal("decision"),
        Type.Literal("method"),
        Type.Literal("instruction"),
      ]),
      priority: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
      scene: Type.Optional(Type.String()),
    }),
    async execute(input: MemoryAddInput, executionContext): Promise<ToolResult> {
      if (deps.settingsStore.load().memory?.enabled === false) {
        return { content: "long-term memory is disabled" };
      }
      const scene = input.scene ?? "manual";
      const priority = input.priority ?? 50;
      const memory = { content: input.content, type: input.type, priority, scene };
      try {
        const stored = deps.memoryManager.add([memory], executionContext.teamId, executionContext.sessionId);
        const summary = stored === 0 ? "reinforced existing memory" : `stored ${stored} new memory`;
        return { content: `${summary}: [${input.type}] ${input.content}` };
      } catch (error) {
        log.warn(`memory add failed: ${error instanceof Error ? error.message : String(error)}`);
        return { content: `failed to add memory: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  };
}
