import { Agent, convertToLlm, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import type { SettingsStore } from "../config";
import { loadMemoryBootstrap, type MemoryExtractor, type MemoryStore } from "../memory";
import type { ArtifactStore, TranscriptStore } from "../storage";
import type { ExecutionContext, ToolRegistry } from "../tools";
import type { Skill, SkillManager } from "../skills";
import type { HookIdentity, HookRunner } from "../hooks";
import { AgentEventBridgeImpl } from "./agent-event-bridge";
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
  readonly memoryStore: MemoryStore;
  readonly memoryExtractor: MemoryExtractor;
  readonly settingsStore: SettingsStore;
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
  private readonly memoryStore: MemoryStore;
  private readonly settingsStore: SettingsStore;
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
    this.memoryStore = deps.memoryStore;
    this.settingsStore = deps.settingsStore;
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
      memoryExtractor: deps.memoryExtractor,
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
    const memoryBlock = loadMemoryBootstrap(this.memoryStore, this.settingsStore, this.teamId);
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
    return this.compactionRunner.ensure(this.agent.state.model);
  }

  private interruptActiveRun(): void {
    if (!this.agent.state.isStreaming) return;
    this.agent.abort();
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
