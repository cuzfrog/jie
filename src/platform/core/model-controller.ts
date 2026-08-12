import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { EffortLevel, ModelInfo } from "../types";

export interface ModelController {
  readonly modelInfo: ModelInfo | null;
  applyEffort(effort: EffortLevel): void;
  applyModelUpdate(provider: string, modelId: string): void;
}

interface AgentModelState {
  setModel(model: Model<Api>): void;
  getThinkingLevel(): ThinkingLevel;
  setThinkingLevel(level: ThinkingLevel): void;
}

interface ModelControllerDeps {
  readonly eventManager: EventManager;
  readonly sender: AgentSender;
  readonly soulPinsModel: boolean;
  readonly soulPinsEffort: boolean;
  readonly resolveModel: (provider: string, modelId: string) => Model<Api> | undefined;
  readonly agentState: AgentModelState;
}

export class ModelControllerImpl implements ModelController {
  private readonly eventManager: EventManager;
  private readonly sender: AgentSender;
  private readonly soulPinsModel: boolean;
  private readonly resolveModel: (provider: string, modelId: string) => Model<Api> | undefined;
  private readonly agentState: AgentModelState;
  private readonly soulPinsEffort: boolean;
  private currentModelInfo: ModelInfo | null;

  constructor(initialModel: Model<Api> | undefined, effort: EffortLevel, deps: ModelControllerDeps) {
    this.eventManager = deps.eventManager;
    this.sender = deps.sender;
    this.soulPinsModel = deps.soulPinsModel;
    this.soulPinsEffort = deps.soulPinsEffort;
    this.resolveModel = deps.resolveModel;
    this.agentState = deps.agentState;
    this.agentState.setThinkingLevel(effortToThinkingLevel(effort));
    this.currentModelInfo = resolveModelInfo(initialModel, this.agentState.getThinkingLevel());
    if (initialModel !== undefined) {
      this.agentState.setModel(initialModel);
      this.publishAssigned();
    }
  }

  get modelInfo(): ModelInfo | null {
    return this.currentModelInfo;
  }

  applyEffort(effort: EffortLevel): void {
    if (this.soulPinsEffort) return;
    this.agentState.setThinkingLevel(effortToThinkingLevel(effort));
    if (this.currentModelInfo === null) return;
    this.currentModelInfo = { ...this.currentModelInfo, effort };
    this.publishAssigned();
  }

  applyModelUpdate(provider: string, modelId: string): void {
    if (this.soulPinsModel) return;
    const resolved = this.resolveModel(provider, modelId);
    if (resolved === undefined) return;
    this.agentState.setModel(resolved);
    const effort = this.currentModelInfo === null ? effortOfThinkingLevel(this.agentState.getThinkingLevel()) : this.currentModelInfo.effort;
    this.currentModelInfo = { provider: resolved.provider, id: resolved.id, effort, contextWindow: resolved.contextWindow };
    this.publishAssigned();
  }

  private publishAssigned(): void {
    if (this.currentModelInfo === null) return;
    this.eventManager.publish(Events.agentModelAssigned(
      this.sender, this.currentModelInfo.provider, this.currentModelInfo.id, this.currentModelInfo.effort, this.currentModelInfo.contextWindow));
  }
}

function effortOfThinkingLevel(thinkingLevel: ThinkingLevel): EffortLevel {
  if (thinkingLevel === "low" || thinkingLevel === "medium" || thinkingLevel === "high") return thinkingLevel;
  if (thinkingLevel === "xhigh") return "max";
  return "off";
}

function effortToThinkingLevel(effort: EffortLevel): ThinkingLevel {
  return effort === "max" ? "xhigh" : effort;
}

function resolveModelInfo(model: Model<Api> | undefined, thinkingLevel: ThinkingLevel): ModelInfo | null {
  if (model === undefined) return null;
  return { provider: model.provider, id: model.id, effort: effortOfThinkingLevel(thinkingLevel), contextWindow: model.contextWindow };
}
