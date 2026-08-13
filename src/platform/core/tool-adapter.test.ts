import { Type } from "typebox";
import type { ArtifactStore } from "../storage";
import type { AgentDispatcher } from "../types";
import type { ToolResultDetails } from "..";
import type { ExecutionContext, Tool } from "../tools";
import { adaptToolToAgent } from "./tool-adapter";

const diffDetails: ToolResultDetails = { kind: "diff", path: "a.txt", replacementsCount: 1, beforeBytes: 2, afterBytes: 2, diff: "-x\n+y" };

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const executionContext: ExecutionContext = {
  sessionId: "s1",
  teamId: "t1",
  agentKey: "agent-1",
  agentRole: "general",
  artifactStore,
  toolArgs: new Map(),
  agentDispatcher: vi.mocked<AgentDispatcher>({ call: vi.fn() }),
};

function makeTool(overrides: Partial<Tool<{ value: number }>>): Tool<{ value: number }> {
  return {
    name: "stub",
    description: "stub tool",
    label: "Stub",
    parameters: Type.Object({ value: Type.Number() }),
    execute: vi.fn(async () => ({ content: "ok" })),
    ...overrides,
  };
}

describe("adaptToolToAgent.prepareArguments", () => {
  test("rejects raw arguments that do not match the schema", () => {
    const adapted = adaptToolToAgent(makeTool({}), executionContext);
    expect(() => adapted.prepareArguments!({ nope: 1 })).toThrow("argument does not match schema");
  });

  test("accepts raw arguments that match the schema", () => {
    const adapted = adaptToolToAgent(makeTool({}), executionContext);
    expect(adapted.prepareArguments!({ value: 5 })).toEqual({ value: 5 });
  });

  test("runs the tool's shim before schema validation", () => {
    const tool = makeTool({
      prepareArguments: vi.fn((raw: unknown) => ({ value: (raw as { x: number }).x })),
    });
    const adapted = adaptToolToAgent(tool, executionContext);
    expect(adapted.prepareArguments!({ x: 5 })).toEqual({ value: 5 });
    expect(tool.prepareArguments).toHaveBeenCalledWith({ x: 5 });
  });

  test("rejects when the shim's output still violates the schema", () => {
    const tool = makeTool({
      prepareArguments: vi.fn(() => ({ nope: 1 })),
    });
    const adapted = adaptToolToAgent(tool, executionContext);
    expect(() => adapted.prepareArguments!({ x: 5 })).toThrow("argument does not match schema");
  });
});

describe("adaptToolToAgent.execute", () => {
  test("maps the jie ToolResult onto the agent result shape", async () => {
    const execute = vi.fn(async () => ({ content: "done", details: diffDetails, terminate: true }));
    const adapted = adaptToolToAgent(makeTool({ execute }), executionContext);
    const result = await adapted.execute("call-1", { value: 1 });
    expect(result).toMatchObject({
      content: [{ type: "text", text: "done" }],
      details: diffDetails,
      terminate: true,
    });
    expect(execute).toHaveBeenCalledWith({ value: 1 }, executionContext, expect.any(AbortSignal));
  });

  test("terminate defaults to false", async () => {
    const adapted = adaptToolToAgent(makeTool({}), executionContext);
    const result = await adapted.execute("call-1", { value: 1 });
    expect(result.terminate).toBe(false);
  });
});
