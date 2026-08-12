import { Agent, convertToLlm, type AgentLoopTurnUpdate, type AgentMessage, type AgentTool, type PrepareNextTurnContext } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { MemoryManager } from "../memory";
import type { ArtifactStore, TranscriptStore } from "../storage";
import { type ExecutionContext, parseToolSpec, type ToolRegistry, type ToolSpec } from "../tools";
import type { Skill, SkillManager } from "../skills";
import type { HookIdentity, HookRunner } from "../hooks";
import { AgentEventBridgeImpl } from "./agent-event-bridge";
import { FileAgentLoopLogger, type AgentLoopLogger } from "./agent-loop-logger";
import { composeSystemPrompt } from "./system-prompt";
import { Events, type AgentSender, type EventManager } from "../event";
import type { AgentBody, AgentBodyParams } from "./agent-body";
import type { Compactor } from "./compaction";
import { CompactionRunnerImpl, type CompactionRunner } from "./compaction-runner";
import { ModelControllerImpl, type ModelController } from "./model-controller";
import { PromptQueueImpl, type PromptQueue } from "./prompt-queue";
import { adaptToolToAgent } from "./tool-adapter";
import { ToolCallObserverImpl } from "./tool-call-observer";
import { JiePlatformError } from "../jie-platform-errors";
import type { AgentInfo } from "../types";

const SKILL_INVOCATION_PREFIX = "/skill:";

interface AgentBodyDeps {
  readonly eventManager: EventManager;
  readonly artifactStore: ArtifactStore;
  readonly transcriptStore: TranscriptStore;
  readonly toolRegistry: ToolRegistry;
  readonly skillManager: SkillManager;
  readonly systemContextBlock: string;
  readonly hookRunner: HookRunner;
  readonly cwd: string;
  getApiKey(provider: string): Promise<string | undefined> | string | undefined;
  resolveModel(provider: string, modelId: string): Model<Api> | undefined;
  readonly createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
  readonly compactor: Compactor;
  readonly memoryManager: MemoryManager;
  readonly logDir: string | null;
}

export class JieAgentBody implements AgentBody {
  private readonly agentKey: string;
  private readonly teamId: string;
  private readonly soul: AgentBodyParams["soul"];
  private readonly isLeader: boolean;
  private readonly sessionId: string;
  private readonly eventManager: EventManager;
  private readonly transcriptStore: TranscriptStore;
  private readonly hookRunner: HookRunner;
  private readonly hookIdentity: HookIdentity;
  private readonly compactor: Compactor;
  private readonly systemContextBlock: string;
  private readonly memoryManager: MemoryManager;
  private readonly agent: Agent;
  private readonly sender: AgentSender;
  private readonly promptQueue: PromptQueue;
  private readonly compactionRunner: CompactionRunner;
  private readonly modelController: ModelController;
  private readonly resolvedSkills: ReadonlyArray<Skill>;
  private readonly cleanups: Array<() => void> = [];
  private restored: ReadonlyArray<AgentMessage> | null = null;
  private started = false;
  private stopped = false;
  private loopLogger: AgentLoopLogger | null = null;

