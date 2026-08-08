import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { anySystemContains: "You answer briefly" },
    responseChunks: [
      { kind: "text", delta: "Count: 1, 2, 3." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
