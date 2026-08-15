import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { toolName: "ls" },
    responseChunks: [
      { kind: "tool_call", id: "ls-call", name: "ls", argumentsChunks: ["{}"] },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
];

export default expectations;
