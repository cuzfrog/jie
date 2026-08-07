import type { TSchema } from "typebox";
import type { ArtifactStore } from "../storage";
import type { KanbanCard, TaskLifecycle } from "../types";

export interface EditResultDetails {
    readonly kind: "diff";
    readonly path: string;
    readonly replacementsCount: number;
    readonly beforeBytes: number;
    readonly afterBytes: number;
    readonly diff: string | null;
}

export interface WriteFileResultDetails {
    readonly kind: "diff";
    readonly path: string;
    readonly bytesWritten: number;
    readonly createdAt: string;
    readonly diff: string | null;
}

export interface KanbanDetails {
    readonly kind: "kanban";
    readonly cards: ReadonlyArray<KanbanCard>;
}

export interface BashResultDetails {
    readonly exitCode: number;
    readonly truncated: { readonly stdout: boolean; readonly stderr: boolean };
}

export interface WebSearchResultDetails {
    readonly results: ReadonlyArray<{ readonly title: string; readonly url: string; readonly snippet: string }>;
    readonly query: string;
    readonly maxResults: number;
}

export interface ReadFileResultDetails {
    readonly truncated: { readonly content: boolean };
}

export interface ReadArtifactResultDetails {
    readonly key: string;
    readonly content: string;
    readonly created_at: string;
}

export interface WriteArtifactResultDetails {
    readonly key: string;
    readonly created_at: string;
}

export interface NotifyResultDetails {
    readonly topic: string;
    readonly task_id?: string;
    readonly phase?: string;
    readonly iteration?: number;
}

export interface WebFetchResultDetails {
    readonly status: number;
    readonly truncated: boolean;
}

export type ToolResultDetails =
    | EditResultDetails
    | WriteFileResultDetails
    | KanbanDetails
    | BashResultDetails
    | WebSearchResultDetails
    | ReadFileResultDetails
    | ReadArtifactResultDetails
    | WriteArtifactResultDetails
    | NotifyResultDetails
    | WebFetchResultDetails;

export function isDiffDetails(details: ToolResultDetails | null | undefined): details is EditResultDetails | WriteFileResultDetails {
    return typeof details === "object" && details !== null && "kind" in details && details.kind === "diff"
        && typeof details.path === "string" && (details.diff === null || typeof details.diff === "string");
}

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
