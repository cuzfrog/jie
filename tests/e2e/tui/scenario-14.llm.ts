import type { Expectation } from "../../mock-llm-backend";

export const SUMMARY_TEXT = "SUMMARY-OF-BIG-CONVERSATION";
const CONTINUE_ACK = "COMPACTED-CONTINUATION-OK";
const BIG_TEXT = "x".repeat(4_500);

const expectations: Expectation[] = [
  {
    match: { model: "e2e-tiny", anySystemContains: "context summarization assistant" },
    responseChunks: [
      { kind: "text", delta: SUMMARY_TEXT },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { model: "e2e-tiny", anyUserContains: SUMMARY_TEXT },
    responseChunks: [
      { kind: "text", delta: CONTINUE_ACK },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { model: "e2e-tiny" },
    responseChunks: [
      { kind: "text", delta: BIG_TEXT },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
