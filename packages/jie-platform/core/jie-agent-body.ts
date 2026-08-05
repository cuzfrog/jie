import { Agent, convertToLlm, type AgentMessage, type AgentTool, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { ExecutionContext, ToolRegistry } from "../tools";
import type { Skill, SkillManager } from "../skills";
import type { HookIdentity, HookRunner } from "../hooks";
import { AgentEventBridgeImpl } from "./agent-event-bridge";
import { composeSystemPrompt } from "./system-prompt";
import { Events, type AgentSender, type EventManager } from "../event";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import type { Compactor } from "./compaction";
import { PromptQueueImpl, type PromptQueue } from "./prompt-queue";
import { adaptToolToAgent } from "./tool-adapter";
import { ToolCallObserverImpl } from "./tool-call-observer";
import { JiePlatformError } from "../jie-platform-errors";
import type { AgentInfo, EffortLevel, ModelInfo } from "../types";

const SKILL_INVOCATION_PREFIX = "/skill:";

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
  resolveModel(provider: string, modelId: string): Model<Api> | undefined;
  readonly createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
  readonly compactor: Compactor;
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
  private readonly resolveModel: (provider: string, modelId: string) => Model<Api> | undefined;
  private readonly getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  private readonly compactor: Compactor;
  private readonly agent: Agent;
  private readonly sender: AgentSender;
  private readonly promptQueue: PromptQueue;
  private compactionPromise: Promise<void> | null = null;
  private compactionController: AbortController | null = null;
  private readonly resolvedSkills: ReadonlyArray<Skill>;
  private modelInfo: ModelInfo | null;
  private readonly cleanups: Array<() => void> = [];
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
    this.resolveModel = deps.resolveModel;
    this.getApiKey = deps.getApiKey;
    this.compactor = deps.compactor;
    this.hookIdentity = {
      sessionId: this.sessionId,
      cwd: deps.cwd,
      teamId: this.teamId,
      agentKey: this.agentKey,
      role: params.soul.role,
    };
    this.sender = { kind: "agent", teamId: this.teamId, agentKey: this.agentKey };
    this.promptQueue = new PromptQueueImpl({
      dispatcher: {
        prompt: (message) => void this.agent.prompt(message),
        followUp: (message) => this.agent.followUp(message),
        isStreaming: () => this.agent.state.isStreaming,
      },
      eventManager: deps.eventManager,
      sender: this.sender,
      beforeDispatch: () => this.ensureCompacted(),
    });
    const eventBridge = new AgentEventBridgeImpl({
      eventManager: deps.eventManager,
      memory: this.memory,
      hookRunner: this.hookRunner,
      hookIdentity: this.hookIdentity,
      sender: this.sender,
      promptQueue: this.promptQueue,
      onRunEnd: () => void this.agent.waitForIdle().then(() => this.promptQueue.settle()),
    });
    const executionContext: ExecutionContext = {
      sessionId: this.sessionId,
      teamId: this.teamId,
      agentKey: this.agentKey,
      agentRole: params.soul.role,
      artifactStore: deps.artifactStore,
      lifecycle: params.lifecycle,
    };
    const adaptedTools = adaptAllTools(params.soul, deps.toolRegistry, executionContext);
    const toolCallObserver = new ToolCallObserverImpl({
      eventManager: deps.eventManager,
      hookRunner: this.hookRunner,
      hookIdentity: this.hookIdentity,
      sender: this.sender,
    });
    const createAgent = deps.createAgent ?? defaultAgentFactory;
    this.agent = createAgent({
      sessionId: this.sessionId,
      getApiKey: deps.getApiKey,
      streamFn: streamSimple,
      convertToLlm,
      transformContext: async (messages: AgentMessage[]) => [...this.compactor.fitToWindow(messages, this.agent.state.model)],
      steeringMode: "all",
      followUpMode: "all",
      toolExecution: "sequential",
      beforeToolCall: (context) => toolCallObserver.beforeToolCall(context),
      afterToolCall: (context) => toolCallObserver.afterToolCall(context),
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
        this.eventManager.publish(Events.agentModelAssigned(
          this.sender, this.modelInfo.provider, this.modelInfo.id, this.modelInfo.effort, this.modelInfo.contextWindow));
      }
    }
    this.agent.state.tools = adaptedTools;
    const unsubscribeAgent = this.agent.subscribe((event, _signal) => eventBridge.handleEvent(event));
    this.cleanups.push(unsubscribeAgent);
  }

  get identity(): AgentInfo {
    return {
      teamId: this.teamId,
      role: this.soul.role,
      agentKey: this.agentKey,
      isLeader: this.isLeader,
      tools: this.soul.tools,
      subscribe: this.soul.subscribe,
      skills: this.resolvedSkills.map((skill) => ({ name: skill.name, description: skill.description, argumentHint: skill.argumentHint })),
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

    while (!this.stopped && !this.promptQueue.isEmpty()) {
      await this.promptQueue.dispatchNext();
      await this.agent.waitForIdle();
    }
  }

  stop(): void {
    this.stopped = true;
    this.compactionController?.abort();
    this.promptQueue.stop();
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
  }

  private registerSubscriptions(): void {
    this.cleanups.push(
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
        this.promptQueue.dequeue(env.payload.prompt);
      }),
      this.eventManager.subscribe("user.prompt.requeue", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.promptQueue.requeue(env.payload.prompt);
      }),
      this.eventManager.subscribe("user.effort.update", (env) => {
        this.applyEffort(env.payload.effort);
      }),
      this.eventManager.subscribe("user.model.update", (env) => {
        this.applyModelUpdate(env.payload.provider, env.payload.modelId);
      }),
    );
    for (const topic of this.soul.subscribe) {
      this.cleanups.push(
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
    const expanded = this.expandSkillInvocation(payload.prompt) ?? payload.prompt;
    const prompt = outcome.additionalContext === null ? expanded : `${expanded}\n\n${outcome.additionalContext}`;
    this.promptQueue.consumeResubmitted(payload.prompt);
    this.promptQueue.ingestUserPrompt(prompt, payload.prompt);
  }

  private expandSkillInvocation(text: string): string | null {
    if (!text.startsWith(SKILL_INVOCATION_PREFIX)) return null;
    const rest = text.slice(SKILL_INVOCATION_PREFIX.length);
    const separatorIndex = rest.search(/\s/);
    const name = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
    if (name === "") return null;
    const skill = this.resolvedSkills.find((candidate) => candidate.name === name);
    if (skill === undefined) return null;
    const args = separatorIndex === -1 ? "" : rest.slice(separatorIndex + 1).trim();
    return skill.expandInvocation(args);
  }

  private ingestCustom(topic: string, sender: AgentSender, payload: { message: string; truncated: boolean }): void {
    if (sender.agentKey === this.agentKey) return;
    this.promptQueue.ingestPeerNotification(topic, sender.agentKey, payload.message);
  }

  private ensureCompacted(): Promise<void> {
    if (this.compactionPromise === null) {
      this.compactionPromise = this.runCompaction().finally(() => {
        this.compactionPromise = null;
      });
    }
    return this.compactionPromise;
  }

  private async runCompaction(): Promise<void> {
    if (this.modelInfo === null) return;
    const model = this.agent.state.model;
    const controller = new AbortController();
    this.compactionController = controller;
    try {
      const result = await this.compactor.compact({
        messages: this.agent.state.messages,
        contextWindow: model.contextWindow,
        model,
        apiKey: await this.getApiKey(model.provider),
        agentKey: this.agentKey,
        sessionId: this.sessionId,
        teamId: this.teamId,
        signal: controller.signal,
      });
      if (result === null || this.stopped) return;
      const summarizedPrefix = this.agent.state.messages.slice(0, result.firstKeptIndex);
      this.agent.state.messages = [result.summaryMessage, ...this.agent.state.messages.slice(result.firstKeptIndex)];
      const summarizedPrompts = summarizedPrefix.reduce((count, message) => message.role === "user" ? count + 1 : count, 0);
      this.eventManager.publish(Events.agentCompacted(this.sender, result.summaryMessage.summary, result.tokensBefore, summarizedPrompts));
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        this.eventManager.publish(Events.systemError({ kind: "system" }, `compaction failed: ${message}`));
      }
    } finally {
      if (this.compactionController === controller) this.compactionController = null;
    }
  }

  private interruptActiveRun(): void {
    if (!this.agent.state.isStreaming) return;
    this.agent.abort();
  }

  private applyEffort(effort: EffortLevel): void {
    this.agent.state.thinkingLevel = effortToThinkingLevel(effort);
    if (this.modelInfo === null) return;
    this.modelInfo = { ...this.modelInfo, effort };
    this.eventManager.publish(Events.agentModelAssigned(
      this.sender, this.modelInfo.provider, this.modelInfo.id, effort, this.modelInfo.contextWindow));
  }

  private applyModelUpdate(provider: string, modelId: string): void {
    if (this.soul.model !== "") return;
    const model = this.resolveModel(provider, modelId);
    if (model === undefined) return;
    this.agent.state.model = model;
    const effort = this.modelInfo === null ? agentEffort(this.agent.state.thinkingLevel) : this.modelInfo.effort;
    this.modelInfo = { provider: model.provider, id: model.id, effort, contextWindow: model.contextWindow };
    this.eventManager.publish(Events.agentModelAssigned(this.sender, model.provider, model.id, effort, model.contextWindow));
  }
}

function adaptAllTools(
  soul: AgentBodyParams["soul"],
  toolRegistry: ToolRegistry,
  executionContext: ExecutionContext,
): AgentTool[] {
  const out: AgentTool[] = [];
  const assigned = new Set<string>();
  for (const toolSpec of soul.tools) {
    const tools = toolRegistry.resolve(toolSpec);
    if (tools.length === 0) {
      throw new JiePlatformError("TOOL_SPEC_UNRESOLVED", {
        detail: `agent '${soul.role}' (team '${executionContext.teamId}'): tool spec '${toolSpec}' resolved no tools`,
      });
    }
    for (const tool of tools) {
      if (assigned.has(tool.name)) continue;
      assigned.add(tool.name);
      out.push(adaptToolToAgent(tool, executionContext));
    }
  }
  for (const tool of toolRegistry.list()) {
    if (tool.isUtility !== true || assigned.has(tool.name)) continue;
    assigned.add(tool.name);
    out.push(adaptToolToAgent(tool, executionContext));
  }
  return out;
}

function defaultAgentFactory(agentOptions: ConstructorParameters<typeof Agent>[0]): Agent {
  return new Agent(agentOptions);
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
