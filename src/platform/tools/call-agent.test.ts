import type { AgentDispatcher, CallAgentResultDetails, CallAgentTicket } from "../types";
import type { ExecutionContext } from "./types";
import { createCallAgentTool } from "./call-agent";

function makeCtx(toolArgs: Map<string, ReadonlyArray<string>> = new Map()): ExecutionContext {
  return {
    sessionId: "sess-1",
    teamId: "t1",
    agentKey: "leader-1",
    agentRole: "leader",
    artifactStore: {
      write: async () => ({ key: "", created_at: "" }),
      read: async () => null,
      list: async () => [],
    },
    toolArgs,
    agentDispatcher: vi.mocked<AgentDispatcher>({ call: vi.fn() }),
  };
}

function makeTicket(overrides: Partial<CallAgentTicket> = {}): CallAgentTicket {
  return {
    agentKey: "reviewer-1",
    callbackTopic: "callback.leader-1",
    callId: "call-1",
    queued: false,
    ...overrides,
  };
}

describe("call_agent tool", () => {
  test("dispatches and returns resolved agent, callback, and call id", async () => {
    const ctx = makeCtx();
    const ticket = makeTicket();
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(ticket);

    const tool = createCallAgentTool();
    const result = await tool.execute({ agent: "reviewer", prompt: "review this" }, ctx);

    expect(ctx.agentDispatcher.call).toHaveBeenCalledWith({
      teamId: "t1",
      sessionId: "sess-1",
      callerAgentKey: "leader-1",
      agent: "reviewer",
      prompt: "review this",
      reset: undefined,
    });
    expect(result.content).toContain("dispatched to 'reviewer-1'");
    expect(result.content).toContain("call-1");
    expect(result.content).toContain("callback.leader-1");
    expect(result.content).toContain("mid-run");
    expect(result.details).toEqual({
      kind: "call-agent",
      agentKey: "reviewer-1",
      callbackTopic: "callback.leader-1",
      callId: "call-1",
      queued: false,
    });
  });

  test("reports queued when the dispatcher queues the call", async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket({ queued: true }));

    const tool = createCallAgentTool();
    const result = await tool.execute({ agent: "reviewer", prompt: "review this" }, ctx);

    expect(result.content).toContain("queued for 'reviewer-1'");
    expect(result.content).toContain("mid-run");
    expect((result.details as CallAgentResultDetails).queued).toBe(true);
  });

  test("enforces toolArgs allowlist when present", async () => {
    const ctx = makeCtx(new Map([["call_agent", ["reviewer"]]]));
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket());

    const tool = createCallAgentTool();
    await expect(tool.execute({ agent: "explorer", prompt: "explore" }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: "AGENT_NOT_ALLOWED" }),
    );
    expect(ctx.agentDispatcher.call).not.toHaveBeenCalled();
  });

  test("allows a role to call its replica keys", async () => {
    const ctx = makeCtx(new Map([["call_agent", ["reviewer"]]]));
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket());

    const tool = createCallAgentTool();
    await tool.execute({ agent: "reviewer-1", prompt: "review this" }, ctx);

    expect(ctx.agentDispatcher.call).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "reviewer-1" }),
    );
  });

  test("allows a dashed role to call its replica keys", async () => {
    const ctx = makeCtx(new Map([["call_agent", ["code-reviewer"]]]));
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket({ agentKey: "code-reviewer-1" }));

    const tool = createCallAgentTool();
    await tool.execute({ agent: "code-reviewer-1", prompt: "review this" }, ctx);

    expect(ctx.agentDispatcher.call).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "code-reviewer-1" }),
    );
  });

  test("rejects a non-numeric replica suffix", async () => {
    const ctx = makeCtx(new Map([["call_agent", ["reviewer"]]]));
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket());

    const tool = createCallAgentTool();
    await expect(tool.execute({ agent: "reviewer-foo", prompt: "explore" }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: "AGENT_NOT_ALLOWED" }),
    );
    expect(ctx.agentDispatcher.call).not.toHaveBeenCalled();
  });

  test("rejects a zero or leading-zero replica index", async () => {
    const ctx = makeCtx(new Map([["call_agent", ["reviewer"]]]));
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket());

    const tool = createCallAgentTool();
    await expect(tool.execute({ agent: "reviewer-0", prompt: "explore" }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: "AGENT_NOT_ALLOWED" }),
    );
    await expect(tool.execute({ agent: "reviewer-01", prompt: "explore" }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: "AGENT_NOT_ALLOWED" }),
    );
    expect(ctx.agentDispatcher.call).not.toHaveBeenCalled();
  });

  test("allows an exact agent key", async () => {
    const ctx = makeCtx(new Map([["call_agent", ["reviewer-1"]]]));
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket());

    const tool = createCallAgentTool();
    await tool.execute({ agent: "reviewer-1", prompt: "review this" }, ctx);

    expect(ctx.agentDispatcher.call).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "reviewer-1" }),
    );
  });

  test("passes reset to the dispatcher", async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.agentDispatcher.call).mockReturnValue(makeTicket());

    const tool = createCallAgentTool();
    await tool.execute({ agent: "reviewer", prompt: "review this", reset: true }, ctx);

    expect(ctx.agentDispatcher.call).toHaveBeenCalledWith(
      expect.objectContaining({ reset: true }),
    );
  });

  test("tool metadata", () => {
    const tool = createCallAgentTool();
    expect(tool.name).toBe("call_agent");
    expect(tool.label).toBe("Call agent");
    expect(tool.parameters).toBeDefined();
  });
});
