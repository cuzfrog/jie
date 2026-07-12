import type { Expectation } from "../../../packages/mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { anySystemContains: "my-team-1 leader" },
    responseChunks: [
      { kind: "text", delta: "Count: 1, 2, 3." },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { anySystemContains: "my-team-2 leader" },
    responseChunks: [
      { kind: "text", delta: "Once upon a story." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
