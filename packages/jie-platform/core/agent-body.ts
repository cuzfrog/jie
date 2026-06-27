import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { ExecutionContext, ToolRegistry } from "../tools";
import { adaptToolToAgent } from "./tool-adapter";
import { makeStreamPublisher } from "./streaming";
import { JieAgentBody } from "./jie-agent-body";
import { Events, type EventManager, type Sender } from "../event";

export interface CreateAgentBodyOptions {
  agentKey: string;
  teamId: string;
  soul: AgentSoul;
  isLeader: boolean;
  eventManager: EventManager;
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

export function createAgentBody(options: CreateAgentBodyOptions): AgentBody {
  const sender: Sender = {
    kind: "agent",
    identity: { teamId: options.teamId, agentRole: options.soul.role, agentKey: options.agentKey },
  };
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
        false,
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
        false,
        Date.now() - startedAt,
        error,
      ));
      return undefined;
    },
  });
  agent.state.systemPrompt = options.soul.systemPrompt;
  agent.state.model = options.model as never;
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

interface JieToolResult {
  content: string | Array<{ type: string; text?: string }>;
  details?: unknown;
  terminate?: boolean;
}

function jieToolResultOf(piResult: unknown): JieToolResult {
  const r = piResult as {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
    terminate?: boolean;
  };
  const block = r.content;
  const content =
    Array.isArray(block) && block.length === 1 && block[0]?.type === "text"
      ? (block[0].text ?? "")
      : (block ?? "");
  return {
    content,
    details: r.details,
    terminate: r.terminate ?? false,
  };
}