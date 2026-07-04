import type { TSchema } from "typebox";
import type { ArtifactStore } from "../storage";

export interface ExecutionContext {
  readonly sessionId: string;
  readonly teamId: string;
  readonly agentKey: string;
  readonly agentRole: string;
  readonly artifactStore: ArtifactStore;
}

export interface ToolResult {
  readonly content: string;
  readonly details?: unknown;
  readonly terminate?: boolean;
}

export interface Tool<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly label: string;
  readonly timeout?: number;
  readonly parameters: TSchema;
  execute(
    input: TInput,
    executionContext: ExecutionContext,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
}
