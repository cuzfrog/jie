import type { Expectation } from "../../../packages/mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "ls -la", toolName: "bash", maxAssistantMessages: 0 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "bash_call",
        name: "bash",
        argumentsChunks: ['{"command": "ls -la"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "ls -la", toolName: "bash", minAssistantMessages: 1 },
    responseChunks: [
      { kind: "text", delta: "Listing ready." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
