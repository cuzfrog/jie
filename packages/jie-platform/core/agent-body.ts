import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { ExecutionContext, ToolRegistry } from "../tools";
import { adaptToolToAgent } from "./tool-adapter";
import {
  makeStreamPublisher,
  publishToolCallEvent,
  publishToolResultEvent,
} from "./streaming";
import { JieAgentBody } from "./jie-agent-body";

export interface CreateAgentBodyOptions {
  agent_key: string;
  team_id: string;
  soul: AgentSoul;
  is_leader: boolean;
  bus: import("./event-bus.ts").EventBus;
  artifacts: ArtifactStore;
  memory: MemoryManager;
  session_id: string;
  tool_registry: ToolRegistry;
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  model: unknown;
  createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

export interface AgentBody {
  start(): Promise<void>;
  stop(): void;
}

function defaultAgentFactory(opts: ConstructorParameters<typeof Agent>[0]): Agent {
  return new Agent(opts);
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

export function createAgentBody(opts: CreateAgentBodyOptions): AgentBody {
  const stream = makeStreamPublisher(
    opts.bus,
    opts.agent_key,
    opts.soul.role,
    opts.team_id,
  );

  const ctx: ExecutionContext = {
    session_id: opts.session_id,
    team_id: opts.team_id,
    agent_key: opts.agent_key,
    agent_role: opts.soul.role,
    artifacts: opts.artifacts,
  };
  const tools = adaptAllTools(opts.soul, opts.tool_registry, ctx);

  const toolTimestamps = new Map<string, number>();

  const createAgent = opts.createAgent ?? defaultAgentFactory;
  const agent = createAgent({
    sessionId: opts.session_id,
    getApiKey: opts.getApiKey,
    transformContext: async (messages: AgentMessage[]) => messages,
    convertToLlm: undefined,
    steeringMode: "all",
    followUpMode: "all",
    toolExecution: "sequential",
    beforeToolCall: async (context) => {
      const toolCallId = context.toolCall.id;
      toolTimestamps.set(toolCallId, Date.now());
      publishToolCallEvent(
        opts.bus,
        opts.agent_key,
        opts.soul.role,
        opts.team_id,
        toolCallId,
        context.toolCall.name,
        context.args,
      );
      return undefined;
    },
    afterToolCall: async (context) => {
      const toolCallId = context.toolCall.id;
      const startedAt = toolTimestamps.get(toolCallId) ?? Date.now();
      toolTimestamps.delete(toolCallId);
      const error =
        context.isError && context.result !== undefined
          ? (context.result as { content?: Array<{ text?: string }> }).content
              ?.map((c) => c.text)
              .filter((t): t is string => typeof t === "string")
              .join("\n") ?? "tool error"
          : context.isError
            ? "tool error"
            : null;
      const outputPayload = error === null ? context.result : null;
      publishToolResultEvent(
        opts.bus,
        opts.agent_key,
        opts.soul.role,
        opts.team_id,
        toolCallId,
        context.toolCall.name,
        outputPayload,
        Date.now() - startedAt,
        error,
      );
      return undefined;
    },
  });
  agent.state.systemPrompt = opts.soul.system_prompt;
  agent.state.model = opts.model as never;
  agent.state.tools = tools;

  const body = new JieAgentBody({
    agent_key: opts.agent_key,
    team_id: opts.team_id,
    soul: opts.soul,
    is_leader: opts.is_leader,
    session_id: opts.session_id,
    bus: opts.bus,
    memory: opts.memory,
    agent,
    stream,
  });

  const unsubscribeAgent = agent.subscribe((event) =>
    body.handlePiAgentEvent(event),
  );
  body.addExternalCleanup(unsubscribeAgent);

  return body;
}
