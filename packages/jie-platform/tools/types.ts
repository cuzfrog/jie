import type { TSchema } from "typebox";
import type { ArtifactStore } from "../storage";
import type { TaskLifecycle, ToolResultDetails } from "../types";

export interface ExecutionContext {
  readonly sessionId: string;
  readonly teamId: string;
  readonly agentKey: string;
  readonly agentRole: string;
  readonly artifactStore: ArtifactStore;
  readonly lifecycle: TaskLifecycle | null;
}

export interface ToolResult {
  readonly content: string;
  readonly details?: ToolResultDetails | null;
  readonly terminate?: boolean;
}

export interface Tool<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly label: string;
  readonly timeout?: number;
  readonly isUtility?: boolean;
  readonly parameters: TSchema;
  prepareArguments?(raw: unknown): unknown;
  execute(
    input: TInput,
    executionContext: ExecutionContext,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
}
