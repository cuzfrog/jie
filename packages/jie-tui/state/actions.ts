import type { EventEnvelope, EventType } from "@cuzfrog/jie-platform/event";

export const ActionTypes = {
  DUMMY: "[sys] dummy",
  RECEIVE_EVENT: "[sys] reveive event from event bus",
  TOGGLE_TEAM_RAIL: "[ui] toggle team rail panel",
  SWITCH_CYCLE_AGENT: "[ui] switch and cycle focused agent",
  TOGGLE_THINKING_BLOCK: "[ui] toggle thinking blocks",
  TOGGLE_TOOL_CALL_BLOCK: "[ui] toggle tool cards",
  CLEAR_TUI_STATE: "[ui] clear tui state",
  SET_TRANSIENT_MESSAGE: "[ui] transient message",
  CLEAR_TRANSIENT_MESSAGE: "[ui] transient clear",
  SET_ERROR_MESSAGE: "[ui] set error banner",
  CLEAR_ERROR_MESSAGE: "[ui] error clear",
  // add more here
} as const;

type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

interface ActionDef<T extends ActionType, P> {
  readonly type: T,
  readonly payload: P,
}

export type AnyEventEnvelope = {
  [K in EventType]: EventEnvelope<K>;
}[EventType];

const dummy = createAction(ActionTypes.DUMMY); 
const toggleTeamRail = createAction(ActionTypes.TOGGLE_TEAM_RAIL);
const toggleThinkingBlock = createAction(ActionTypes.TOGGLE_THINKING_BLOCK);
const toggleToolCallBlock = createAction(ActionTypes.TOGGLE_TOOL_CALL_BLOCK);
const clearTuiState = createAction(ActionTypes.CLEAR_TUI_STATE);
const clearTransientMessage = createAction(ActionTypes.CLEAR_TRANSIENT_MESSAGE);
const clearErrorMessage = createAction(ActionTypes.CLEAR_ERROR_MESSAGE);

export const Actions = {
  dummy: () => dummy,
  receiveEvent: (event: AnyEventEnvelope) => createAction(ActionTypes.RECEIVE_EVENT, event),
	toggleTeamRail: () => toggleTeamRail,
	switchCycleAgent: (direction: 1 | -1) => createAction(ActionTypes.SWITCH_CYCLE_AGENT, { direction }),
	toggleThinkingBlock: () => toggleThinkingBlock,
	toggleToolCallBlock: () => toggleToolCallBlock,
	clearTuiState: () => clearTuiState,
	setTransientMessage: (text: string, shownAt: number) => createAction(ActionTypes.SET_TRANSIENT_MESSAGE, { text, shownAt }),
	clearTransientMessage: () => clearTransientMessage,
	setErrorMessage: (text: string, shownAt: number) => createAction(ActionTypes.SET_ERROR_MESSAGE, { text, shownAt }),
	clearErrorMessage: () => clearErrorMessage,
	// add more here
} as const;

function createAction<T extends ActionType>(type: T): ActionDef<T, undefined>;
function createAction<T extends ActionType, P>(type: T, payload: P): ActionDef<T, P>;
function createAction<T extends ActionType, P>(type: T, payload?: P): ActionDef<T, P | undefined> {
  return Object.freeze({ type, payload });
}

export type Action = ReturnType<typeof Actions[keyof typeof Actions]>;
