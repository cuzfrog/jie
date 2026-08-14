import { Events, type EventManager } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import type { QuestionAnswer, QuestionItem } from "../types";

export interface QuestionRequest {
  readonly teamId: string;
  readonly agentKey: string;
  readonly questions: ReadonlyArray<QuestionItem>;
}

export interface QuestionResult {
  readonly requestId: string;
  readonly cancelled: boolean;
  readonly answers: ReadonlyArray<QuestionAnswer> | null;
}

export interface QuestionBroker {
  ask(request: QuestionRequest, signal?: AbortSignal): Promise<QuestionResult>;
  answer(requestId: string, teamId: string, agentKey: string, result: Omit<QuestionResult, "requestId">): void;
}

interface PendingRequest {
  readonly teamId: string;
  readonly agentKey: string;
  resolve(value: QuestionResult): void;
  reject(error: unknown): void;
}

export class InProcessQuestionBroker implements QuestionBroker {
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly eventManager: EventManager,
    private readonly generateId: () => string,
  ) {}

  ask(request: QuestionRequest, signal?: AbortSignal): Promise<QuestionResult> {
    const requestId = this.generateId();
    const envelope = Events.agentQuestionAsk({ kind: "agent", teamId: request.teamId, agentKey: request.agentKey }, requestId, request.questions);
    this.eventManager.publish(envelope);

    return new Promise<QuestionResult>((resolve, reject) => {
      this.pending.set(requestId, { teamId: request.teamId, agentKey: request.agentKey, resolve, reject });
      if (signal === undefined) return;
      if (signal.aborted) {
        this.reject(requestId, "QUESTION_CANCELLED", signal.reason === undefined ? "aborted" : String(signal.reason));
        return;
      }
      signal.addEventListener("abort", () => {
        this.reject(requestId, "QUESTION_CANCELLED", signal.reason === undefined ? "aborted" : String(signal.reason));
      }, { once: true });
    });
  }

  answer(requestId: string, teamId: string, agentKey: string, result: Omit<QuestionResult, "requestId">): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) {
      throw new JiePlatformError("QUESTION_NOT_FOUND", { detail: `no pending question with requestId '${requestId}'` });
    }
    if (pending.teamId !== teamId || pending.agentKey !== agentKey) {
      throw new JiePlatformError("QUESTION_UNAUTHORIZED", { detail: `request '${requestId}' was asked by a different team or agent` });
    }
    this.pending.delete(requestId);
    pending.resolve({ requestId, ...result });
  }

  private reject(requestId: string, code: "QUESTION_CANCELLED", detail: string): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) return;
    this.pending.delete(requestId);
    pending.reject(new JiePlatformError(code, { detail }));
  }
}
