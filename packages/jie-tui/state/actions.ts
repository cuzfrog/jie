import type { AnyEventEnvelope, CommandResult, TeamInfo } from "@cuzfrog/jie-platform";

type InstalledTeams = CommandResult<"getTeamInfo">["installed"];

export const ActionTypes = {
  RECEIVE_EVENT: "[bus] receive event from event bus",
  SWITCH_TEAM: "[ui] switch team",
  SET_SESSION_NAME: "[ui] set session name",
  SET_INSTALLED_TEAMS: "[ui] set installed teams",
  TOGGLE_THINKING: "[ui] toggle thinking expanded",
  TOGGLE_TOOL_CARDS: "[ui] toggle tool cards expanded",
  SWITCH_CYCLE_AGENT: "[ui] switch and cycle focused agent",
  TOGGLE_TEAM_PANEL: "[ui] toggle team panel visibility",
  COMMIT_TEAM_CURSOR: "[ui] commit team cursor to focused agent",
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
  REQUEST_DEQUEUE: "[ui] request dequeue queued prompt",
  REQUEST_REQUEUE: "[ui] request requeue abandoned dequeued prompt",
  SET_ENVIRONMENT: "[ui] set environment",
  SHOW_HELP: "[ui] show help in the chat area",
} as const;

type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

interface ActionDef<T extends ActionType, P> {
  readonly type: T,
  readonly payload: P,
}

const toggleThinking = createAction(ActionTypes.TOGGLE_THINKING);
const toggleToolCards = createAction(ActionTypes.TOGGLE_TOOL_CARDS);
const toggleTeamPanel = createAction(ActionTypes.TOGGLE_TEAM_PANEL);
const commitTeamCursor = createAction(ActionTypes.COMMIT_TEAM_CURSOR);
const clearTuiState = createAction(ActionTypes.CLEAR_TUI_STATE);
const clearTransientMessage = createAction(ActionTypes.CLEAR_TRANSIENT_MESSAGE);
const clearErrorMessage = createAction(ActionTypes.CLEAR_ERROR_MESSAGE);
const clearBanners = createAction(ActionTypes.CLEAR_BANNERS);
const showHelp = createAction(ActionTypes.SHOW_HELP);

// If parameters are <= 3, do not use object.
export const Actions = {
  receiveEvent: (event: AnyEventEnvelope) => createAction(ActionTypes.RECEIVE_EVENT, event),
	switchTeam: (identity: TeamInfo) => createAction(ActionTypes.SWITCH_TEAM, identity),
	setSessionName: (name: string | null) => createAction(ActionTypes.SET_SESSION_NAME, { name }),
	setInstalledTeams: (teams: InstalledTeams) => createAction(ActionTypes.SET_INSTALLED_TEAMS, { teams }),
	toggleThinking: () => toggleThinking,
	toggleToolCards: () => toggleToolCards,
	switchCycleAgent: (direction: 1 | -1) => createAction(ActionTypes.SWITCH_CYCLE_AGENT, { direction }),
	toggleTeamPanel: () => toggleTeamPanel,
	commitTeamCursor: () => commitTeamCursor,
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
	requestDequeue: (teamId: string, agentKey: string, prompt: string) =>
		createAction(ActionTypes.REQUEST_DEQUEUE, { teamId, agentKey, prompt }),
	requestRequeue: (teamId: string, agentKey: string, prompt: string) =>
		createAction(ActionTypes.REQUEST_REQUEUE, { teamId, agentKey, prompt }),
	setEnvironment: (cwd: string, gitBranch: string, gitDirty: boolean, version: string) =>
		createAction(ActionTypes.SET_ENVIRONMENT, { cwd, gitBranch, gitDirty, version }),
	showHelp: () => showHelp,
} as const;

export type Action = ReturnType<typeof Actions[keyof typeof Actions]>;

function createAction<T extends ActionType>(type: T): ActionDef<T, undefined>;
function createAction<T extends ActionType, P>(type: T, payload: P): ActionDef<T, P>;
function createAction<T extends ActionType, P>(type: T, payload?: P): ActionDef<T, P | undefined> {
  return Object.freeze({ type, payload });
}
