import type { Expectation } from "../../../packages/mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "Tell me a joke" },
    responseChunks: [
      { kind: "text", delta: "Why did the chicken cross the road? To get to the other side.\n" },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;