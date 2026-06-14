import type { TSchema } from "typebox";
import type { ArtifactStore } from "../storage/artifact-store.ts";

/** Per-invocation context closed over at body construction. The
 *  bus, the LLM client, the prompt queue are NOT exposed. Tools
 *  never receive different execution contexts within the same
 *  agent's lifetime. */
export interface ExecutionContext {
  session_id: string;
  team_id: string;
  agent_key: string;
  agent_role: string;
  artifacts: ArtifactStore;
}

/** Tool execution output. `content` is the LLM-visible text;
 *  `details` is opaque to the LLM conversation but visible to
 *  observers (afterToolCall hooks, TUI); `terminate` is a hint
 *  to the LLM loop to stop after this tool batch. */
export interface ToolResult {
  content: string;
  details?: unknown;
  terminate?: boolean;
}

/** A typed function exposed to the LLM. The `parameters` field is a
 *  TypeBox schema — the LLM tool description / validation. `execute`
 *  is the body of the tool. */
export interface Tool<TInput = unknown> {
  name: string;
  description: string;
  label: string;
  timeout?: number;
  parameters: TSchema;
  execute: (
    input: TInput,
    ctx: ExecutionContext,
    signal?: AbortSignal,
  ) => Promise<ToolResult>;
}