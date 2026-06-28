import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { TuiState } from "./state";
import { reducePromptLegacy, reduceSystemTeams, reduceTeamLoadedLegacy } from "./team";
import { reduceIdle, reduceTurnStart } from "./turn";
import { reduceStreamChunk, reduceStreamEnd } from "./stream";
import { reduceToolCall, reduceToolResult } from "./tool";
import { reduceQueueUpdate } from "./queue";
import {
  reduceAgentCycle,
  reduceClear,
  reduceRailToggle,
  reduceThinkingToggle,
  reduceToolToggle,
  reduceUiError,
  reduceUiErrorClear,
  reduceUiTransient,
  reduceUiTransientClear,
} from "./ui";

export const SEEN_TOPICS: ReadonlySet<string> = new Set<string>([
  "ui.rail.toggle",
  "ui.agent.cycle",
  "ui.thinking.toggle",
  "ui.tool.toggle",
  "ui.clear",
  "ui.transient",
  "ui.transient.clear",
  "ui.error",
  "ui.error.clear",
  "system.teams",
  "agent.turn.start",
  "agent.idle",
  "agent.stream.chunk",
  "agent.stream.end",
  "agent.tool.call",
  "agent.tool.result",
  "agent.queue.update",
]);

export function reduce(state: TuiState, env: EventEnvelope): TuiState {
  const legacyTeamLoaded = reduceTeamLoadedLegacy(state, env);
  if (legacyTeamLoaded !== state) return legacyTeamLoaded;
  const legacyPrompt = reducePromptLegacy(state, env);
  if (legacyPrompt !== state) return legacyPrompt;
  if (!SEEN_TOPICS.has(env.topic)) return state;
  switch (env.topic) {
    case "system.teams":
      return reduceSystemTeams(state, env);
    case "ui.rail.toggle":
      return reduceRailToggle(state);
    case "ui.agent.cycle":
      return reduceAgentCycle(state, env);
    case "ui.thinking.toggle":
      return reduceThinkingToggle(state);
    case "ui.tool.toggle":
      return reduceToolToggle(state);
    case "ui.clear":
      return reduceClear(state);
    case "ui.transient":
      return reduceUiTransient(state, env);
    case "ui.transient.clear":
      return reduceUiTransientClear(state);
    case "ui.error":
      return reduceUiError(state, env);
    case "ui.error.clear":
      return reduceUiErrorClear(state);
    case "agent.turn.start":
      return reduceTurnStart(state, env);
    case "agent.idle":
      return reduceIdle(state, env);
    case "agent.stream.chunk":
      return reduceStreamChunk(state, env);
    case "agent.stream.end":
      return reduceStreamEnd(state);
    case "agent.tool.call":
      return reduceToolCall(state, env);
    case "agent.tool.result":
      return reduceToolResult(state, env);
    case "agent.queue.update":
      return reduceQueueUpdate(state, env);
    default:
      return state;
  }
}