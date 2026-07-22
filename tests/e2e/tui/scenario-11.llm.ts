import type { Expectation } from "../../../packages/mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "Remember the word: pineapple" },
    responseChunks: [
      { kind: "text", delta: "Pineapple noted." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
