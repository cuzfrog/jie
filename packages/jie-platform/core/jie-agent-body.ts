import { Agent, type AgentMessage, type AgentEvent as PiAgentEvent, type AgentTool, type AgentToolResult, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, StopReason, TextContent, UserMessage } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { ExecutionContext, ToolRegistry } from "../tools";
import { expandSkillInvocation, type Skill, type SkillManager } from "../skills";
import type { HookIdentity, HookRunner } from "../hooks";
import { composeSystemPrompt } from "../prompt";
import { Events, type AgentSender, type EventManager } from "../event";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import { StreamPublisherImpl, type StreamPublisher } from "./streaming";
import { adaptToolToAgent } from "./tool-adapter";
import { JiePlatformError } from "../jie-platform-errors";
import type { AgentInfo, EffortLevel, ModelInfo } from "../types";

const DEQUEUED_PROMPT_CAP = 32;

interface AgentBodyDeps {
  readonly eventManager: EventManager;
  readonly artifactStore: ArtifactStore;
  readonly memory: MemoryManager;
  readonly toolRegistry: ToolRegistry;
  readonly skillManager: SkillManager;
  readonly systemContextBlock: string;
  readonly hookRunner: HookRunner;
  readonly cwd: string;
  getApiKey(provider: string): Promise<string | undefined> | string | undefined;
  readonly createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

export class JieAgentBody implements AgentBody {
  private readonly agentKey: string;
  private readonly teamId: string;
  private readonly soul: AgentBodyParams["soul"];
  private readonly isLeader: boolean;
  private readonly sessionId: string;
  private readonly eventManager: EventManager;
  private readonly memory: MemoryManager;
  private readonly hookRunner: HookRunner;
  private readonly hookIdentity: HookIdentity;
  private readonly agent: Agent;
  private readonly stream: StreamPublisher;
  private readonly sender: AgentSender;
  private readonly queue: QueuedPrompt[] = [];
  private readonly dequeuedPrompts: QueuedPrompt[] = [];
  private readonly resolvedSkills: ReadonlyArray<Skill>;
  private modelInfo: ModelInfo | null;
  private pendingTurnPrompt: string | null = null;
  private turnStartPending = false;
  private readonly followUpLabels: Map<AgentMessage, string | null> = new Map();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly externalCleanups: Array<() => void> = [];
  private restored: ReadonlyArray<AgentMessage> | null = null;
  private started = false;
  private stopped = false;

