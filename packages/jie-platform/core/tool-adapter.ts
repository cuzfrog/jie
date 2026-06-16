import { Value } from "typebox/value";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExecutionContext, Tool } from "../tools/types.ts";

/** Adapt a Jie `Tool` into pi-agent's `AgentTool`. Wraps
 *  `execute` so the result shape (`{ content, details, terminate }`)
 *  becomes pi-agent's `{ content: [{ type: "text", text }], details, terminate }`.
 *  Combines pi-agent's `signal` with `AbortSignal.timeout(tool.timeout ?? 120_000)`.
 *  `prepareArguments` validates the LLM-supplied args against the
 *  TypeBox schema (`Value.Check`) — no coercion in v1. */
export function adaptToolToAgent(
  tool: Tool,
  ctx: ExecutionContext,
): AgentTool {
  return {
    name: tool.name,
    description: tool.description,
    label: tool.label,
    parameters: tool.parameters,
    prepareArguments(raw: unknown) {
      if (!Value.Check(tool.parameters, raw)) {
        throw new Error(
          `Tool ${tool.name}: argument does not match schema`,
        );
      }
      return raw as ReturnType<typeof Value.Create>;
    },
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
    ) => {
      const timeoutMs = tool.timeout ?? 120_000;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combined = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
      try {
        const result = await tool.execute(
          params as Parameters<typeof tool.execute>[0],
          ctx,
          combined,
        );
        return {
          content: [{ type: "text", text: result.content }],
          details: result.details,
          terminate: result.terminate ?? false,
        };
      } finally {
        void toolCallId;
      }
    },
    executionMode: "sequential",
  };
}