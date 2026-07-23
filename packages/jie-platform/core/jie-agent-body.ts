import { Agent, type AgentMessage, type AgentEvent as PiAgentEvent, type AgentTool, type AgentToolResult, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, StopReason, TextContent, UserMessage } from "@earendil-works/pi-ai";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { ExecutionContext, ToolRegistry } from "../tools";
import { Events, type AgentSender, type EventManager } from "../event";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import { makeStreamPublisher, type StreamPublisher } from "./streaming";
import { adaptToolToAgent } from "./tool-adapter";
import type { AgentInfo, EffortLevel, ModelInfo } from "../types";

interface AgentBodyDeps {
  readonly eventManager: EventManager;
  readonly artifactStore: ArtifactStore;
  readonly memory: MemoryManager;
  readonly toolRegistry: ToolRegistry;
  getApiKey(provider: string): Promise<string | undefined> | string | undefined;
  readonly createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

export class JieAgentBody implements AgentBody {
  readonly identity: AgentInfo;
  private readonly agentKey: string;
  private readonly teamId: string;
  private readonly soul: AgentSoul;
  private readonly sessionId: string;
  private readonly eventManager: EventManager;
  private readonly memory: MemoryManager;
  private readonly agent: Agent;
  private readonly stream: StreamPublisher;
  private readonly sender: AgentSender;
  private readonly queue: AgentMessage[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly externalCleanups: Array<() => void> = [];
  private restored: ReadonlyArray<AgentMessage> | null = null;
  private started = false;

  constructor(params: AgentBodyParams, deps: AgentBodyDeps) {
    this.agentKey = params.agentKey;
    this.teamId = params.teamId;
    this.soul = params.soul;
    this.sessionId = params.sessionId;
    this.eventManager = deps.eventManager;
    this.memory = deps.memory;
    this.sender = { kind: "agent", teamId: this.teamId, agentKey: this.agentKey };
    this.stream = makeStreamPublisher(deps.eventManager, this.sender);
    const executionContext: ExecutionContext = {
      sessionId: this.sessionId,
      teamId: this.teamId,
      agentKey: this.agentKey,
      agentRole: params.soul.role,
      artifactStore: deps.artifactStore,
    };
    const adaptedTools = adaptAllTools(params.soul, deps.toolRegistry, executionContext);
    const toolTimestamps = new Map<string, number>();
    const createAgent = deps.createAgent ?? defaultAgentFactory;
    this.agent = createAgent({
      sessionId: this.sessionId,
      getApiKey: deps.getApiKey,
      transformContext: async (messages: AgentMessage[]) => messages,
      steeringMode: "all",
      followUpMode: "all",
      toolExecution: "sequential",
      beforeToolCall: async (context) => {
        const toolCallId = context.toolCall.id;
        toolTimestamps.set(toolCallId, Date.now());
        this.eventManager.publish(Events.agentToolCall(
          this.sender,
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
        this.eventManager.publish(Events.agentToolResult(
          this.sender,
          toolCallId,
          context.toolCall.name,
          output === null ? null : JSON.stringify(output),
          Date.now() - startedAt,
          error,
          output?.details ?? null,
        ));
        return undefined;
      },
    });
    this.agent.state.systemPrompt = params.soul.systemPrompt;
    const bodyModel = resolveBodyModelInfo(params.model, this.agent.state.thinkingLevel);
    if (params.model !== undefined) {
      this.agent.state.model = params.model;
      if (bodyModel !== null) {
        this.eventManager.publish(Events.agentModelAssigned(this.sender, bodyModel.provider, bodyModel.id, bodyModel.effort));
      }
    }
    this.agent.state.tools = adaptedTools;
    this.identity = {
      teamId: this.teamId,
      role: params.soul.role,
      agentKey: this.agentKey,
      isLeader: params.isLeader,
      model: bodyModel,
    };
    const unsubscribeAgent = this.agent.subscribe((event, _signal) => this.handlePiAgentEvent(event));
    this.externalCleanups.push(unsubscribeAgent);
  }

  async restore(): Promise<ReadonlyArray<AgentMessage>> {
    if (this.restored !== null) return this.restored;
    const messages = await this.memory.restore(
      this.agentKey,
      this.sessionId,
      this.teamId,
    );
    if (messages.length > 0) {
      this.agent.state.messages = [...messages];
    }
    this.restored = messages;
    return messages;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.registerSubscriptions();

    const restored = this.restored ?? await this.restore();
    if (restored.length > 0) {
      const lastRole = restored[restored.length - 1]!.role;
      if (lastRole === "user" || lastRole === "toolResult") {
        await this.agent.continue();
      }
    }

    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      await this.agent.prompt(next);
    }
  }

  stop(): void {
    for (const off of this.unsubscribers) off();
    for (const off of this.externalCleanups) off();
    this.unsubscribers.length = 0;
    this.externalCleanups.length = 0;
  }

  private handlePiAgentEvent(event: PiAgentEvent): void {
    const agentSender = this.sender;
    switch (event.type) {
      case "turn_start":
        this.eventManager.publish(Events.agentTurnStart(agentSender));
        return;
      case "turn_end": {
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.agent.followUp(next);
        }
        this.eventManager.publish(Events.agentPromptQueueUpdate(agentSender, this.queue.map(userPromptText)));
        return;
      }
      case "agent_end": {
        const final = readFinalStopReason(event);
        this.eventManager.publish(Events.agentIdle(agentSender, final.stopReason));
        if (final.isError && final.errorMessage !== null) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, final.errorMessage));
        }
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.agent.followUp(next);
        }
        this.eventManager.publish(Events.agentPromptQueueUpdate(agentSender, this.queue.map(userPromptText)));
        return;
      }
      case "message_start":
        this.stream.beginStream();
        return;
      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (ame.type === "text_delta") {
          this.stream.append("text", ame.delta);
        } else if (ame.type === "thinking_delta") {
          this.stream.append("thinking", ame.delta);
        }
        return;
      }
      case "message_end":
        if (event.message.role === "assistant") {
          this.stream.endStream();
          if (event.message.usage !== undefined) {
            this.eventManager.publish(Events.agentUsage(agentSender, {
              input: event.message.usage.input,
              output: event.message.usage.output,
              cacheRead: event.message.usage.cacheRead,
              cacheWrite: event.message.usage.cacheWrite,
              totalTokens: event.message.usage.totalTokens,
            }));
          }
        }
        this.memory.persist(
          event.message,
          this.agentKey,
          this.sessionId,
          this.teamId,
        );
        return;
      default:
        return;
    }
  }

  private registerSubscriptions(): void {
    this.unsubscribers.push(
      this.eventManager.subscribe("user.prompt", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.ingestUserPrompt(env.payload);
      }),
      this.eventManager.subscribe("agent.interrupt", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.interruptActiveRun();
      }),
    );
    for (const topic of this.soul.subscribe) {
      this.unsubscribers.push(
        this.eventManager.subscribe(`custom.${this.teamId}.${topic}`, (env) => {
          this.ingestCustom(topic, env.sender, env.payload);
        }),
      );
    }
  }

  private ingestUserPrompt(payload: { teamId: string; agentKey: string; prompt: string }): void {
    this.dispatchIngress("user", null, payload.prompt);
  }

  private ingestCustom(topic: string, sender: AgentSender, payload: { message: string; truncated: boolean }): void {
    if (sender.agentKey === this.agentKey) return;
    this.dispatchIngress(topic, sender.agentKey, payload.message);
  }

  private dispatchIngress(topic: string, source: string | null, prompt: string): void {
    const synthetic = source !== null
      ? `[${source} on '${topic}']: ${prompt}`
      : `[user]: ${prompt}`;
    const message: UserMessage = {
      role: "user",
      content: synthetic,
      timestamp: Date.now(),
    };
    if (this.agent.state.isStreaming) {
      this.queue.push(message);
      this.eventManager.publish(Events.agentPromptQueueUpdate(this.sender, this.queue.map(userPromptText)));
    } else {
      void this.agent.prompt(message);
    }
  }

  private interruptActiveRun(): void {
    if (!this.agent.state.isStreaming) return;
    this.agent.abort();
  }
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

