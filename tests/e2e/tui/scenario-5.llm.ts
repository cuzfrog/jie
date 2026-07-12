import type { Expectation } from "../../../packages/mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "Research the history of J", minAssistantMessages: 0 },
    responseChunks: [
      { kind: "text", delta: "A haiku about J: lines one, two, three." },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Tell me a haiku", minAssistantMessages: 1 },
    responseChunks: [
      { kind: "text", delta: "Another haiku for you." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
