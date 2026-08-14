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
  answer(requestId: string, result: Omit<QuestionResult, "requestId">): void;
}

interface PendingRequest {
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
      this.pending.set(requestId, { resolve, reject });
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

  answer(requestId: string, result: Omit<QuestionResult, "requestId">): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) {
      throw new JiePlatformError("QUESTION_NOT_FOUND", { detail: `no pending question with requestId '${requestId}'` });
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
