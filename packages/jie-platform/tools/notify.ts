import { Type } from "typebox";
import type { EventManager, Sender } from "../core/index.ts";
import type { ExecutionContext, Tool, ToolResult } from "./types.ts";
import { JiePlatformError } from "../domain-types.ts";

const NOTIFY_DESCRIPTION = `notify({ topic, prompt }): Publish a message to the team-scoped event bus on
\`{team_id}.{topic}\`. The receiving agent (any agent whose \`subscribe:\` field
lists this topic, or the agent addressed by \`topic\` if it is an agent_key)
will see the message as a synthetic user-style entry: \`[{source_agent_key}
on '{topic}']: {prompt}\`. Self-receipt is filtered: notifying your own
agent_key produces 0 actual recipients. Returns the number of OTHER
recipients (after self-receipt filtering); \`0\` means no peer is listening
on the topic — reconsider the topic name, fall back to a different path,
or surface the issue to the user. Topic names must not start with \`agent.\`
(platform events; observer-only) or with \`{team_id}.\` (the platform manages
the prefix); empty topics and control characters are rejected. \`notify\` is
the SOLE means of inter-agent communication. Does NOT end the turn.`;

export interface NotifyDeps {
  events: EventManager;
  isSelfSubscribed: (topic: string) => boolean;
}

type TopicValidationReason =
  | "empty"
  | "starts_with_agent_prefix"
  | "starts_with_team_prefix"
  | "contains_null_byte";

function validateTopic(
  topic: string,
  team_id: string,
): TopicValidationReason | null {
  if (topic === "") return "empty";
  if (topic.startsWith("agent.")) return "starts_with_agent_prefix";
  if (topic.startsWith(`${team_id}.`)) return "starts_with_team_prefix";
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

export function createNotifyTool(deps: NotifyDeps): Tool<NotifyInput> {
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
      ctx: ExecutionContext,
    ): Promise<ToolResult> {
      const reason = validateTopic(input.topic, ctx.teamId);
      if (reason !== null) {
        throw new JiePlatformError(
          "notify_invalid_topic",
          `notify_invalid_topic: ${reason}`,
        );
      }

      const subject = `${ctx.teamId}.${input.topic}`;
      const totalSubscribers = deps.events.subscriberCount(subject);
      const recipients = deps.isSelfSubscribed(input.topic)
        ? Math.max(0, totalSubscribers - 1)
        : totalSubscribers;

      const sender: Sender = {
        kind: "agent",
        identity: { teamId: ctx.teamId, agentRole: ctx.agentRole, agentKey: ctx.agentKey },
      };
      deps.events.publish(subject, { prompt: input.prompt, source: ctx.agentKey }, sender);

      const content =
        recipients > 0
          ? `Notification delivered to ${recipients} recipients`
          : `Notification delivered to 0 recipients — no agent is subscribed to '${input.topic}'`;

      return {
        content,
        details: { topic: input.topic, recipients },
      };
    },
  };
}