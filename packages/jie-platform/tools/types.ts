import type { TSchema } from "typebox";
import type { ArtifactStore } from "../storage/artifact-store.ts";

export interface ExecutionContext {
  session_id: string;
  team_id: string;
  agent_key: string;
  agent_role: string;
  artifacts: ArtifactStore;
}

export interface ToolResult {
  content: string;
  details?: unknown;
  terminate?: boolean;
}

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