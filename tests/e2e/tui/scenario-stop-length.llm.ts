import type { Expectation } from "../../mock-llm-backend";

const expectations: Expectation[] = [
  {
    match: { anyUserContains: "length recover", lastUserContains: "cut off" },
    responseChunks: [
      { kind: "text", delta: "Recovered answer." },
      { kind: "finish", reason: "stop" },
    ],
  },
  {
    match: { lastUserContains: "length recover" },
    responseChunks: [{ kind: "finish", reason: "length" }],
  },
  {
    match: { anyUserContains: "length give up", lastUserContains: "cut off" },
    responseChunks: [{ kind: "finish", reason: "length" }],
  },
  {
    match: { lastUserContains: "length give up" },
    responseChunks: [{ kind: "finish", reason: "length" }],
  },
];

export default expectations;
