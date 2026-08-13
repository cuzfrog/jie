import { Type } from "typebox";
import { JiePlatformError } from "../jie-platform-errors";
import type { CallAgentResultDetails } from "../types";
import type { ExecutionContext, Tool, ToolResult } from "./types";

const CALL_AGENT_DESCRIPTION = `call_agent({ agent, prompt, reset? }): Ask another agent to perform work
asynchronously and return the result on the caller's callback inbox. The platform picks an idle replica
when a role has multiple, queues if all replicas are busy, and creates or reuses ad-hoc shared agents.
The resolved agent key is returned immediately so follow-up calls can target the same replica. The callee
should reply with notify({ topic: callback.<caller_agent_key>, prompt: "call_id=<call_id> ..." }). Large
prompts/results are capped at 4KB; use artifacts for bigger data. A role may be restricted to a fixed set of
callable agents via its manifest \`call_agent(role-a, role-b)\` tool spec; each argument is a role or an exact
agent key, and a role argument also permits its \`{role}-{N}\` replicas. Calls outside the allowed set are
rejected with \`AGENT_NOT_ALLOWED\`.`;

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
        ? `Task queued for '${ticket.agentKey}' (call_id: ${ticket.callId}). Result will arrive on '${ticket.callbackTopic}'.`
        : `Task dispatched to '${ticket.agentKey}' (call_id: ${ticket.callId}). Result will arrive on '${ticket.callbackTopic}'.`;
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
