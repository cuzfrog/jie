import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, StopReason } from "@earendil-works/pi-ai";

export interface AgentLoopLogger {
  log(event: AgentEvent): void;
  close(): void;
}

interface AgentLoopLoggerParams {
  readonly logDir: string;
  readonly agentKey: string;
  readonly teamId: string;
  readonly sessionId: string;
}

export class FileAgentLoopLogger implements AgentLoopLogger {
  private readonly logPath: string;
  private readonly agentKey: string;
  private readonly teamId: string;
  private readonly sessionId: string;

  constructor(params: AgentLoopLoggerParams) {
    this.agentKey = params.agentKey;
    this.teamId = params.teamId;
    this.sessionId = params.sessionId;
    this.logPath = join(params.logDir, `${params.agentKey}.log`);
  }

  log(event: AgentEvent): void {
    const entry = {
      timestamp: new Date().toISOString(),
      agentKey: this.agentKey,
      teamId: this.teamId,
      sessionId: this.sessionId,
      event: summarizeAgentEvent(event),
    };
    appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  close(): void {
    // synchronous append; nothing to flush
  }
}

function summarizeAgentEvent(event: AgentEvent): Record<string, unknown> {
  switch (event.type) {
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end", ...readFinalStopReason(event.messages) };
    case "turn_start":
      return { type: "turn_start" };
    case "turn_end":
      return {
        type: "turn_end",
        message: summarizeMessage(event.message),
        toolResults: event.toolResults.length,
        ...readFinalStopReason([event.message]),
      };
    case "message_start":
      return { type: "message_start", message: summarizeMessage(event.message) };
    case "message_update":
      return { type: "message_update", updateType: event.assistantMessageEvent.type };
    case "message_end":
      return { type: "message_end", message: summarizeMessage(event.message) };
    case "tool_execution_start":
      return { type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName };
    case "tool_execution_update":
      return { type: "tool_execution_update", toolCallId: event.toolCallId, toolName: event.toolName };
    case "tool_execution_end":
      return { type: "tool_execution_end", toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError };
    default:
      return { type: (event as { type: string }).type };
  }
}

function summarizeMessage(message: AgentMessage): Record<string, unknown> {
  const summary: Record<string, unknown> = { role: message.role };
  if (message.role === "assistant" && message.usage !== undefined && message.usage.totalTokens > 0) {
    summary.totalTokens = message.usage.totalTokens;
  }
  return summary;
}

function readFinalStopReason(messages: AgentMessage[]): { stopReason: StopReason; isError: boolean } {
  let lastAssistant: AssistantMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message !== undefined && message.role === "assistant") {
      lastAssistant = message as AssistantMessage;
      break;
    }
  }
  const stopReason: StopReason = lastAssistant?.stopReason ?? "stop";
  const isError = stopReason === "error" || stopReason === "aborted";
  return { stopReason, isError };
}

export { summarizeAgentEvent as _summarizeAgentEvent };
