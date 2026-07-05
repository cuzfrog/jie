const MOCK_TOOL_CALL_ID_PREFIX = "mock_tool_";
const MOCK_COMPLETION_ID_PREFIX = "mockcmpl_";

export interface ChatCompletionRequestBody {
  readonly model: string;
  readonly stream: boolean;
  readonly messages: ReadonlyArray<{
    readonly role: "system" | "user" | "assistant" | "tool" | "developer";
    readonly content: string | ReadonlyArray<{ type: string; text?: string }>;
  }>;
  readonly tools?: ReadonlyArray<{
    readonly type: "function";
    readonly function: { readonly name: string };
  }>;
}

export interface MatchRule {
  readonly lastUserContains?: string;
  readonly anyUserContains?: string;
  readonly anySystemContains?: string;
  readonly toolName?: string;
  readonly model?: string;
  readonly minAssistantMessages?: number;
}

export type ResponseChunk =
  | { readonly kind: "text"; readonly delta: string }
  | {
      readonly kind: "tool_call";
      readonly id: string;
      readonly name: string;
      readonly argumentsChunks: ReadonlyArray<string>;
    }
  | { readonly kind: "finish"; readonly reason: "stop" | "length" | "tool_calls" };

export interface Expectation {
  readonly match: MatchRule;
  readonly responseChunks: ReadonlyArray<ResponseChunk>;
}

export interface RecordedCall {
  readonly expectationIndex: number;
  readonly model: string;
  readonly lastUserText: string;
}

export function lastUserText(req: ChatCompletionRequestBody): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i];
    if (m === undefined || m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    for (let j = m.content.length - 1; j >= 0; j--) {
      const part = m.content[j];
      if (part !== undefined && part.type === "text" && typeof part.text === "string") {
        return part.text;
      }
    }
    return "";
  }
  return "";
}

function toolNames(req: ChatCompletionRequestBody): ReadonlySet<string> {
  const names = new Set<string>();
  for (const t of req.tools ?? []) names.add(t.function.name);
  return names;
}

function ruleMatches(rule: MatchRule, req: ChatCompletionRequestBody): boolean {
  if (rule.model !== undefined && rule.model !== req.model) return false;
  if (rule.toolName !== undefined && !toolNames(req).has(rule.toolName)) return false;
  if (rule.minAssistantMessages !== undefined && rule.minAssistantMessages > 0) {
    let count = 0;
    for (const m of req.messages) if (m.role === "assistant") count++;
    if (count < rule.minAssistantMessages) return false;
  }
  if (rule.lastUserContains !== undefined) {
    if (!lastUserText(req).includes(rule.lastUserContains)) return false;
  }
  if (rule.anyUserContains !== undefined) {
    let hit = false;
    for (const m of req.messages) {
      if (m.role !== "user") continue;
      if (typeof m.content === "string") {
        if (m.content.includes(rule.anyUserContains)) { hit = true; break; }
      } else {
        for (const part of m.content) {
          if (part.type === "text" && typeof part.text === "string" && part.text.includes(rule.anyUserContains)) {
            hit = true; break;
          }
        }
        if (hit) break;
      }
    }
    if (!hit) return false;
  }
  if (rule.anySystemContains !== undefined) {
    let hit = false;
    for (const m of req.messages) {
      if (m.role !== "system") continue;
      const text = typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("");
      if (text.includes(rule.anySystemContains)) { hit = true; break; }
    }
    if (!hit) return false;
  }
  return true;
}

export function selectExpectation(
  rules: ReadonlyArray<Expectation>,
  req: ChatCompletionRequestBody,
): { readonly index: number; readonly expectation: Expectation } | undefined {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule === undefined) continue;
    if (ruleMatches(rule.match, req)) {
      return { index: i, expectation: rule };
    }
  }
  return undefined;
}

function renderChunk(chunk: ResponseChunk, completionId: string, model: string, created: number): string {
  const base = {
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {} as Record<string, unknown>,
        finish_reason: null as string | null,
      },
    ],
  };

  if (chunk.kind === "text") {
    base.choices[0]!.delta = { role: "assistant", content: chunk.delta };
    return `data: ${JSON.stringify(base)}`;
  }

  if (chunk.kind === "tool_call") {
    const out: unknown[] = [];
    out.push({
      ...base,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              { index: 0, id: chunk.id, type: "function", function: { name: chunk.name } },
            ],
          },
          finish_reason: null,
        },
      ],
    });
    for (const piece of chunk.argumentsChunks) {
      out.push({
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: piece === "" ? {} : { arguments: piece },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      });
    }
    return out.map((c) => `data: ${JSON.stringify(c)}`).join("\n\n");
  }

  const finishBase: Record<string, unknown> = {
    ...base,
    choices: [
      { index: 0, delta: {}, finish_reason: chunk.reason },
    ],
  };
  return `data: ${JSON.stringify(finishBase)}`;
}

export function renderSseStream(expectation: Expectation, req: ChatCompletionRequestBody): Uint8Array {
  const completionId = `${MOCK_COMPLETION_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
  const created = Math.floor(Date.now() / 1000);
  const lines: string[] = [];

  lines.push(
    `data: ${JSON.stringify({
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model: req.model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    })}`,
  );

  for (const chunk of expectation.responseChunks) {
    lines.push(renderChunk(chunk, completionId, req.model, created));
  }

  lines.push("data: [DONE]");

  const body = `${lines.join("\n\n")}\n\n`;
  return new TextEncoder().encode(body);
}

export function defaultToolCallId(): string {
  return `${MOCK_TOOL_CALL_ID_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
}
