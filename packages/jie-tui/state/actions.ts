import type { EventEnvelope, EventType } from "@cuzfrog/jie-platform/event";

export const ActionTypes = {
  RECEIVE_EVENT: "[bus] receive event from event bus",
  TOGGLE_TEAM_RAIL: "[ui] toggle team rail panel",
  SWITCH_CYCLE_AGENT: "[ui] switch and cycle focused agent",
  CLEAR_TUI_STATE: "[ui] clear tui state",
  SET_TRANSIENT_MESSAGE: "[ui] transient message",
  CLEAR_TRANSIENT_MESSAGE: "[ui] transient clear",
  SET_ERROR_MESSAGE: "[ui] set error banner",
  CLEAR_ERROR_MESSAGE: "[ui] error clear",
  CLEAR_BANNERS: "[ui] clear all banners",
  REQUEST_QUIT: "[ui] request quit",
  REQUEST_RENDER: "[ui] request render",
} as const;

type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

interface ActionDef<T extends ActionType, P> {
  readonly type: T,
  readonly payload: P,
}

export type AnyEventEnvelope = {
  [K in EventType]: EventEnvelope<K>;
}[EventType];

const toggleTeamRail = createAction(ActionTypes.TOGGLE_TEAM_RAIL);
const clearTuiState = createAction(ActionTypes.CLEAR_TUI_STATE);
const clearTransientMessage = createAction(ActionTypes.CLEAR_TRANSIENT_MESSAGE);
const clearErrorMessage = createAction(ActionTypes.CLEAR_ERROR_MESSAGE);
const clearBanners = createAction(ActionTypes.CLEAR_BANNERS);

export const Actions = {
  receiveEvent: (event: AnyEventEnvelope) => createAction(ActionTypes.RECEIVE_EVENT, event),
	toggleTeamRail: () => toggleTeamRail,
	switchCycleAgent: (direction: 1 | -1) => createAction(ActionTypes.SWITCH_CYCLE_AGENT, { direction }),
	clearTuiState: () => clearTuiState,
	setTransientMessage: (text: string) => createAction(ActionTypes.SET_TRANSIENT_MESSAGE, { text }),
	clearTransientMessage: () => clearTransientMessage,
	setErrorMessage: (text: string) => createAction(ActionTypes.SET_ERROR_MESSAGE, { text }),
	clearErrorMessage: () => clearErrorMessage,
	clearBanners: () => clearBanners,
	requestQuit: () => createAction(ActionTypes.REQUEST_QUIT),
	requestRender: () => createAction(ActionTypes.REQUEST_RENDER),
} as const;

export type Action = ReturnType<typeof Actions[keyof typeof Actions]>;

function createAction<T extends ActionType>(type: T): ActionDef<T, undefined>;
function createAction<T extends ActionType, P>(type: T, payload: P): ActionDef<T, P>;
function createAction<T extends ActionType, P>(type: T, payload?: P): ActionDef<T, P | undefined> {
  return Object.freeze({ type, payload });
}
