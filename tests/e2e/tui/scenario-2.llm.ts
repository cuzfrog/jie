import type { Expectation } from "../../../packages/mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "Read file1.txt and write its content to my-answer.txt", toolName: "bash", maxAssistantMessages: 0 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "cp_call",
        name: "bash",
        argumentsChunks: ['{"command": "cp file1.txt my-answer.txt"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "Read file1.txt and write its content to my-answer.txt", toolName: "bash", minAssistantMessages: 1 },
    responseChunks: [
      { kind: "text", delta: "task done." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
