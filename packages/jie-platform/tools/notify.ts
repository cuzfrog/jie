import { Type } from "typebox";
import { EVENT_TEXT_TRUNCATION_BYTES, Events, type EventManager, type Sender } from "../event";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import { JiePlatformError } from "../domain-types";

const NOTIFY_DESCRIPTION = `notify({ topic, prompt }): Publish a message to the team-scoped event bus on
\`{team_id}.{topic}\`. The receiving agent (any agent whose \`subscribe:\` field
lists this topic, or the agent addressed by \`topic\` if it is an agent_key)
will see the message as a synthetic user-style entry: \`[{source_agent_key}
on '{topic}']: {prompt}\`. Topic names must not start with \`agent.\`
(platform events; observer-only) or with \`{team_id}.\` (the platform manages
the prefix); empty topics and control characters are rejected. \`notify\` is
the SOLE means of inter-agent communication. Does NOT end the turn.`;

export interface NotifyDeps {
  eventManager: EventManager;
}

type TopicValidationReason =
  | "empty"
  | "starts_with_agent_prefix"
  | "starts_with_team_prefix"
  | "contains_null_byte";

function validateTopic(
  topic: string,
  teamId: string,
): TopicValidationReason | null {
  if (topic === "") return "empty";
  if (topic.startsWith("agent.")) return "starts_with_agent_prefix";
  if (topic.startsWith(`${teamId}.`)) return "starts_with_team_prefix";
  for (let i = 0; i < topic.length; i += 1) {
    const code = topic.charCodeAt(i);
    if (code === 0 || (code < 0x20 && code !== 0x09)) {
      return "contains_null_byte";
    }
  }
  return null;
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
      const reason = validateTopic(input.topic, executionContext.teamId);
      if (reason !== null) {
        throw new JiePlatformError(
          "notify_invalid_topic",
          `notify_invalid_topic: ${reason}`,
        );
      }

      if (input.prompt.length > EVENT_TEXT_TRUNCATION_BYTES) {
        throw new JiePlatformError(
          "notify_prompt_too_long",
          `notify_prompt_too_long: prompt length ${input.prompt.length} exceeds max ${EVENT_TEXT_TRUNCATION_BYTES}`,
        );
      }

      const clientTopic = `${executionContext.teamId}.${input.topic}`;
      const sender: Sender = {
        kind: "agent",
        identity: { teamId: executionContext.teamId, agentRole: executionContext.agentRole, agentKey: executionContext.agentKey },
      };
      const envelope = Events.custom(sender, clientTopic, input.prompt);
      dependencies.eventManager.publish(envelope);

      return {
        content: `Notification published on '${input.topic}'`,
        details: { topic: input.topic },
      };
    },
  };
}
