import type { AfterToolCallContext, AfterToolCallResult, AgentToolResult, BeforeToolCallContext, BeforeToolCallResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";
import type { ToolResultDetails } from "../types";

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

  constructor(deps: ToolCallObserverDeps) {
    this.eventManager = deps.eventManager;
    this.hookRunner = deps.hookRunner;
    this.hookIdentity = deps.hookIdentity;
    this.sender = deps.sender;
  }

  async beforeToolCall(context: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> {
    const toolCallId = context.toolCall.id;
    this.toolTimestamps.set(toolCallId, Date.now());
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
