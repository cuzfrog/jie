import {
  type ChatCompletionRequestBody,
  type Expectation,
  type RecordedCall,
  lastUserText,
  selectExpectation,
} from "./expectations.ts";

export interface ExpectationStore {
  register(expectations: ReadonlyArray<Expectation>): void;
  clear(): void;
  selectAndRecord(req: ChatCompletionRequestBody): { readonly index: number; readonly expectation: Expectation } | undefined;
  calls(): ReadonlyArray<RecordedCall>;
  expectationCount(): number;
}

export class ExpectationStoreImpl implements ExpectationStore {
  private expectations: Expectation[] = [];
  private recordedCalls: RecordedCall[] = [];

  register(expectations: ReadonlyArray<Expectation>): void {
    this.expectations = [...expectations];
    this.recordedCalls = [];
  }

  clear(): void {
    this.expectations = [];
    this.recordedCalls = [];
  }

  selectAndRecord(req: ChatCompletionRequestBody): { readonly index: number; readonly expectation: Expectation } | undefined {
    const picked = selectExpectation(this.expectations, req);
    this.recordedCalls.push({
      expectationIndex: picked?.index ?? -1,
      model: req.model,
      lastUserText: lastUserText(req),
    });
    return picked;
  }

  calls(): ReadonlyArray<RecordedCall> {
    return this.recordedCalls;
  }

  expectationCount(): number {
    return this.expectations.length;
  }
}
