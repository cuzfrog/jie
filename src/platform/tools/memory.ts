import { Type } from "typebox";
import { logger } from "../../utils";
import type { SettingsStore } from "../config";
import type { Memory, MemoryManager } from "../memory";
import { JiePlatformError } from "../jie-platform-errors";
import type { ExecutionContext, Tool, ToolResult } from "./types";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

const MEMORY_DESCRIPTION = `Team long-term memory: distilled knowledge from past sessions, shared across the whole team pool. op="add": store a self-contained statement; type is fact|decision|method|instruction, priority 0-100 (default 50; instruction is always stored at 100). op="search": recall settled knowledge before re-establishing it (limit default 5).`;

export interface MemoryDeps {
  memoryManager: MemoryManager;
  settingsStore: SettingsStore;
}

interface MemoryInput {
  op: "add" | "search";
  content?: string;
  type?: "fact" | "decision" | "method" | "instruction";
  priority?: number;
  scene?: string;
  query?: string;
  limit?: number;
}

export function createMemoryTool(deps: MemoryDeps): Tool<MemoryInput> {
  return {
    name: "memory",
    description: MEMORY_DESCRIPTION,
    label: "Memory",
    parameters: Type.Object({
      op: Type.Union([Type.Literal("add"), Type.Literal("search")]),
      content: Type.Optional(Type.String({ minLength: 1 })),
      type: Type.Optional(Type.Union([
        Type.Literal("fact"),
        Type.Literal("decision"),
        Type.Literal("method"),
        Type.Literal("instruction"),
      ])),
      priority: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
      scene: Type.Optional(Type.String()),
      query: Type.Optional(Type.String({ minLength: 1 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    async execute(input: MemoryInput, executionContext: ExecutionContext): Promise<ToolResult> {
      if (deps.settingsStore.load().memory?.enabled === false) {
        return { content: "long-term memory is disabled" };
      }
      assertOpAllowed(input.op, executionContext);
      return input.op === "add" ? addMemory(deps.memoryManager, input, executionContext) : searchMemory(deps.memoryManager, input, executionContext);
    },
  };
}

function assertOpAllowed(op: string, executionContext: ExecutionContext): void {
  const allowed = executionContext.toolArgs.get("memory");
  if (allowed !== undefined && !allowed.includes(op)) {
    throw new JiePlatformError("TOOL_OP_DENIED", {
      detail: `op '${op}' is not allowed for role '${executionContext.agentRole}'`,
    });
  }
}

function addMemory(memoryManager: MemoryManager, input: MemoryInput, executionContext: ExecutionContext): ToolResult {
  if (input.content === undefined || input.content === "") {
    throw new JiePlatformError("INVALID_TOOL_ARGS", { detail: "'content' is required for op 'add'" });
  }
  if (input.type === undefined) {
    throw new JiePlatformError("INVALID_TOOL_ARGS", { detail: "'type' is required for op 'add'" });
  }
  const memory = { content: input.content, type: input.type, priority: input.priority ?? 50, scene: input.scene ?? "manual" };
  try {
    const stored = memoryManager.add([memory], executionContext.teamId, executionContext.sessionId);
    const summary = stored === 0 ? "reinforced existing memory" : `stored ${stored} new memory`;
    return { content: `${summary}: [${input.type}] ${input.content}` };
  } catch (error) {
    log.warn(`memory add failed: ${error instanceof Error ? error.message : String(error)}`);
    return { content: `failed to add memory: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function searchMemory(memoryManager: MemoryManager, input: MemoryInput, executionContext: ExecutionContext): ToolResult {
  if (input.query === undefined) {
    throw new JiePlatformError("INVALID_TOOL_ARGS", { detail: "'query' is required for op 'search'" });
  }
  const query = input.query.trim();
  if (query === "") return { content: "no matching memories" };
  let memories: ReadonlyArray<Memory>;
  try {
    memories = memoryManager.search(query, executionContext.teamId, input.limit ?? 5);
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
}
