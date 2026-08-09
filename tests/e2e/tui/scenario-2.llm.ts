import type { Expectation } from "../../mock-llm-backend";

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
  {
    match: { lastUserContains: "Update your kanban board", toolName: "write_kanban", maxAssistantMessages: 0 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "kanban_call",
        name: "write_kanban",
        argumentsChunks: ['{"cards": [{"content": "write the report", "status": "in_progress"}]}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "Update your kanban board", toolName: "write_kanban", minAssistantMessages: 1 },
    responseChunks: [
      { kind: "text", delta: "board updated." },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;
