import type { AnyEventEnvelope, TeamInfo } from "@cuzfrog/jie-platform";

export const ActionTypes = {
  RECEIVE_EVENT: "[bus] receive event from event bus",
  SWITCH_TEAM: "[ui] switch team",
  TOGGLE_THINKING: "[ui] toggle thinking expanded",
  TOGGLE_TOOL_CARDS: "[ui] toggle tool cards expanded",
  SWITCH_CYCLE_AGENT: "[ui] switch and cycle focused agent",
  CLEAR_TUI_STATE: "[ui] clear tui state",
  SET_TRANSIENT_MESSAGE: "[ui] transient message",
  CLEAR_TRANSIENT_MESSAGE: "[ui] transient clear",
  SET_ERROR_MESSAGE: "[ui] set error banner",
  CLEAR_ERROR_MESSAGE: "[ui] error clear",
  CLEAR_BANNERS: "[ui] clear all banners",
  REQUEST_QUIT: "[ui] request quit",
  REQUEST_RENDER: "[ui] request render",
  SET_EDITOR_TEXT: "[ui] set editor text",
  SUBMIT_EDITOR_TEXT: "[ui] submit editor text",
  REQUEST_INTERRUPT: "[ui] request interrupt focused agent",
  SET_ENVIRONMENT: "[ui] set environment",
} as const;

type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

interface ActionDef<T extends ActionType, P> {
  readonly type: T,
  readonly payload: P,
}

const toggleThinking = createAction(ActionTypes.TOGGLE_THINKING);
const toggleToolCards = createAction(ActionTypes.TOGGLE_TOOL_CARDS);
const clearTuiState = createAction(ActionTypes.CLEAR_TUI_STATE);
const clearTransientMessage = createAction(ActionTypes.CLEAR_TRANSIENT_MESSAGE);
const clearErrorMessage = createAction(ActionTypes.CLEAR_ERROR_MESSAGE);
const clearBanners = createAction(ActionTypes.CLEAR_BANNERS);

// If parameters are <= 3, do not use object.
export const Actions = {
  receiveEvent: (event: AnyEventEnvelope) => createAction(ActionTypes.RECEIVE_EVENT, event),
	switchTeam: (identity: TeamInfo) => createAction(ActionTypes.SWITCH_TEAM, identity),
	toggleThinking: () => toggleThinking,
	toggleToolCards: () => toggleToolCards,
	switchCycleAgent: (direction: 1 | -1) => createAction(ActionTypes.SWITCH_CYCLE_AGENT, { direction }),
	clearTuiState: () => clearTuiState,
	setTransientMessage: (text: string) => createAction(ActionTypes.SET_TRANSIENT_MESSAGE, { text }),
	clearTransientMessage: () => clearTransientMessage,
	setErrorMessage: (text: string) => createAction(ActionTypes.SET_ERROR_MESSAGE, { text }),
	clearErrorMessage: () => clearErrorMessage,
	clearBanners: () => clearBanners,
	requestQuit: () => createAction(ActionTypes.REQUEST_QUIT),
	requestRender: () => createAction(ActionTypes.REQUEST_RENDER),
	setEditorText: (text: string) => createAction(ActionTypes.SET_EDITOR_TEXT, { text }),
	submitEditorText: (text: string) => createAction(ActionTypes.SUBMIT_EDITOR_TEXT, { text }),
	requestInterrupt: (teamId: string, agentKey: string) =>
		createAction(ActionTypes.REQUEST_INTERRUPT, { teamId, agentKey }),
	setEnvironment: (cwd: string, gitBranch: string, gitDirty: boolean) =>
		createAction(ActionTypes.SET_ENVIRONMENT, { cwd, gitBranch, gitDirty }),
} as const;

export type Action = ReturnType<typeof Actions[keyof typeof Actions]>;

function createAction<T extends ActionType>(type: T): ActionDef<T, undefined>;
function createAction<T extends ActionType, P>(type: T, payload: P): ActionDef<T, P>;
function createAction<T extends ActionType, P>(type: T, payload?: P): ActionDef<T, P | undefined> {
  return Object.freeze({ type, payload });
}
