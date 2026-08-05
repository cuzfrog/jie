import { Type } from "typebox";
import { EVENT_TEXT_TRUNCATION_BYTES, Events, type AgentSender, type EventManager } from "../event";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import type { TaskLifecycleGuard, TaskTransitionOutcome } from "./task-lifecycle";
import { JiePlatformError } from "../jie-platform-errors";

const NOTIFY_DESCRIPTION = `notify({ topic, prompt, task_id? }): Publish a message to the team-scoped event
bus on \`{team_id}.{topic}\`. The receiving agent (any agent whose \`subscribe:\`
field lists this topic) will see the message as a synthetic user-style entry:
\`[{source_agent_key} on '{topic}']: {prompt}\`. Topic names must not start
with \`agent.\` (platform events; observer-only) or with \`{team_id}.\` (the
platform manages the prefix); empty topics and control characters are
rejected. \`task_id\` is REQUIRED when the team declares a lifecycle and this
topic is one of its transitions: the platform records the phase transition
before publishing and rejects missing or invalid ids and transitions the
lifecycle table does not allow; on other topics it must be omitted.
\`notify\` is the SOLE means of inter-agent communication. Does NOT end the
turn.`;

export interface NotifyDeps {
  eventManager: EventManager;
  taskLifecycleGuard: TaskLifecycleGuard;
}

const TASK_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

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
  task_id?: string;
}

export function createNotifyTool(dependencies: NotifyDeps): Tool<NotifyInput> {
  return {
    name: "notify",
    description: NOTIFY_DESCRIPTION,
    label: "Notify",
    parameters: Type.Object({
      topic: Type.String(),
      prompt: Type.String(),
      task_id: Type.Optional(Type.String()),
    }),
    async execute(
      input: NotifyInput,
      executionContext: ExecutionContext,
    ): Promise<ToolResult> {
      const reason = validateTopic(input.topic, executionContext.teamId);
      if (reason !== null) {
        throw new JiePlatformError("NOTIFY_INVALID_TOPIC", { detail: reason });
      }

      if (input.prompt.length > EVENT_TEXT_TRUNCATION_BYTES) {
        throw new JiePlatformError("NOTIFY_PROMPT_TOO_LONG", {
          detail: `prompt length ${input.prompt.length} exceeds max ${EVENT_TEXT_TRUNCATION_BYTES}`,
        });
      }

      const lifecycle = executionContext.lifecycle;
      const taskId = input.task_id === "" ? undefined : input.task_id;
      const isLifecycleTopic = lifecycle !== null && lifecycle.transitions.some((rule) => rule.topic === input.topic);
      let transition: TaskTransitionOutcome | null = null;
      if (lifecycle !== null && isLifecycleTopic) {
        if (taskId === undefined) {
          throw new JiePlatformError("MISSING_REQUIRED_FIELD", {
            detail: `task_id is required for lifecycle topic '${input.topic}'`,
          });
        }
        if (!TASK_ID_PATTERN.test(taskId)) {
          throw new JiePlatformError("INVALID_TASK_ID", { detail: taskId });
        }
        transition = await dependencies.taskLifecycleGuard.applyTransition({
          lifecycle,
          taskId,
          topic: input.topic,
          agentRole: executionContext.agentRole,
        });
      } else if (taskId !== undefined) {
        throw new JiePlatformError("INVALID_TASK_ID", {
          detail: `task_id is not accepted on non-lifecycle topic '${input.topic}'`,
        });
      }

      const clientTopic = `${executionContext.teamId}.${input.topic}`;
      const sender: AgentSender = { kind: "agent", teamId: executionContext.teamId, agentKey: executionContext.agentKey };
      const envelope = Events.custom(sender, clientTopic, input.prompt);
      dependencies.eventManager.publish(envelope);

      if (transition !== null) {
        const ack = `(task '${taskId}' moved to phase '${transition.phase}', iteration ${transition.iteration})`;
        return {
          content: `Notification published on '${input.topic}' ${ack}`,
          details: { topic: input.topic, task_id: taskId, phase: transition.phase, iteration: transition.iteration },
        };
      }
      return {
        content: `Notification published on '${input.topic}'`,
        details: { topic: input.topic },
      };
    },
  };
}
