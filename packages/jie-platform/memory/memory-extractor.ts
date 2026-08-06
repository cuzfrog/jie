import { convertToLlm, serializeConversation, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { logger } from "@cuzfrog/jie-utils";
import type { ModelRegistry, SettingsStore } from "../config";
import type { LlmService } from "../llm";
import type { MemoryAtomType, MemoryStore, NewMemoryAtom } from "./memory-store";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

export interface ExtractionInput {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly teamId: string;
  readonly sessionId: string;
  readonly model: Model<Api>;
  readonly signal?: AbortSignal;
}

export interface MemoryExtractor {
  extract(input: ExtractionInput): Promise<void>;
}

interface MemoryExtractorDeps {
  readonly llmService: LlmService;
  readonly memoryStore: MemoryStore;
  readonly modelRegistry: ModelRegistry;
  readonly settingsStore: SettingsStore;
}

export class MemoryExtractorImpl implements MemoryExtractor {
  private readonly llmService: LlmService;
  private readonly memoryStore: MemoryStore;
  private readonly modelRegistry: ModelRegistry;
  private readonly settingsStore: SettingsStore;

  constructor(deps: MemoryExtractorDeps) {
    this.llmService = deps.llmService;
    this.memoryStore = deps.memoryStore;
    this.modelRegistry = deps.modelRegistry;
    this.settingsStore = deps.settingsStore;
  }

  async extract(input: ExtractionInput): Promise<void> {
    try {
      await this.run(input);
    } catch (error) {
      if (input.signal?.aborted) return;
      log.warn(`memory extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async run(input: ExtractionInput): Promise<void> {
    const settings = this.settingsStore.load();
    if (settings.memory?.enabled === false) return;
    const model = resolveMemoryModel(settings.memory?.model, input.model, this.modelRegistry);
    const systemPrompt = (settings.language ?? "en") === "zh" ? EXTRACTION_SYSTEM_PROMPT_ZH : EXTRACTION_SYSTEM_PROMPT_EN;
    const text = await this.llmService.complete({
      model,
      systemPrompt,
      prompt: buildExtractionPrompt(input.messages),
      signal: input.signal,
    });
    const atoms = parseExtraction(text);
    if (atoms === null) {
      log.warn("memory extraction returned unparseable JSON; batch dropped");
      return;
    }
    if (atoms.length === 0) return;
    this.memoryStore.add(atoms, input.teamId, input.sessionId);
  }
}

function buildExtractionPrompt(messages: ReadonlyArray<AgentMessage>): string {
  return `<conversation>\n${serializeConversation(convertToLlm([...messages]))}\n</conversation>`;
}

function resolveMemoryModel(
  memoryModel: string | undefined,
  agentModel: Model<Api>,
  modelRegistry: ModelRegistry,
): Model<Api> {
  if (memoryModel === undefined) return agentModel;
  const separator = memoryModel.indexOf("/");
  if (separator === -1) {
    log.warn(`invalid memory model '${memoryModel}'; falling back to the agent model`);
    return agentModel;
  }
  const provider = memoryModel.slice(0, separator);
  const modelId = memoryModel.slice(separator + 1);
  const resolved = modelRegistry.resolve(provider, modelId);
  if (resolved === undefined) {
    log.warn(`memory model '${memoryModel}' not found; falling back to the agent model`);
    return agentModel;
  }
  return resolved;
}

function parseExtraction(text: string): ReadonlyArray<NewMemoryAtom> | null {
  const cleaned = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const atoms: NewMemoryAtom[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const scene = item["scene"];
    if (typeof scene !== "string" || scene === "") continue;
    const rawMemories = item["memories"];
    if (!Array.isArray(rawMemories)) continue;
    for (const entry of rawMemories) {
      const atom = parseAtom(entry, scene);
      if (atom !== null) atoms.push(atom);
    }
  }
  return atoms;
}

function parseAtom(entry: unknown, scene: string): NewMemoryAtom | null {
  if (!isRecord(entry)) return null;
  const content = entry["content"];
  if (typeof content !== "string" || content === "") return null;
  const type = entry["type"];
  if (!isMemoryAtomType(type)) return null;
  return { content, type, priority: parsePriority(entry["priority"]), scene };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMemoryAtomType(value: unknown): value is MemoryAtomType {
  return value === "fact" || value === "decision" || value === "method" || value === "instruction";
}

function parsePriority(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 50;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return fenced === null ? trimmed : fenced[1]!.trim();
}

const EXTRACTION_SYSTEM_PROMPT_EN = `You are a memory extraction specialist. Distill the conversation into long-term memory atoms grouped by scene.

Output language: write scene names and atom content in the language the conversation is written in. The JSON structure and enum values stay in English.

### Task 1: Scene segmentation
Group the conversation into scenes. A scene is one activity or topic thread. Start a new scene when the topic, task, or goal changes. Name each scene with one concise line describing the activity.

### Task 2: Memory extraction
Extract memory atoms from the conversation only. An atom must be a self-contained statement that stays true outside this conversation. Rules:
- Self-contained: no pronouns or references that need the conversation to be understood (no "this", "that", "as mentioned above").
- Unconfirmed: phrase proposals, risks, and suggestions that were not confirmed as facts.
- Not tracked elsewhere: skip task progress and work products that a kanban board or an artifact store already track.
- Filter trivia: skip greetings, small talk, one-off tool requests, and repeated content.
- Merge: combine closely related facts into one atom; do not fragment.
- Standing rules: only extract an instruction when the user gave an explicit standing rule for the AI's behavior.

### Atom types (use exactly one per atom)
- fact: established project or domain knowledge.
- decision: a choice and its rationale.
- method: a working approach that proved out.
- instruction: a standing rule the user gave the AI; always priority 100.

Priority: a number from 0 to 100 reflecting how important the atom is for future work. instruction is always 100.

### Output format
Return only a valid JSON array of scenes, and nothing else:
[
  {
    "scene": "one-line activity context",
    "memories": [
      { "content": "self-contained statement", "type": "fact|decision|method|instruction", "priority": 80 }
    ]
  }
]
If nothing is worth extracting, still output the scene list with empty memories arrays. Do not wrap the JSON in markdown code fences and do not add any text outside the JSON.`;

const EXTRACTION_SYSTEM_PROMPT_ZH = `你是一名记忆提取专家。将对话蒸馏为按情境（scene）分组的长程记忆原子。

输出语言：情境名称与记忆内容使用与对话相同的语言书写；JSON 结构与枚举值保持英文。

### 任务一：情境切分
将对话按情境分组。一个情境指一个活动或话题线程；当话题、任务或目标变化时开启新情境。每个情境用一个简洁的句子命名其活动内容。

### 任务二：记忆提取
只从对话中提取记忆原子。每个原子必须是一条脱离当前对话依然成立、自包含的陈述。规则：
- 自包含：不使用需要依赖对话上下文才能理解的代词或指代（如"这个"、"上面说的"）。
- 未确认：未经确认的建议、风险、意见应表述为"正在讨论"或"待确认"，而不是事实。
- 不在其他系统跟踪：跳过看板或工件存储已跟踪的任务进度与交付物。
- 过滤琐碎：跳过寒暄、闲聊、一次性工具请求与重复内容。
- 归纳合并：强相关的信息合并为一条记忆，不要碎片化。
- 指令：只有当用户给 AI 提出明确的长期行为规则时才提取 instruction。

### 原子类型（每条记忆只能选一个）
- fact：已确立的项目或领域知识。
- decision：一个选择及其理由。
- method：被验证有效的工作方法。
- instruction：用户给 AI 提出的长期行为规则；优先级恒为 100。

优先级：0 到 100 的数字，反映该记忆对后续工作的价值。instruction 恒为 100。

### 输出格式
只返回一个合法的 JSON 数组，不要输出其他任何内容：
[
  {
    "scene": "一行活动背景",
    "memories": [
      { "content": "自包含的陈述", "type": "fact|decision|method|instruction", "priority": 80 }
    ]
  }
]
如果没有任何值得提取的内容，也要输出情境列表，memories 为空数组。不要把 JSON 放在 markdown 代码块中，也不要在 JSON 之外添加任何文字。`;
