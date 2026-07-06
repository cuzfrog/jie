import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { lastUserContains: "send 5 math tasks to the worker 1 per message", toolName: "notify", maxAssistantMessages: 0 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "n1",
        name: "notify",
        argumentsChunks: ['{"topic":"task","prompt":"Math task 1"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "send 5 math tasks to the worker 1 per message", toolName: "notify", minAssistantMessages: 1, maxAssistantMessages: 1 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "n2",
        name: "notify",
        argumentsChunks: ['{"topic":"task","prompt":"Math task 2"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "send 5 math tasks to the worker 1 per message", toolName: "notify", minAssistantMessages: 2, maxAssistantMessages: 2 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "n3",
        name: "notify",
        argumentsChunks: ['{"topic":"task","prompt":"Math task 3"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "send 5 math tasks to the worker 1 per message", toolName: "notify", minAssistantMessages: 3, maxAssistantMessages: 3 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "n4",
        name: "notify",
        argumentsChunks: ['{"topic":"task","prompt":"Math task 4"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "send 5 math tasks to the worker 1 per message", toolName: "notify", minAssistantMessages: 4, maxAssistantMessages: 4 },
    responseChunks: [
      {
        kind: "tool_call",
        id: "n5",
        name: "notify",
        argumentsChunks: ['{"topic":"task","prompt":"Math task 5"}'],
      },
      { kind: "finish", reason: "tool_calls" },
    ],
  },
  {
    match: { lastUserContains: "send 5 math tasks to the worker 1 per message", minAssistantMessages: 5 },
    responseChunks: [
      { kind: "text", delta: "All 5 tasks sent." },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Math task 1" },
    responseChunks: [
      { kind: "text", delta: "Answer: result of task 1" },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Math task 2" },
    responseChunks: [
      { kind: "text", delta: "Answer: result of task 2" },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Math task 3" },
    responseChunks: [
      { kind: "text", delta: "Answer: result of task 3" },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Math task 4" },
    responseChunks: [
      { kind: "text", delta: "Answer: result of task 4" },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "Math task 5" },
    responseChunks: [
      { kind: "text", delta: "Answer: result of task 5" },
      { kind: "finish", reason: "stop" },
    ],
  },
];

export default expectations;