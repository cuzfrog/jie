import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: '<skill name="say-hello"' },
    responseChunks: [
      { kind: "text", delta: "Hello, Cause!" },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
