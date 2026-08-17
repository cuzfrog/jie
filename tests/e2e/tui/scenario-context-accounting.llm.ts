import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "meter tokens" },
    responseChunks: [
      { kind: "text", delta: "Ack." },
      { kind: "finish", reason: "stop" },
      { kind: "usage", promptTokens: 12345, cacheReadTokens: 2345, completionTokens: 678 },
    ],
  },
  {
    match: { lastUserContains: "honest usage" },
    responseChunks: [
      { kind: "text", delta: "Ack." },
      { kind: "finish", reason: "stop" },
      { kind: "usage", promptTokens: 1500, completionTokens: 20 },
    ],
  },
  {
    match: { lastUserContains: "trigger context limit" },
    contextLimitTokens: 1,
    responseChunks: [{ kind: "finish", reason: "stop" }],
  },
  {
    match: { anySystemContains: "You are a context summarization assistant" },
    responseChunks: [
      { kind: "text", delta: "Summary of earlier conversation." },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "first compaction turn" },
    responseChunks: [
      { kind: "text", delta: "One." },
      { kind: "finish", reason: "stop" },
      { kind: "usage", promptTokens: 1500, completionTokens: 20 },
    ],
  },
  {
    match: { lastUserContains: "continue after compaction" },
    responseChunks: [
      { kind: "text", delta: "Continuing.", delayMs: 150 },
      { kind: "finish", reason: "stop" },
      { kind: "usage", promptTokens: 1600, completionTokens: 10 },
    ],
  },
];

export default expectations;
