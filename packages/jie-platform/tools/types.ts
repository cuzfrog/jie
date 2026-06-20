import type { TSchema } from "typebox";
import type { ArtifactStore } from "../storage/artifact-store.ts";

export interface ExecutionContext {
  sessionId: string;
  teamId: string;
  agentKey: string;
  agentRole: string;
  artifactStore: ArtifactStore;
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