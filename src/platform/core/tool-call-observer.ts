import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentToolResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";
import type { ToolResultDetails } from "../tools";

export interface ToolCallObserver {
  beforeToolCall(context: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined>;
  afterToolCall(context: AfterToolCallContext): Promise<AfterToolCallResult | undefined>;
}

interface ToolCallObserverDeps {
  readonly eventManager: EventManager;
  readonly hookRunner: HookRunner;
  readonly hookIdentity: HookIdentity;
  readonly sender: AgentSender;
}

export class ToolCallObserverImpl implements ToolCallObserver {
  private readonly eventManager: EventManager;
  private readonly hookRunner: HookRunner;
  private readonly hookIdentity: HookIdentity;
  private readonly sender: AgentSender;
  private readonly toolTimestamps = new Map<string, number>();
  private guardEpoch = 0;
  private guardLastKey: string | null = null;
  private guardRepeatCount = 0;
  private guardBlocks = 0;

  constructor(deps: ToolCallObserverDeps) {
    this.eventManager = deps.eventManager;
    this.hookRunner = deps.hookRunner;
    this.hookIdentity = deps.hookIdentity;
    this.sender = deps.sender;
  }

  async beforeToolCall(context: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> {
    const toolCallId = context.toolCall.id;
    const startedAt = Date.now();
    this.toolTimestamps.set(toolCallId, startedAt);
    this.eventManager.publish(Events.agentToolCall(
      this.sender,
      toolCallId,
      context.toolCall.name,
      JSON.stringify(context.args),
    ));
    const guard = this.evaluateLoopGuard(context);
    if (guard !== null) return this.blockToolCall(toolCallId, context.toolCall.name, startedAt, guard.reason, guard.terminate);
    const preOutcome = await this.hookRunner.preToolUse({
      identity: this.hookIdentity,
      toolName: context.toolCall.name,
      toolInput: context.args,
    });
    if (preOutcome.block) {
      this.toolTimestamps.delete(toolCallId);
      return { block: true, reason: preOutcome.reason ?? "blocked by PreToolUse hook" };
    }
    return undefined;
  }

  async afterToolCall(context: AfterToolCallContext): Promise<AfterToolCallResult | undefined> {
    const toolCallId = context.toolCall.id;
    const startedAt = this.toolTimestamps.get(toolCallId) ?? Date.now();
    this.toolTimestamps.delete(toolCallId);
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
  }

  private evaluateLoopGuard(context: BeforeToolCallContext): { reason: string; terminate?: true } | null {
    const epoch = this.currentEpoch(context.context.messages);
    if (epoch !== this.guardEpoch) {
      this.guardEpoch = epoch;
      this.guardLastKey = null;
      this.guardRepeatCount = 0;
      this.guardBlocks = 0;
    }
    const args = context.args;
    if (!isJson(args)) return null;
    const key = makeLoopGuardKey(context.toolCall.name, args);
    if (key !== this.guardLastKey) {
      this.guardLastKey = key;
      this.guardRepeatCount = 1;
      this.guardBlocks = 0;
    } else {
      this.guardRepeatCount += 1;
    }
    if (this.guardRepeatCount < LOOP_GUARD_THRESHOLD) return null;
    this.guardBlocks += 1;
    if (this.guardBlocks < LOOP_GUARD_MAX_BLOCKS) {
      return { reason: loopGuardMessage(context.toolCall.name, this.guardRepeatCount) };
    }
    const reason = loopGuardAbortMessage(context.toolCall.name, this.guardRepeatCount);
    this.eventManager.publish(Events.systemError({ kind: "system" }, reason));
    this.eventManager.publish(Events.agentInterrupt(this.sender, this.sender.teamId, this.sender.agentKey));
    return { reason, terminate: true };
  }

  private currentEpoch(messages: ReadonlyArray<{ role: string; timestamp?: number }>): number {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message !== undefined && message.role === "user" && typeof message.timestamp === "number") return message.timestamp;
    }
    return 0;
  }

  private blockToolCall(toolCallId: string, toolName: string, startedAt: number, reason: string, terminate?: true): BeforeToolCallResult {
    this.eventManager.publish(Events.agentToolResult(
      this.sender,
      toolCallId,
      toolName,
      null,
      Date.now() - startedAt,
      reason,
      null,
    ));
    this.toolTimestamps.delete(toolCallId);
    return terminate === true ? { block: true, reason, terminate: true } : { block: true, reason };
  }
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

interface JieToolResult {
  content: string | Array<{ type: string; text?: string }>;
  details?: ToolResultDetails | null;
  terminate?: boolean;
}

function jieToolResultOf(piResult: AgentToolResult<ToolResultDetails | null | undefined>): JieToolResult {
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

const LOOP_GUARD_THRESHOLD = 4;
const LOOP_GUARD_MAX_BLOCKS = 2;

type JsonObject = { readonly [key: string]: Json };
type Json = string | number | boolean | null | Json[] | JsonObject;

function isJson(value: unknown): value is Json {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (isJsonArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (!isJson(value[i])) return false;
    }
    return true;
  }
  if (isJsonObject(value)) {
    const keys = Object.keys(value);
    for (const key of keys) {
      if (!isJson(value[key])) return false;
    }
    return true;
  }
  return false;
}

function isJsonArray(value: unknown): value is Json[] {
  return Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  if (value === null) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function canonicalJson(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isJsonArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isJsonObject(value)) {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return "";
}

function makeLoopGuardKey(toolName: string, args: Json): string {
  return `${toolName}\0${canonicalJson(args)}`;
}

function loopGuardMessage(toolName: string, repeatCount: number): string {
  return `tool call "${toolName}" with the same arguments has already been issued ${repeatCount} times` +
    " consecutively in this turn; do not repeat it; take a different action or state that you are stuck";
}

function loopGuardAbortMessage(toolName: string, repeatCount: number): string {
  return `agent aborted: repeated identical "${toolName}" tool call with the same arguments` +
    ` ${repeatCount} times after correction`;
}
