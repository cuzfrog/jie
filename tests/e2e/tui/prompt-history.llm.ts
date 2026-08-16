import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { anySystemContains: "You answer briefly" },
    responseChunks: [
      { kind: "text", delta: "Count: 1, 2, 3." },
      { kind: "finish", reason: "stop" },
      { kind: "usage", promptTokens: 12345, cacheReadTokens: 2345, completionTokens: 678 },
    ],
  },
];

export default expectations;
