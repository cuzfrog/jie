import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "Tell me a story" },
    responseChunks: [
      { kind: "text", delta: "Once upon a time, in a test harness far away..." },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Say hi briefly" },
    responseChunks: [
      { kind: "text", delta: "Hi." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
