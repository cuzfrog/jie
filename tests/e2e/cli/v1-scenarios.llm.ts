import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
    {
        match: { lastUserContains: "List files" },
        responseChunks: [{ kind: "text", delta: "file1.txt\n" }, { kind: "finish", reason: "stop" }],
    },

    {
        match: { lastUserContains: "write its content to file2.txt", toolName: "bash", minAssistantMessages: 1 },
        responseChunks: [{ kind: "text", delta: "ok, copied.\n" }, { kind: "finish", reason: "stop" }],
    },
    {
        match: { lastUserContains: "write its content to file2.txt", toolName: "bash" },
        responseChunks: [
            {
                kind: "tool_call",
                id: "cp_call",
                name: "bash",
                argumentsChunks: ['{"command": "cp file1.txt file2.txt"}'],
            },
            { kind: "finish", reason: "tool_calls" },
        ],
    },

    {
        match: { anySystemContains: "Marry had a little lamb" },
        responseChunks: [{ kind: "text", delta: "Marry had a little lamb" }, { kind: "finish", reason: "stop" }],
    },
    {
        match: { anySystemContains: "Once upon a time" },
        responseChunks: [{ kind: "text", delta: "Once upon a time" }, { kind: "finish", reason: "stop" }],
    },

    {
        match: { lastUserContains: "Tell me a joke" },
        responseChunks: [
            { kind: "text", delta: "Why did the mock cross the road? To unit-test the platform.\n" },
            { kind: "finish", reason: "stop" },
        ],
    },
];

export default expectations;