import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { FileAgentLoopLogger, _summarizeAgentEvent } from "./agent-loop-logger";

const assistantWithUsage = { role: "assistant", content: [{ type: "text", text: "hello" }], usage: { totalTokens: 42 } } as unknown as AgentMessage;
const userMessage = { role: "user", content: [{ type: "text", text: "secret prompt" }] } as unknown as AgentMessage;

describe("_summarizeAgentEvent", () => {
  test("agent_start is summarized without messages", () => {
    expect(_summarizeAgentEvent({ type: "agent_start" })).toEqual({ type: "agent_start" });
  });

  test("message_start keeps the role but drops the content", () => {
    expect(_summarizeAgentEvent({ type: "message_start", message: userMessage })).toEqual({
      type: "message_start",
      message: { role: "user" },
    });
  });

  test("message_end keeps role and token count, drops content", () => {
    expect(_summarizeAgentEvent({ type: "message_end", message: assistantWithUsage })).toEqual({
      type: "message_end",
      message: { role: "assistant", totalTokens: 42 },
    });
  });

  test("message_update reports the update type without the delta", () => {
    expect(_summarizeAgentEvent({
      type: "message_update",
      message: assistantWithUsage,
      assistantMessageEvent: { type: "text_delta", delta: "ignored" },
    } as AgentEvent)).toEqual({ type: "message_update", updateType: "text_delta" });
  });

  test("turn_end reports the message role and tool result count", () => {
    expect(_summarizeAgentEvent({
      type: "turn_end",
      message: assistantWithUsage,
      toolResults: [assistantWithUsage],
    } as AgentEvent)).toEqual(expect.objectContaining({
      type: "turn_end",
      message: { role: "assistant", totalTokens: 42 },
      toolResults: 1,
    }));
  });

  test("tool_execution_start reports the tool call id and name", () => {
    expect(_summarizeAgentEvent({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "bash",
      args: { command: "echo secret" },
    } as AgentEvent)).toEqual({ type: "tool_execution_start", toolCallId: "call-1", toolName: "bash" });
  });

  test("tool_execution_end reports error state without args or results", () => {
    expect(_summarizeAgentEvent({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "bash",
      result: { secret: true },
      isError: true,
    } as AgentEvent)).toEqual({ type: "tool_execution_end", toolCallId: "call-1", toolName: "bash", isError: true });
  });
});

describe("FileAgentLoopLogger", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "jie-loop-log-"));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  test("writes one JSON line per event and never contains message content", () => {
    const logger = new FileAgentLoopLogger({ logDir, agentKey: "general-1", teamId: "t1", sessionId: "s1" });
    logger.log({ type: "agent_start" });
    logger.log({ type: "message_start", message: userMessage } as AgentEvent);
    logger.close();

    const lines = readFileSync(join(logDir, "general-1.log"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const entry = JSON.parse(line);
      expect(entry.agentKey).toBe("general-1");
      expect(entry.teamId).toBe("t1");
      expect(entry.sessionId).toBe("s1");
      expect(entry.timestamp).toMatch(/^\d{4}-/);
      expect(line).not.toContain("secret");
    }
    const second = JSON.parse(lines[1]!);
    expect(second.event).toEqual({ type: "message_start", message: { role: "user" } });
  });

  test("appends to an existing log file", () => {
    const file = join(logDir, "worker-1.log");
    mkdirSync(logDir, { recursive: true });
    const first = new FileAgentLoopLogger({ logDir, agentKey: "worker-1", teamId: "t1", sessionId: "s1" });
    first.log({ type: "agent_start" });
    first.close();

    const second = new FileAgentLoopLogger({ logDir, agentKey: "worker-1", teamId: "t1", sessionId: "s2" });
    second.log({ type: "agent_start" });
    second.close();

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).sessionId).toBe("s1");
    expect(JSON.parse(lines[1]!).sessionId).toBe("s2");
  });
});
