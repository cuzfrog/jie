import type { Expectation } from "../../mock-llm-backend";

const DEV = "You are the Developer";
const ARCH = "You are the Architect";
const PEER = "You are the Peer";

function textStop(delta: string): Expectation["responseChunks"] {
  return [{ kind: "text", delta }, { kind: "finish", reason: "stop" }];
}

function toolCall(id: string, name: string, args: string): Expectation["responseChunks"] {
  return [{ kind: "tool_call", id, name, argumentsChunks: [args] }, { kind: "finish", reason: "tool_calls" }];
}

function turn(system: string, assistantMessages: number, chunks: Expectation["responseChunks"], lastUserContains?: string): Expectation {
  return {
    match: {
      anySystemContains: system,
      minAssistantMessages: assistantMessages,
      maxAssistantMessages: assistantMessages,
      ...(lastUserContains === undefined ? {} : { lastUserContains }),
    },
    responseChunks: chunks,
  };
}

const CONSULTATION = "Design a tiny TS module: greet.ts exporting greet(): string returning 'hello', plus greet.test.ts using bun:test.";
const ARCH_ANSWER =
  "DESIGN-OK: greet.ts exports greet(): string returning the literal 'hello'. " +
  "Test with bun:test: expect(greet()).toBe('hello').";
const REVIEW_REQUEST = "Review greet.ts and greet.test.ts. bun test greet.test.ts passes locally.";
const REVIEW = "LGTM: greet() returns 'hello'; bun test greet.test.ts passes. No objections.";
const DESIGN_NOTIFY = "DESIGN-OK: greet.ts exports greet(): string => 'hello'; cover with bun:test expect(greet()).toBe('hello').";
const LGTM_NOTIFY = "LGTM: reviewed greet.ts and greet.test.ts; re-ran bun test greet.test.ts and it passes.";
const FINAL_REPORT = "Done: greet.ts exports greet() returning 'hello', greet.test.ts covers it, and bun test passes.";

const GREET_TS = 'export function greet(): string {\n  return "hello";\n}\n';
const GREET_TEST_TS = `import { expect, test } from "bun:test";
import { greet } from "./greet";

test("greet returns hello", () => {
  expect(greet()).toBe("hello");
});
`;

const ARCH_PROMPT =
  "Design the greet module. Read greet-task/consultation " +
  "and write the answer to greet-task/architect_answer.";

const PEER_PROMPT =
  "Review the greet implementation. Read greet-task/review_request, " +
  "inspect greet.ts and greet.test.ts, re-run the test, and write the verdict to greet-task/review.";

const expectations: Expectation[] = [
  turn(DEV, 0, toolCall("d1", "write_artifact", JSON.stringify({ key: "greet-task/consultation", content: CONSULTATION }))),
  turn(DEV, 1, toolCall("d2", "call_agent", JSON.stringify({ agent: "architect", prompt: ARCH_PROMPT }))),
  turn(DEV, 2, toolCall("d3", "bash", JSON.stringify({ command: "ls" }))),
  turn(DEV, 3, textStop("Waiting for the architect's answer.\n")),
  turn(DEV, 4, toolCall("d5", "write_file", JSON.stringify({ path: "greet.ts", content: GREET_TS })), "DESIGN-OK"),
  turn(DEV, 5, toolCall("d6", "write_file", JSON.stringify({ path: "greet.test.ts", content: GREET_TEST_TS }))),
  turn(DEV, 6, toolCall("d7", "bash", JSON.stringify({ command: "bun test greet.test.ts" }))),
  turn(DEV, 7, toolCall("d8", "write_artifact", JSON.stringify({ key: "greet-task/review_request", content: REVIEW_REQUEST }))),
  turn(DEV, 8, toolCall("d9", "call_agent", JSON.stringify({ agent: "peer", prompt: PEER_PROMPT }))),
  turn(DEV, 9, toolCall("d10", "bash", JSON.stringify({ command: "ls" }))),
  turn(DEV, 10, textStop("Waiting for the peer's verdict.\n")),
  turn(DEV, 11, textStop(FINAL_REPORT + "\n"), "LGTM"),

  turn(ARCH, 0, toolCall("a1", "read_artifact", JSON.stringify({ key: "greet-task/consultation" }))),
  turn(ARCH, 1, toolCall("a2", "write_artifact", JSON.stringify({ key: "greet-task/architect_answer", content: ARCH_ANSWER }))),
  turn(ARCH, 2, toolCall("a3", "notify", JSON.stringify({ topic: "callback.developer-1", prompt: DESIGN_NOTIFY }))),
  turn(ARCH, 3, textStop("Design answer delivered.")),

  turn(PEER, 0, toolCall("p1", "read_artifact", JSON.stringify({ key: "greet-task/review_request" }))),
  turn(PEER, 1, toolCall("p2", "bash", JSON.stringify({ command: "bun test greet.test.ts" }))),
  turn(PEER, 2, toolCall("p3", "write_artifact", JSON.stringify({ key: "greet-task/review", content: REVIEW }))),
  turn(PEER, 3, toolCall("p4", "notify", JSON.stringify({ topic: "callback.developer-1", prompt: LGTM_NOTIFY }))),
  turn(PEER, 4, textStop("Review complete.")),
];

export default expectations;
