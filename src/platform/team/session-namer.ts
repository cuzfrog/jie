import { contentText } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, StopReason, UserMessage } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "../config";
import type { EventEnvelope, EventManager } from "../event";
import { Events } from "../event";
import type { LlmService } from "../llm";
import type { TranscriptStore } from "../storage";
import type { AgentHistory, TeamInfo } from "../types";
import type { TeamManager } from "./team-manager";

const VALID_STOP_REASONS: ReadonlyArray<StopReason> = ["stop", "length"] as const;
const SYSTEM_PROMPT = "You generate very short, plain-language titles for conversations." as const;
const PROMPT_MAX_TEXT = 500 as const;
const MAX_TOKENS = 20 as const;
const MAX_NAME_LENGTH = 30 as const;

export interface SessionNamer {
  start(): void;
}

export class SessionNamerImpl implements SessionNamer {
  private readonly pending = new Set<string>();
  private readonly eventManager: EventManager;
  private readonly llmService: LlmService;
  private readonly teamManager: TeamManager;
  private readonly transcriptStore: TranscriptStore;
  private readonly modelRegistry: ModelRegistry;

  constructor(
    eventManager: EventManager,
    llmService: LlmService,
    teamManager: TeamManager,
    transcriptStore: TranscriptStore,
    modelRegistry: ModelRegistry,
  ) {
    this.eventManager = eventManager;
    this.llmService = llmService;
    this.teamManager = teamManager;
    this.transcriptStore = transcriptStore;
    this.modelRegistry = modelRegistry;
    this.start();
  }

  start(): void {
    this.eventManager.subscribe("agent.idle", (event) => void this.onAgentIdle(event));
  }

  async onAgentIdle(event: EventEnvelope<"agent.idle">): Promise<void> {
    if (!VALID_STOP_REASONS.includes(event.payload)) return;
    const teamId = event.sender.teamId;
    const sessionId = this.teamManager.currentSessionId(teamId);
    if (sessionId === null || this.pending.has(sessionId)) return;
    if (this.transcriptStore.sessionName(sessionId) !== null) return;
    this.pending.add(sessionId);
    try {
      await this.generate(teamId, sessionId, event.sender.agentKey);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.eventManager.publish(Events.systemError({ kind: "system" }, `session naming failed: ${detail}`));
    } finally {
      this.pending.delete(sessionId);
    }
  }

  private async generate(teamId: string, sessionId: string, agentKey: string): Promise<void> {
    const info = this.teamManager.listLoaded().get(teamId);
    if (info === undefined) return;
    const history = findAgentHistory(info, agentKey);
    if (history === undefined) return;
    const user = history.messages.find(isUserMessage);
    const assistant = history.messages.find(isAssistantMessage);
    if (user === undefined || assistant === undefined) return;
    const userText = limitText(messageText(user));
    const assistantText = limitText(messageText(assistant));
    if (userText === "" && assistantText === "") return;
    const model = resolveModel(info, history.agentKey, this.modelRegistry);
    if (model === undefined) return;
    const prompt = buildPrompt(userText, assistantText);
    const raw = await this.llmService.complete({ model, systemPrompt: SYSTEM_PROMPT, prompt, maxTokens: MAX_TOKENS });
    const name = cleanSessionName(raw);
    if (name === "") return;
    if (this.transcriptStore.sessionName(sessionId) !== null) return;
    this.teamManager.renameSession(teamId, name);
    this.eventManager.publish(Events.sessionRenamed({ kind: "system" }, teamId, name));
  }
}

function findAgentHistory(info: TeamInfo, agentKey: string): AgentHistory | undefined {
  return info.history.find((entry) => entry.agentKey === agentKey)
    ?? info.history.find((entry) => entry.agentKey === info.leaderKey);
}

function resolveModel(info: TeamInfo, agentKey: string, modelRegistry: ModelRegistry) {
  const modelInfo = info.agents.find((agent) => agent.agentKey === agentKey)?.model
    ?? info.agents.find((agent) => agent.isLeader)?.model;
  if (modelInfo === null || modelInfo === undefined) return undefined;
  return modelRegistry.resolve(modelInfo.provider, modelInfo.id);
}

function buildPrompt(userText: string, assistantText: string): string {
  return [
    "Provide a very short (2-4 words) title for this conversation.",
    "Use only plain words, no punctuation, no quotes.",
    "Return only the title.",
    "",
    `User: ${userText}`,
    `Assistant: ${assistantText}`,
  ].join("\n");
}

function cleanSessionName(raw: string): string {
  const normalized = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "") return "";
  return normalized.length <= MAX_NAME_LENGTH ? normalized : `${normalized.slice(0, MAX_NAME_LENGTH - 1).trimEnd()}…`;
}

function messageText(message: UserMessage | AssistantMessage): string {
  return contentText(message.content);
}

function limitText(text: string): string {
  return text.length <= PROMPT_MAX_TEXT ? text : `${text.slice(0, PROMPT_MAX_TEXT - 1)}…`;
}

function isUserMessage(message: AgentMessage): message is UserMessage {
  return message.role === "user";
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === "assistant";
}