function agentEffort(thinkingLevel: ThinkingLevel): EffortLevel {
  if (thinkingLevel === "low" || thinkingLevel === "medium" || thinkingLevel === "high") return thinkingLevel;
  if (thinkingLevel === "xhigh") return "max";
  return "off";
}

function resolveBodyModelInfo(model: Model<Api> | undefined, thinkingLevel: ThinkingLevel): ModelInfo | null {
  if (model === undefined) return null;
  return { provider: model.provider, id: model.id, effort: agentEffort(thinkingLevel), contextWindow: model.contextWindow };
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

function userPromptText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function readFinalStopReason(event: Extract<PiAgentEvent, { type: "agent_end" }> | Extract<PiAgentEvent, { type: "turn_end" }>): { stopReason: StopReason; isError: boolean; errorMessage: string | null } {
  const candidates: AgentMessage[] = event.type === "agent_end" ? event.messages : [event.message];
  let lastAssistant: AssistantMessage | undefined;
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const message = candidates[i];
    if (message !== undefined && message.role === "assistant") {
      lastAssistant = message;
      break;
    }
  }
  const stopReason: StopReason = lastAssistant?.stopReason ?? "stop";
  const isError = stopReason === "error" || stopReason === "aborted";
  return { stopReason, isError, errorMessage: lastAssistant?.errorMessage ?? null };
}
