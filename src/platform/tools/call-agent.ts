import { Type } from "typebox";
import { JiePlatformError } from "../jie-platform-errors";
import type { CallAgentResultDetails } from "../types";
import type { ExecutionContext, Tool, ToolResult } from "./types";

const CALL_AGENT_DESCRIPTION = `Ask another agent to perform work asynchronously. The platform picks an idle replica or
queues, and returns the resolved agent key immediately without blocking you; continue other
work in the meantime. The callee replies via
notify({ topic: "callback.<your_agent_key>", prompt: "call_id=<call_id> ..." }) and the reply is delivered straight into this conversation
as soon as your current tool batch finishes. Prompts are capped at 4KB; use artifacts for
bigger data.`;

interface CallAgentInput {
  agent: string;
  prompt: string;
  reset?: boolean;
}

export function createCallAgentTool(): Tool<CallAgentInput> {
  return {
    name: "call_agent",
    description: CALL_AGENT_DESCRIPTION,
    label: "Call agent",
    parameters: Type.Object({
      agent: Type.String(),
      prompt: Type.String(),
      reset: Type.Optional(Type.Boolean()),
    }),
    async execute(input: CallAgentInput, executionContext: ExecutionContext): Promise<ToolResult> {
      const allowed = executionContext.toolArgs.get("call_agent");
      if (allowed !== undefined && !isAllowedCallee(input.agent, allowed)) {
        throw new JiePlatformError("AGENT_NOT_ALLOWED", {
          detail: `agent '${input.agent}' is not allowed for role '${executionContext.agentRole}'`,
        });
      }

      const ticket = executionContext.agentDispatcher.call({
        teamId: executionContext.teamId,
        sessionId: executionContext.sessionId,
        callerAgentKey: executionContext.agentKey,
        agent: input.agent,
        prompt: input.prompt,
        reset: input.reset,
      });

      const content = ticket.queued
        ? `Task queued for '${ticket.agentKey}' (call_id: ${ticket.callId}). Its reply will arrive on '${ticket.callbackTopic}' mid-run; keep working.`
        : `Task dispatched to '${ticket.agentKey}' (call_id: ${ticket.callId}). Its reply will arrive on '${ticket.callbackTopic}' mid-run; keep working.`;
      const details: CallAgentResultDetails = {
        kind: "call-agent",
        agentKey: ticket.agentKey,
        callbackTopic: ticket.callbackTopic,
        callId: ticket.callId,
        queued: ticket.queued,
      };
      return { content, details };
    },
  };
}

const REPLICA_INDEX_PATTERN = /^[1-9]\d*$/;

function isAllowedCallee(agent: string, allowedCallees: ReadonlyArray<string>): boolean {
  for (const allowedCallee of allowedCallees) {
    if (allowedCallee === "") continue;
    if (allowedCallee === agent) return true;
    if (agent.startsWith(`${allowedCallee}-`)) {
      const suffix = agent.slice(allowedCallee.length + 1);
      if (REPLICA_INDEX_PATTERN.test(suffix)) return true;
    }
  }
  return false;
}