  constructor(params: AgentBodyParams, deps: AgentBodyDeps) {
    this.agentKey = params.agentKey;
    this.teamId = params.teamId;
    this.soul = params.soul;
    this.sessionId = params.sessionId;
    this.eventManager = deps.eventManager;
    this.transcriptStore = deps.transcriptStore;
    this.hookRunner = deps.hookRunner;
    this.compactor = deps.compactor;
    this.systemContextBlock = deps.systemContextBlock;
    this.memoryManager = deps.memoryManager;
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
    this.compactionRunner = new CompactionRunnerImpl({
      compactor: deps.compactor,
      eventManager: deps.eventManager,
      sender: this.sender,
      agentKey: this.agentKey,
      sessionId: this.sessionId,
      teamId: this.teamId,
      conversation: {
        getMessages: () => this.agent.state.messages,
        setMessages: (messages) => {
          this.agent.state.messages = [...messages];
        },
      },
      memoryManager: this.memoryManager,
    });
    const eventBridge = new AgentEventBridgeImpl({
      eventManager: deps.eventManager,
      transcriptStore: this.transcriptStore,
      hookRunner: this.hookRunner,
      hookIdentity: this.hookIdentity,
      sender: this.sender,
      promptQueue: this.promptQueue,
      onRunEnd: () => void this.agent.waitForIdle().then(() => this.promptQueue.settle()),
    });
    const parsedTools = params.soul.tools.map(parseToolSpec);
    const toolArgs = new Map<string, ReadonlyArray<string>>();
    for (const parsed of parsedTools) {
      if (parsed.args.length > 0) toolArgs.set(parsed.name, parsed.args);
    }
    const executionContext: ExecutionContext = {
      sessionId: this.sessionId,
      teamId: this.teamId,
      agentKey: this.agentKey,
      agentRole: params.soul.role,
      artifactStore: deps.artifactStore,
      toolArgs,
    };
    const adaptedTools = adaptAllTools(parsedTools, params.soul.role, deps.toolRegistry, executionContext);
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
      transformContext: async (messages: AgentMessage[]) => {
        const stripped = stripThinkingDurations(messages);
        const contextWindow = resolveContextWindow(this.soul, this.agent.state.model);
        return [...this.compactor.fitToWindow(stripped, this.agent.state.model, contextWindow)];
      },
      steeringMode: "all",
      followUpMode: "all",
      toolExecution: "sequential",
      prepareNextTurnWithContext: (context) => this.compactBetweenTurns(context),
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
    this.modelController = new ModelControllerImpl(params.model, params.effort, {
      eventManager: deps.eventManager,
      sender: this.sender,
      soulPinsModel: params.soul.model !== "",
      resolveModel: deps.resolveModel,
      agentState: {
        setModel: (model) => {
          this.agent.state.model = model;
        },
        getThinkingLevel: () => this.agent.state.thinkingLevel,
        setThinkingLevel: (level) => {
          this.agent.state.thinkingLevel = level;
        },
      },
    });
    this.agent.state.tools = adaptedTools;
    if (deps.logDir !== null) {
      this.loopLogger = new FileAgentLoopLogger({
        logDir: deps.logDir,
        agentKey: this.agentKey,
        teamId: this.teamId,
        sessionId: this.sessionId,
      });
    }
    const logger = this.loopLogger;
    const unsubscribeAgent = this.agent.subscribe((event, _signal) => {
      logger?.log(event);
      eventBridge.handleEvent(event);
    });
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
      model: this.modelController.modelInfo,
    };
  }

  async restore(): Promise<ReadonlyArray<AgentMessage>> {
    if (this.restored !== null) return this.restored;
    const messages = await this.transcriptStore.restore(
      this.agentKey,
      this.sessionId,
      this.teamId,
    );
    if (messages.length > 0) {
      this.agent.state.messages = [...messages];
    }
    this.restored = messages;
    this.loadMemoryBlock();
    return messages;
  }

  private loadMemoryBlock(): void {
    let memoryBlock: string;
    try {
      memoryBlock = this.memoryManager.bootstrap(this.teamId);
    } catch {
      memoryBlock = "";
    }
    this.agent.state.systemPrompt = composeSystemPrompt({
      rolePrompt: this.soul.systemPrompt,
      contextBlock: this.systemContextBlock,
      memoryBlock,
      skills: this.resolvedSkills,
    });
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
    this.compactionRunner.abort();
    this.promptQueue.stop();
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
    this.loopLogger?.close();
    this.loopLogger = null;
  }

  async compact(): Promise<void> {
    if (this.stopped) return;
    await this.ensureCompacted();
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
        this.modelController.applyEffort(env.payload.effort);
      }),
      this.eventManager.subscribe("user.model.update", (env) => {
        this.modelController.applyModelUpdate(env.payload.provider, env.payload.modelId);
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
    if (this.modelController.modelInfo === null) return Promise.resolve();
    const contextWindow = resolveContextWindow(this.soul, this.agent.state.model);
    return this.compactionRunner.ensure(this.agent.state.model, contextWindow).then(() => undefined);
  }

  private async compactBetweenTurns(context: PrepareNextTurnContext): Promise<AgentLoopTurnUpdate | undefined> {
    if (this.modelController.modelInfo === null) return undefined;
    const contextWindow = resolveContextWindow(this.soul, this.agent.state.model);
    const outcome = await this.compactionRunner.ensure(this.agent.state.model, contextWindow);
    if (outcome === null) return undefined;
    return { context: { ...context.context, messages: [...outcome.messages] } };
  }

  private interruptActiveRun(): void {
    if (!this.agent.state.isStreaming) return;
    this.agent.abort();
  }

}

function stripThinkingDurations(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "thinking" || part.thinkingDurationMs === undefined) return part;
      changed = true;
      const { thinkingDurationMs: _ignored, ...stripped } = part;
      return stripped;
    });
    if (!changed) return message;
    return { ...message, content };
  });
}

function adaptAllTools(
  parsedTools: ReadonlyArray<ToolSpec>,
  role: string,
  toolRegistry: ToolRegistry,
  executionContext: ExecutionContext,
): AgentTool[] {
  const out: AgentTool[] = [];
  const assigned = new Set<string>();
  for (const parsed of parsedTools) {
    const tools = toolRegistry.resolve(parsed.name);
    if (tools.length === 0) {
      throw new JiePlatformError("TOOL_SPEC_UNRESOLVED", {
        detail: `agent '${role}' (team '${executionContext.teamId}'): tool spec '${parsed.name}' resolved no tools`,
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

function resolveContextWindow(soul: AgentBodyParams["soul"], model: Model<Api>): number {
  if (soul.targetContextWindowSize === undefined) return model.contextWindow;
  return Math.min(soul.targetContextWindowSize, model.contextWindow);
}