  constructor(params: AgentBodyParams, deps: AgentBodyDeps) {
    this.agentKey = params.agentKey;
    this.teamId = params.teamId;
    this.soul = params.soul;
    this.sessionId = params.sessionId;
    this.eventManager = deps.eventManager;
    this.memory = deps.memory;
    this.hookRunner = deps.hookRunner;
    this.hookIdentity = {
      sessionId: this.sessionId,
      cwd: deps.cwd,
      teamId: this.teamId,
      agentKey: this.agentKey,
      role: params.soul.role,
    };
    this.sender = { kind: "agent", teamId: this.teamId, agentKey: this.agentKey };
    this.stream = new StreamPublisherImpl(deps.eventManager, this.sender);
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
      streamFn: streamSimple,
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
        const preOutcome = await this.hookRunner.preToolUse({
          identity: this.hookIdentity,
          toolName: context.toolCall.name,
          toolInput: context.args,
        });
        if (preOutcome.block) return { block: true, reason: preOutcome.reason ?? undefined };
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
        const postOutcome = await this.hookRunner.postToolUse({
          identity: this.hookIdentity,
          toolName: context.toolCall.name,
          toolInput: context.args,
          toolResponse: output === null ? "" : JSON.stringify(output),
        });
        if (postOutcome.block) {
          return { isError: true, content: [{ type: "text", text: postOutcome.reason ?? "blocked by PostToolUse hook" }] };
        }
        if (postOutcome.additionalContext !== null) {
          return { content: [...context.result.content, { type: "text", text: postOutcome.additionalContext }] };
        }
        return undefined;
      },
    });
    this.resolvedSkills = params.soul.skills.flatMap((spec) => deps.skillManager.resolve(spec));
    this.agent.state.systemPrompt = composeSystemPrompt({
      rolePrompt: params.soul.systemPrompt,
      contextBlock: deps.systemContextBlock,
      skills: this.resolvedSkills,
    });
    this.isLeader = params.isLeader;
    this.agent.state.thinkingLevel = effortToThinkingLevel(params.effort);
    this.modelInfo = resolveBodyModelInfo(params.model, this.agent.state.thinkingLevel);
    if (params.model !== undefined) {
      this.agent.state.model = params.model;
      if (this.modelInfo !== null) {
        this.eventManager.publish(Events.agentModelAssigned(this.sender, this.modelInfo.provider, this.modelInfo.id, this.modelInfo.effort));
      }
    }
    this.agent.state.tools = adaptedTools;
    const unsubscribeAgent = this.agent.subscribe((event, _signal) => this.handlePiAgentEvent(event));
    this.externalCleanups.push(unsubscribeAgent);
  }

  get identity(): AgentInfo {
    return {
      teamId: this.teamId,
      role: this.soul.role,
      agentKey: this.agentKey,
      isLeader: this.isLeader,
      tools: this.soul.tools,
      subscribe: this.soul.subscribe,
      skills: this.resolvedSkills.map((skill) => skill.name),
      model: this.modelInfo,
    };
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

  messages(): ReadonlyArray<AgentMessage> {
    return [...this.agent.state.messages];
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.registerSubscriptions();
    await this.hookRunner.sessionStart({ identity: this.hookIdentity });

    const restored = this.restored ?? await this.restore();
    if (restored.length > 0) {
      const lastRole = restored[restored.length - 1]!.role;
      if (lastRole === "user" || lastRole === "toolResult") {
        await this.agent.continue();
      }
    }

    while (!this.stopped && this.queue.length > 0) {
      this.drainQueue();
      await this.agent.waitForIdle();
    }
  }

  stop(): void {
    this.stopped = true;
    for (const off of this.unsubscribers) off();
    for (const off of this.externalCleanups) off();
    this.unsubscribers.length = 0;
    this.externalCleanups.length = 0;
  }

  private handlePiAgentEvent(event: PiAgentEvent): void {
    const agentSender = this.sender;
    if (event.type !== "turn_start") this.flushTurnStart(event);
    switch (event.type) {
      case "turn_start":
        this.turnStartPending = true;
        return;
      case "turn_end": {
        const final = readFinalStopReason(event);
        if (!final.isError && this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.followUpLabels.set(next.message, next.userText);
          this.agent.followUp(next.message);
        }
        this.publishQueueUpdate(agentSender);
        return;
      }
      case "agent_end": {
        const final = readFinalStopReason(event);
        this.eventManager.publish(Events.agentIdle(agentSender, final.stopReason));
        if (final.isError && final.errorMessage !== null) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, final.errorMessage));
        }
        void this.hookRunner.stop({ identity: this.hookIdentity });
        this.pendingTurnPrompt = null;
        this.publishQueueUpdate(agentSender);
        void this.agent.waitForIdle().then(() => this.drainQueue());
        return;
      }
      case "message_start":
        if (event.message.role === "user") this.followUpLabels.delete(event.message);
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
          if (event.message.usage !== undefined && event.message.usage.totalTokens > 0) {
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

  private flushTurnStart(event: PiAgentEvent): void {
    if (!this.turnStartPending) return;
    this.turnStartPending = false;
    let label = this.pendingTurnPrompt;
    this.pendingTurnPrompt = null;
    if (event.type === "message_start" && event.message.role === "user") {
      const supplied = this.followUpLabels.get(event.message);
      if (supplied !== undefined) label = supplied;
    }
    this.eventManager.publish(Events.agentTurnStart(this.sender, label));
  }

  private registerSubscriptions(): void {
    this.unsubscribers.push(
      this.eventManager.subscribe("user.prompt", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        void this.ingestUserPrompt(env.payload);
      }),
      this.eventManager.subscribe("agent.interrupt", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.interruptActiveRun();
      }),
      this.eventManager.subscribe("user.prompt.dequeue", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.dequeuePrompt(env.payload.prompt);
      }),
      this.eventManager.subscribe("user.prompt.requeue", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.requeuePrompt(env.payload.prompt);
      }),
      this.eventManager.subscribe("user.effort.update", (env) => {
        this.applyEffort(env.payload.effort);
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

  private async ingestUserPrompt(payload: { teamId: string; agentKey: string; prompt: string }): Promise<void> {
    const outcome = await this.hookRunner.userPromptSubmit({ identity: this.hookIdentity, prompt: payload.prompt });
    if (outcome.block) {
      this.eventManager.publish(Events.systemError({ kind: "system" }, outcome.reason ?? "prompt blocked by UserPromptSubmit hook"));
      return;
    }
    const expanded = expandSkillInvocation(payload.prompt, this.resolvedSkills) ?? payload.prompt;
    const prompt = outcome.additionalContext === null ? expanded : `${expanded}\n\n${outcome.additionalContext}`;
    const consumed = this.dequeuedPrompts.findIndex((entry) => entry.userText === payload.prompt);
    if (consumed !== -1) this.dequeuedPrompts.splice(consumed, 1);
    this.dispatchIngress("user", null, prompt, payload.prompt);
  }

  private ingestCustom(topic: string, sender: AgentSender, payload: { message: string; truncated: boolean }): void {
    if (sender.agentKey === this.agentKey) return;
    this.dispatchIngress(topic, sender.agentKey, payload.message, null);
  }

  private dispatchIngress(topic: string, source: string | null, prompt: string, userText: string | null): void {
    const synthetic = source !== null
      ? `[${source} on '${topic}']: ${prompt}`
      : `[user]: ${prompt}`;
    const message: UserMessage = {
      role: "user",
      content: synthetic,
      timestamp: Date.now(),
    };
    this.queue.push({ message, userText });
    this.publishQueueUpdate(this.sender);
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.stopped || this.agent.state.isStreaming || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.pendingTurnPrompt = next.userText;
    this.publishQueueUpdate(this.sender);
    void this.agent.prompt(next.message);
  }

  private publishQueueUpdate(sender: AgentSender): void {
    const prompts = this.queue.map((entry) => entry.userText !== null
      ? { text: entry.userText, source: "user" as const }
      : { text: userPromptText(entry.message), source: "peer" as const });
    this.eventManager.publish(Events.agentPromptQueueUpdate(sender, prompts));
  }

  private dequeuePrompt(prompt: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.userText === prompt) {
        const removed = this.queue.splice(i, 1)[0];
        if (removed !== undefined) {
          this.dequeuedPrompts.push(removed);
          if (this.dequeuedPrompts.length > DEQUEUED_PROMPT_CAP) this.dequeuedPrompts.shift();
        }
        break;
      }
    }
    this.publishQueueUpdate(this.sender);
  }

  private requeuePrompt(prompt: string): void {
    for (let i = this.dequeuedPrompts.length - 1; i >= 0; i--) {
      if (this.dequeuedPrompts[i]!.userText === prompt) {
        const restored = this.dequeuedPrompts.splice(i, 1)[0];
        if (restored !== undefined) this.queue.push(restored);
        break;
      }
    }
    this.publishQueueUpdate(this.sender);
    this.drainQueue();
  }

  private interruptActiveRun(): void {
    if (!this.agent.state.isStreaming) return;
    this.agent.abort();
  }

  private applyEffort(effort: EffortLevel): void {
    this.agent.state.thinkingLevel = effortToThinkingLevel(effort);
    if (this.modelInfo === null) return;
    this.modelInfo = { ...this.modelInfo, effort };
    this.eventManager.publish(Events.agentModelAssigned(this.sender, this.modelInfo.provider, this.modelInfo.id, effort));
  }
}

function adaptAllTools(
  soul: AgentBodyParams["soul"],
  toolRegistry: ToolRegistry,
  executionContext: ExecutionContext,
): AgentTool[] {
  const out: AgentTool[] = [];
  for (const toolSpec of soul.tools) {
    const tools = toolRegistry.resolve(toolSpec);
    if (tools.length === 0) {
      throw new JiePlatformError("TOOL_SPEC_UNRESOLVED", {
        detail: `agent '${soul.role}' (team '${executionContext.teamId}'): tool spec '${toolSpec}' resolved no tools`,
      });
    }
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

function effortToThinkingLevel(effort: EffortLevel): ThinkingLevel {
  return effort === "max" ? "xhigh" : effort;
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

interface QueuedPrompt {
  readonly message: AgentMessage;
  readonly userText: string | null;
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
