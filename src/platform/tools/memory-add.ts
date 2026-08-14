import { Type } from "typebox";
import { logger } from "../../utils";
import type { SettingsStore } from "../config";
import type { MemoryManager } from "../memory";
import type { Tool, ToolResult } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

const MEMORY_ADD_DESCRIPTION = `Store a memory in the team's long-term memory.
\`content\` is a self-contained statement with no conversation-dependent pronouns.
\`type\` is \`fact\`, \`decision\`, \`method\`, or \`instruction\`.
\`priority\` is 0-100 (default 50); \`instruction\` is always stored at 100.
\`scene\` defaults to \`manual\`.
Returns the number of new memories stored, or a reinforcement message when an identical one exists.`;

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
