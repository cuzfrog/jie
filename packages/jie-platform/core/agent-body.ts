import { Agent, type AgentMessage, type AgentTool, type AgentToolResult, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model, TextContent } from "@earendil-works/pi-ai";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { ExecutionContext, ToolRegistry } from "../tools";
import { adaptToolToAgent } from "./tool-adapter";
import { makeStreamPublisher } from "./streaming";
import { JieAgentBody } from "./jie-agent-body";
import { Events, type AgentSender, type EventManager } from "../event";
import type { AgentIdentity } from "../types";

export interface CreateAgentBodyOptions {
  readonly agentKey: string;
  readonly teamId: string;
  readonly soul: AgentSoul;
  readonly isLeader: boolean;
  readonly eventManager: EventManager;
  readonly artifactStore: ArtifactStore;
  readonly memory: MemoryManager;
  readonly sessionId: string;
  readonly toolRegistry: ToolRegistry;
  getApiKey(provider: string): Promise<string | undefined> | string | undefined;
  readonly model: Model<Api> | undefined;
  readonly createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

export interface AgentBody {
  readonly identity: AgentIdentity;
  start(): Promise<void>;
  stop(): void;
}

export function createAgentBody(options: CreateAgentBodyOptions): AgentBody {
  const sender: AgentSender = { kind: "agent", teamId: options.teamId, agentKey: options.agentKey };
  const streamPublisher = makeStreamPublisher(options.eventManager, sender);

  const executionContext: ExecutionContext = {
    sessionId: options.sessionId,
    teamId: options.teamId,
    agentKey: options.agentKey,
    agentRole: options.soul.role,
    artifactStore: options.artifactStore,
  };
  const adaptedTools = adaptAllTools(options.soul, options.toolRegistry, executionContext);

  const toolTimestamps = new Map<string, number>();

  const createAgent = options.createAgent ?? defaultAgentFactory;
  const agent = createAgent({
    sessionId: options.sessionId,
    getApiKey: options.getApiKey,
    transformContext: async (messages: AgentMessage[]) => messages,
    steeringMode: "all",
    followUpMode: "all",
    toolExecution: "sequential",
    beforeToolCall: async (context) => {
      const toolCallId = context.toolCall.id;
      toolTimestamps.set(toolCallId, Date.now());
      options.eventManager.publish(Events.agentToolCall(
        sender,
        toolCallId,
        context.toolCall.name,
        JSON.stringify(context.args),
      ));
      return undefined;
    },
    afterToolCall: async (context) => {
      const toolCallId = context.toolCall.id;
      const startedAt = toolTimestamps.get(toolCallId) ?? Date.now();
      toolTimestamps.delete(toolCallId);
      const error = extractToolError(context);
      const output = error === null ? jieToolResultOf(context.result) : null;
      options.eventManager.publish(Events.agentToolResult(
        sender,
        toolCallId,
        context.toolCall.name,
        output === null ? null : JSON.stringify(output),
        Date.now() - startedAt,
        error,
      ));
      return undefined;
    },
  });
  agent.state.systemPrompt = options.soul.systemPrompt;
  if (options.model !== undefined) {
    agent.state.model = options.model;
    const effort = agentEffort(agent.state.thinkingLevel);
    if (effort !== null) {
      options.eventManager.publish(Events.agentModelAssigned(sender, options.model.provider, options.model.id, effort));
    }
  }
  agent.state.tools = adaptedTools;

  const body = new JieAgentBody({
    agentKey: options.agentKey,
    teamId: options.teamId,
    soul: options.soul,
    isLeader: options.isLeader,
    sessionId: options.sessionId,
    eventManager: options.eventManager,
    memory: options.memory,
    agent,
    streamPublisher,
  });

  const unsubscribeAgent = agent.subscribe((event, _signal) =>
    body.handlePiAgentEvent(event),
  );
  body.addExternalCleanup(unsubscribeAgent);

  return body;
}

function adaptAllTools(
  soul: AgentSoul,
  toolRegistry: ToolRegistry,
  executionContext: ExecutionContext,
): AgentTool[] {
  const out: AgentTool[] = [];
  for (const toolSpec of soul.tools) {
    const tools = toolRegistry.resolve(toolSpec);
    for (const tool of tools) {
      out.push(adaptToolToAgent(tool, executionContext));
    }
  }
  return out;
}

function defaultAgentFactory(agentOptions: ConstructorParameters<typeof Agent>[0]): Agent {
  return new Agent(agentOptions);
}

function extractToolError(context: {
  isError: boolean;
  result: AgentToolResult<unknown> | undefined;
}): string | null {
  if (!context.isError) return null;
  if (context.result === undefined) return "tool error";
  const text = context.result.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return text.length > 0 ? text : "tool error";
}

function agentEffort(thinkingLevel: ThinkingLevel): "low" | "medium" | "high" | "max" | null {
  if (thinkingLevel === "low" || thinkingLevel === "medium" || thinkingLevel === "high" || thinkingLevel === "xhigh") {
    return thinkingLevel === "xhigh" ? "max" : thinkingLevel;
  }
  return null;
}

interface JieToolResult {
  content: string | Array<{ type: string; text?: string }>;
  details?: unknown;
  terminate?: boolean;
}

function jieToolResultOf(piResult: AgentToolResult<unknown>): JieToolResult {
  const block = piResult.content;
  const content =
    block.length === 1 && block[0]?.type === "text"
      ? block[0].text
      : block;
  return {
    content,
    details: piResult.details,
    terminate: piResult.terminate ?? false,
  };
}
