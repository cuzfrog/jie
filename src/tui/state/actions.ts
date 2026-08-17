import type { AnyEventEnvelope, CommandResult, KanbanCard, McpServerSummary, QuestionAnswer, QuestionItem, TeamInfo } from "../../platform";
import type { AgentId, KanbanEditField } from "./state";

type InstalledTeams = CommandResult<"getTeamInfo">["installed"];

export const ActionTypes = {
  RECEIVE_EVENT: "[bus] receive event from event bus",
  SWITCH_TEAM: "[ui] switch team",
  SET_SESSION_NAME: "[ui] set session name",
  SET_INSTALLED_TEAMS: "[ui] set installed teams",
  TOGGLE_THINKING: "[ui] toggle thinking expanded",
  TOGGLE_TOOL_CARDS: "[ui] toggle tool cards expanded",
  SET_THINKING_EXPANDED: "[ui] set thinking expanded",
  SET_TOOL_CARDS_EXPANDED: "[ui] set tool cards expanded",
  SWITCH_CYCLE_AGENT: "[ui] switch and cycle focused agent",
  TOGGLE_TEAM_PANEL: "[ui] toggle team panel visibility",
  CYCLE_KANBAN_VIEW: "[ui] cycle kanban view",
  COMMIT_TEAM_CURSOR: "[ui] commit team cursor to focused agent",
  SET_TRANSIENT_MESSAGE: "[ui] transient message",
  CLEAR_TRANSIENT_MESSAGE: "[ui] transient clear",
  SET_ERROR_MESSAGE: "[ui] set error banner",
  CLEAR_ERROR_MESSAGE: "[ui] error clear",
  CLEAR_BANNERS: "[ui] clear all banners",
  REQUEST_QUIT: "[ui] request quit",
  REQUEST_RENDER: "[ui] request render",
  SET_EDITOR_TEXT: "[ui] set editor text",
  SET_EDITOR_CURSOR_AT_START: "[ui] set editor cursor at start",
  SUBMIT_EDITOR_TEXT: "[ui] submit editor text",
  REQUEST_INTERRUPT: "[ui] request interrupt focused agent",
  REQUEST_DEQUEUE: "[ui] request dequeue queued prompt",
  REQUEST_REQUEUE: "[ui] request requeue abandoned dequeued prompt",
  TERMINAL_FOCUS_GAINED: "[ui] terminal focus gained",
  TERMINAL_FOCUS_LOST: "[ui] terminal focus lost",
  SET_ENVIRONMENT: "[ui] set environment",
  SHOW_HELP: "[ui] toggle help panel",
  TOGGLE_MCP_PANEL: "[ui] toggle mcp panel",
  SET_MCP_SERVERS: "[ui] set mcp servers",
  SET_KANBAN_BOARD: "[ui] set kanban board",
  MOVE_KANBAN_CURSOR: "[ui] move kanban cursor",
  MOVE_KANBAN_EDIT_FIELD: "[ui] move kanban edit field",
  TOGGLE_KANBAN_EXPAND: "[ui] toggle kanban expanded",
  COMMIT_KANBAN_EDIT: "[ui] commit kanban card edit",
  CANCEL_KANBAN_EDIT: "[ui] cancel kanban card edit",
  SAVE_KANBAN_EDIT: "[ui] save kanban card edit",
  TOGGLE_KANBAN_TODO: "[ui] toggle kanban todo",
  SHOW_QUESTIONS: "[ui] show question panel",
  MOVE_QUESTION_CURSOR: "[ui] move question cursor",
  SELECT_QUESTION_OPTION_AND_ADVANCE: "[ui] select question option and advance",
  TOGGLE_QUESTION_OPTION: "[ui] toggle question option",
  START_QUESTION_OTHER_EDIT: "[ui] start question other edit",
  STOP_QUESTION_OTHER_EDIT: "[ui] stop question other edit",
  CONFIRM_QUESTION_OTHER: "[ui] confirm question other",
  NEXT_QUESTION: "[ui] next question",
  SUBMIT_QUESTION_ANSWERS: "[ui] submit question answers",
  CANCEL_QUESTION: "[ui] cancel question",
} as const;

type ActionType = (typeof ActionTypes)[keyof typeof ActionTypes];

interface ActionDef<T extends ActionType, P> {
  readonly type: T,
  readonly payload: P,
}

const toggleThinking = createAction(ActionTypes.TOGGLE_THINKING);
const toggleToolCards = createAction(ActionTypes.TOGGLE_TOOL_CARDS);
const toggleTeamPanel = createAction(ActionTypes.TOGGLE_TEAM_PANEL);
const cycleKanbanView = createAction(ActionTypes.CYCLE_KANBAN_VIEW);
const terminalFocusGained = createAction(ActionTypes.TERMINAL_FOCUS_GAINED);
const terminalFocusLost = createAction(ActionTypes.TERMINAL_FOCUS_LOST);
const commitTeamCursor = createAction(ActionTypes.COMMIT_TEAM_CURSOR);
const clearTransientMessage = createAction(ActionTypes.CLEAR_TRANSIENT_MESSAGE);
const clearErrorMessage = createAction(ActionTypes.CLEAR_ERROR_MESSAGE);
const clearBanners = createAction(ActionTypes.CLEAR_BANNERS);
const showHelp = createAction(ActionTypes.SHOW_HELP);
const toggleMcpPanel = createAction(ActionTypes.TOGGLE_MCP_PANEL);

