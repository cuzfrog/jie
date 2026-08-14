import { Type } from "typebox";
import { EVENT_TEXT_TRUNCATION_BYTES, Events, type AgentSender, type EventManager } from "../event";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";

const NOTIFY_DESCRIPTION = `Publish a message to the team event bus on \`{team_id}.{topic}\`. Subscribed
agents receive it as \`[{source_agent_key} on '{topic}']: {prompt}\`. Topics must
not start with \`agent.\`, \`inbox.\`, or the team id. \`notify\` is the sole means of
inter-agent communication. Does NOT end the turn.`;

export interface NotifyDeps {
  eventManager: EventManager;
}

interface NotifyInput {
  topic: string;
  prompt: string;
}

export function createNotifyTool(dependencies: NotifyDeps): Tool<NotifyInput> {
  return {
    name: "notify",
    description: NOTIFY_DESCRIPTION,
    label: "Notify",
    parameters: Type.Object({
      topic: Type.String(),
      prompt: Type.String(),
    }),
    async execute(
      input: NotifyInput,
      executionContext: ExecutionContext,
    ): Promise<ToolResult> {
      const reason = validateTopic(input.topic, executionContext.teamId, executionContext.agentKey);
      if (reason !== null) {
        throw new JiePlatformError("NOTIFY_INVALID_TOPIC", { detail: reason });
      }

      const isCallback = input.topic.startsWith("callback.");
      if (!isCallback) {
        const allowed = executionContext.toolArgs.get("notify");
        if (allowed !== undefined && !allowed.includes(input.topic)) {
          throw new JiePlatformError("TOPIC_NOT_ALLOWED", {
            detail: `topic '${input.topic}' is not allowed for role '${executionContext.agentRole}'`,
          });
        }
      }

      if (input.prompt.length > EVENT_TEXT_TRUNCATION_BYTES) {
        throw new JiePlatformError("NOTIFY_PROMPT_TOO_LONG", {
          detail: `prompt length ${input.prompt.length} exceeds max ${EVENT_TEXT_TRUNCATION_BYTES}`,
        });
      }

      const clientTopic = `${executionContext.teamId}.${input.topic}`;
      const sender: AgentSender = { kind: "agent", teamId: executionContext.teamId, agentKey: executionContext.agentKey };
      const envelope = Events.custom(sender, clientTopic, input.prompt);
      dependencies.eventManager.publish(envelope);

      return {
        content: `Notification published on '${input.topic}'`,
        details: { topic: input.topic },
      };
    },
  };
}

type TopicValidationReason =
  | "empty"
  | "starts_with_agent_prefix"
  | "starts_with_team_prefix"
  | "starts_with_inbox_prefix"
  | "own_callback"
  | "contains_null_byte";

function validateTopic(
  topic: string,
  teamId: string,
  agentKey: string,
): TopicValidationReason | null {
  if (topic === "") return "empty";
  if (topic.startsWith("agent.")) return "starts_with_agent_prefix";
  if (topic.startsWith(`${teamId}.`)) return "starts_with_team_prefix";
  if (topic.startsWith("inbox.")) return "starts_with_inbox_prefix";
  if (topic === `callback.${agentKey}`) return "own_callback";
  for (let i = 0; i < topic.length; i += 1) {
    const code = topic.charCodeAt(i);
    if (code === 0 || (code < 0x20 && code !== 0x09)) {
      return "contains_null_byte";
    }
  }
  return null;
}
