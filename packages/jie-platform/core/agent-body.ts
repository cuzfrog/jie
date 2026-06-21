import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { ExecutionContext, ToolRegistry } from "../tools";
import { adaptToolToAgent } from "./tool-adapter";
import { makeStreamPublisher } from "./streaming";
import { JieAgentBody } from "./jie-agent-body";
import type { EventManager } from "./event-manager";
import type { Sender } from "./types";

export interface CreateAgentBodyOptions {
  agentKey: string;
  teamId: string;
  soul: AgentSoul;
  isLeader: boolean;
  events: EventManager;
  artifactStore: ArtifactStore;
  memory: MemoryManager;
  sessionId: string;
  toolRegistry: ToolRegistry;
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  model: unknown;
  createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

export interface AgentBody {
  start(): Promise<void>;
  stop(): void;
}

export function createAgentBody(opts: CreateAgentBodyOptions): AgentBody {
  const sender: Sender = {
    kind: "agent",
    identity: { teamId: opts.teamId, agentRole: opts.soul.role, agentKey: opts.agentKey },
  };
  const streamPublisher = makeStreamPublisher(opts.events, sender);

  const ctx: ExecutionContext = {
    sessionId: opts.sessionId,
    teamId: opts.teamId,
    agentKey: opts.agentKey,
    agentRole: opts.soul.role,
    artifactStore: opts.artifactStore,
  };
  const tools = adaptAllTools(opts.soul, opts.toolRegistry, ctx);

  const toolTimestamps = new Map<string, number>();

  const createAgent = opts.createAgent ?? defaultAgentFactory;
  const agent = createAgent({
    sessionId: opts.sessionId,
    getApiKey: opts.getApiKey,
    transformContext: async (messages: AgentMessage[]) => messages,
    convertToLlm: undefined,
    steeringMode: "all",
    followUpMode: "all",
    toolExecution: "sequential",
    beforeToolCall: async (context) => {
      const toolCallId = context.toolCall.id;
      toolTimestamps.set(toolCallId, Date.now());
      opts.events.publish("agent.tool.call", {
        tool_call_id: toolCallId,
        name: context.toolCall.name,
        input: JSON.stringify(context.args),
        input_truncated: false,
      }, sender);
      return undefined;
    },
    afterToolCall: async (context) => {
      const toolCallId = context.toolCall.id;
      const startedAt = toolTimestamps.get(toolCallId) ?? Date.now();
      toolTimestamps.delete(toolCallId);
      const error = extractToolError(context);
      const result = error === null ? context.result : null;
      opts.events.publish("agent.tool.result", {
        tool_call_id: toolCallId,
        name: context.toolCall.name,
        output: error === null ? JSON.stringify(result) : null,
        output_truncated: false,
        duration_ms: Date.now() - startedAt,
        error,
      }, sender);
      return undefined;
    },
  });
  agent.state.systemPrompt = opts.soul.systemPrompt;
  agent.state.model = opts.model as never;
  agent.state.tools = tools;

  const body = new JieAgentBody({
    agentKey: opts.agentKey,
    teamId: opts.teamId,
    soul: opts.soul,
    isLeader: opts.isLeader,
    sessionId: opts.sessionId,
    events: opts.events,
    memory: opts.memory,
    agent,
    streamPublisher,
  });

  const unsubscribeAgent = agent.subscribe((event) =>
    body.handlePiAgentEvent(event),
  );
  body.addExternalCleanup(unsubscribeAgent);

  return body;
}

function adaptAllTools(
  soul: AgentSoul,
  toolRegistry: ToolRegistry,
  ctx: ExecutionContext,
): AgentTool[] {
  const out: AgentTool[] = [];
  for (const spec of soul.tools) {
    const tools = toolRegistry.resolve(spec);
    for (const tool of tools) {
      out.push(adaptToolToAgent(tool, ctx));
    }
  }
  return out;
}

function defaultAgentFactory(opts: ConstructorParameters<typeof Agent>[0]): Agent {
  return new Agent(opts);
}

function extractToolError(context: {
  isError: boolean;
  result: unknown;
}): string | null {
  if (!context.isError) return null;
  if (context.result === undefined) return "tool error";
  const content = (context.result as { content?: Array<{ text?: string }> }).content;
  if (!Array.isArray(content)) return "tool error";
  const text = content
    .map((c) => c.text)
    .filter((t): t is string => typeof t === "string")
    .join("\n");
  return text.length > 0 ? text : "tool error";
}