// If parameters are <= 3, do not use object.
export const Actions = {
  receiveEvent: (event: AnyEventEnvelope) => createAction(ActionTypes.RECEIVE_EVENT, event),
	switchTeam: (identity: TeamInfo) => createAction(ActionTypes.SWITCH_TEAM, identity),
	setSessionName: (name: string | null) => createAction(ActionTypes.SET_SESSION_NAME, { name }),
	setInstalledTeams: (teams: InstalledTeams) => createAction(ActionTypes.SET_INSTALLED_TEAMS, { teams }),
	toggleThinking: () => toggleThinking,
	toggleToolCards: () => toggleToolCards,
	setThinkingExpanded: (expanded: boolean) => createAction(ActionTypes.SET_THINKING_EXPANDED, { expanded }),
	setToolCardsExpanded: (expanded: boolean) => createAction(ActionTypes.SET_TOOL_CARDS_EXPANDED, { expanded }),
	switchCycleAgent: (direction: 1 | -1) => createAction(ActionTypes.SWITCH_CYCLE_AGENT, { direction }),
	toggleTeamPanel: () => toggleTeamPanel,
	cycleKanbanView: () => cycleKanbanView,
	terminalFocusGained: () => terminalFocusGained,
	terminalFocusLost: () => terminalFocusLost,
	commitTeamCursor: () => commitTeamCursor,
	setTransientMessage: (text: string) => createAction(ActionTypes.SET_TRANSIENT_MESSAGE, { text }),
	clearTransientMessage: () => clearTransientMessage,
	setErrorMessage: (text: string) => createAction(ActionTypes.SET_ERROR_MESSAGE, { text }),
	clearErrorMessage: () => clearErrorMessage,
	clearBanners: () => clearBanners,
	requestQuit: () => createAction(ActionTypes.REQUEST_QUIT),
	requestRender: () => createAction(ActionTypes.REQUEST_RENDER),
	setEditorText: (text: string) => createAction(ActionTypes.SET_EDITOR_TEXT, { text }),
	setEditorCursorAtStart: (atStart: boolean) => createAction(ActionTypes.SET_EDITOR_CURSOR_AT_START, { atStart }),
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
	toggleMcpPanel: () => toggleMcpPanel,
	setMcpServers: (servers: ReadonlyArray<McpServerSummary>) => createAction(ActionTypes.SET_MCP_SERVERS, { servers }),
	setKanbanBoard: (board: ReadonlyArray<KanbanCard>) => createAction(ActionTypes.SET_KANBAN_BOARD, { board }),
	moveKanbanCursor: (direction: "up" | "down" | "left" | "right") => createAction(ActionTypes.MOVE_KANBAN_CURSOR, { direction }),
	moveKanbanEditField: (direction: "up" | "down") => createAction(ActionTypes.MOVE_KANBAN_EDIT_FIELD, { direction }),
	toggleKanbanExpand: () => createAction(ActionTypes.TOGGLE_KANBAN_EXPAND),
	commitKanbanEdit: (cardId: string, field: KanbanEditField = "content") => createAction(ActionTypes.COMMIT_KANBAN_EDIT, { cardId, field }),
	cancelKanbanEdit: () => createAction(ActionTypes.CANCEL_KANBAN_EDIT),
	saveKanbanEdit: (cardId: string, text: string, field: KanbanEditField = "content") => createAction(ActionTypes.SAVE_KANBAN_EDIT, { cardId, field, text }),
	toggleKanbanTodo: (cardId: string, todo: string) => createAction(ActionTypes.TOGGLE_KANBAN_TODO, { cardId, todo }),
	showQuestions: (requestId: string, agentId: AgentId, questions: ReadonlyArray<QuestionItem>) =>
		createAction(ActionTypes.SHOW_QUESTIONS, { requestId, agentId, questions }),
	moveQuestionCursor: (direction: "up" | "down") => createAction(ActionTypes.MOVE_QUESTION_CURSOR, { direction }),
	selectQuestionOptionAndAdvance: (optionIndex: number) =>
		createAction(ActionTypes.SELECT_QUESTION_OPTION_AND_ADVANCE, { optionIndex }),
	toggleQuestionOption: (optionIndex: number) => createAction(ActionTypes.TOGGLE_QUESTION_OPTION, { optionIndex }),
	startQuestionOtherEdit: () => createAction(ActionTypes.START_QUESTION_OTHER_EDIT),
	stopQuestionOtherEdit: () => createAction(ActionTypes.STOP_QUESTION_OTHER_EDIT),
	confirmQuestionOther: (text: string) => createAction(ActionTypes.CONFIRM_QUESTION_OTHER, { text }),
	nextQuestion: () => createAction(ActionTypes.NEXT_QUESTION),
	submitQuestionAnswers: (requestId: string, answers: ReadonlyArray<QuestionAnswer>) =>
		createAction(ActionTypes.SUBMIT_QUESTION_ANSWERS, { requestId, answers }),
	cancelQuestion: (requestId: string) => createAction(ActionTypes.CANCEL_QUESTION, { requestId }),
} as const;

export type Action = ReturnType<typeof Actions[keyof typeof Actions]>;

function createAction<T extends ActionType>(type: T): ActionDef<T, undefined>;
function createAction<T extends ActionType, P>(type: T, payload: P): ActionDef<T, P>;
function createAction<T extends ActionType, P>(type: T, payload?: P): ActionDef<T, P | undefined> {
  return Object.freeze({ type, payload });
}
