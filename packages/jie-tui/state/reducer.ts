import { ActionTypes, type Action } from "./actions";
import type { TuiState } from "./state";
import { reduce as reduceEvent } from "./event-reducer";
import { reduceUiAction } from "./ui-reducer";

const ACTION_LOG_ENABLED = (process.env["ENABLE_TUI_ACTION_LOGGING"] ?? "").length > 0;

export function reduce(state: TuiState, action: Action): TuiState {
  if (action.type !== ActionTypes.RECEIVE_EVENT) {
    const next = reduceUiAction(state, action);
    logAction(action.type, state, next);
    return next;
  }
  const next = reduceEvent(state, action.payload);
  logAction(action.type, state, next);
  return next;
}

function logAction(actionType: string, before: TuiState, after: TuiState): void {
  if (!ACTION_LOG_ENABLED) return;
  const lines: string[] = [];
  if (before.teamId !== after.teamId) lines.push(`teamId:${JSON.stringify(before.teamId)}->${JSON.stringify(after.teamId)}`);
  if (before.agents.size !== after.agents.size) lines.push(`agents:${before.agents.size}->${after.agents.size}`);
  if (before.focusedAgentId !== after.focusedAgentId) lines.push(`focused:${JSON.stringify(before.focusedAgentId)}->${JSON.stringify(after.focusedAgentId)}`);
  if (before.errorBanner !== after.errorBanner) lines.push(`errorBanner:${JSON.stringify(before.errorBanner)}->${JSON.stringify(after.errorBanner)}`);
  if (before.transientMessage !== after.transientMessage) lines.push(`transient:${JSON.stringify(before.transientMessage)}->${JSON.stringify(after.transientMessage)}`);
  if (before.pendingQuit !== after.pendingQuit) lines.push(`pendingQuit:${before.pendingQuit}->${after.pendingQuit}`);
  if (before.editorText !== after.editorText) lines.push(`editorText:${JSON.stringify(before.editorText)}->${JSON.stringify(after.editorText)}`);
  const diff = lines.length > 0 ? ` ${lines.join(" ")}` : "";
  process.stderr.write(`[tui-action] ${actionType}${diff}\n`);
}